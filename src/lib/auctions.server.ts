import { ObjectId } from "mongodb";
import {
  getDb,
  withMongoTransaction,
  type AuctionBidDoc,
  type UserDoc,
  type WebAuctionDoc,
} from "./db.server";
import { requireUser } from "./auth.server";

const ROUND_SIZE = 6;
const TIER_NUMBER = {
  Common: "1",
  Uncommon: "2",
  Rare: "3",
  Epic: "4",
  Legendary: "5",
  Mythical: "6",
  Secret: "S",
} as const;
const IMAGE_MAX_BYTES = 1_250_000;

type AuctionInput = {
  name: string;
  series: string;
  tier: keyof typeof TIER_NUMBER;
  startingBid: number;
  durationMinutes: number;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  imageBase64: string;
};

function identityVariants(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const withoutDevice = raw.replace(/:\d+(?=@)/, "");
  const [bare = withoutDevice, domain = "s.whatsapp.net"] = withoutDevice.split("@");
  const digits = bare.replace(/\D/g, "");
  return [
    ...new Set(
      [
        raw,
        withoutDevice,
        bare,
        `${bare}@${domain}`,
        ...(digits ? [digits, `+${digits}`] : []),
        ...(domain === "s.whatsapp.net" && digits
          ? [`${digits}@c.us`, `${digits}:0@s.whatsapp.net`]
          : []),
      ].filter(Boolean),
    ),
  ];
}

function identityValues(user: Partial<UserDoc>): string[] {
  return [
    user._id,
    user.userId,
    user.phoneNumber,
    user.phone,
    user.whatsappNumber,
    user.whatsappId,
    user.whatsappJid,
    user.jid,
    user.userJid,
    user.sender,
  ]
    .filter((value): value is NonNullable<typeof value> => value !== undefined && value !== null)
    .map(String)
    .filter(Boolean);
}

function identityFilter(ids: unknown[]) {
  const variants = [...new Set(ids.flatMap(identityVariants))];
  if (!variants.length) return { _id: "__missing_identity__" };
  return {
    $or: [
      { _id: { $in: variants } },
      { userId: { $in: variants } },
      { phoneNumber: { $in: variants } },
      { phone: { $in: variants } },
      { whatsappNumber: { $in: variants } },
      { whatsappId: { $in: variants } },
      { whatsappJid: { $in: variants } },
      { jid: { $in: variants } },
      { userJid: { $in: variants } },
      { sender: { $in: variants } },
      { owner: { $in: variants } },
    ],
  };
}

function sameUser(left: unknown, right: unknown): boolean {
  const rightVariants = new Set(identityVariants(right));
  return identityVariants(left).some((variant) => rightVariants.has(variant));
}

function displayName(user: Partial<UserDoc>): string {
  return String(user.name || user.username || user.pushName || user.notifyName || "Trainer");
}

function phoneDigits(user: Partial<UserDoc>): string {
  const values = identityValues(user);
  for (const value of values) {
    const digits = value.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") ?? "";
    if (digits.length >= 5) return digits;
  }
  return "";
}

function canManageAuctions(user: Partial<UserDoc>): boolean {
  if (Number(user.staffLevel ?? 0) >= 3) return true;
  const configuredDigits = String(
    process.env["AUCTION_ADMIN_PHONE"] || process.env["OWNER_NUMBER"] || "",
  ).replace(/\D/g, "");
  return Boolean(
    configuredDigits &&
    identityValues(user).some(
      (value) => value.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") === configuredDigits,
    ),
  );
}

async function requireAuctionAdmin(): Promise<UserDoc & { _id: string }> {
  const user = await requireUser();
  if (!canManageAuctions(user))
    throw new Error("Only the auction owner or a level-3 admin can manage auctions.");
  return user;
}

function publicBid(bid: AuctionBidDoc) {
  return {
    userName: String(bid.userName || "Trainer"),
    amount: Math.max(0, Number(bid.amount) || 0),
    active: bid.active === true,
    updatedAt: new Date(bid.updatedAt).toISOString(),
  };
}

function publicAuction(doc: WebAuctionDoc) {
  const topBid = doc.topBid ? publicBid(doc.topBid) : null;
  return {
    id: String(doc._id ?? ""),
    cardId: doc.cardId,
    name: doc.name,
    tier: doc.tier,
    tierNum: doc.tierNum,
    series: doc.series,
    media: doc.media,
    startingBid: Number(doc.startingBid) || 0,
    durationMinutes: Number(doc.durationMinutes) || 15,
    status: doc.status,
    topBid,
    bidders: (Array.isArray(doc.bids) ? doc.bids : [])
      .map(publicBid)
      .sort(
        (left, right) => right.amount - left.amount || left.userName.localeCompare(right.userName),
      ),
    endsAt: doc.endsAt ? new Date(doc.endsAt).toISOString() : null,
    endedAt: doc.endedAt ? new Date(doc.endedAt).toISOString() : null,
    winnerName: doc.winnerName ?? null,
    winningBid: Number(doc.winningBid) || 0,
    ownerName: doc.ownerName,
  };
}

const settlementTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSettlement(doc: WebAuctionDoc): void {
  if (doc.status !== "live" || !doc.endsAt || !doc._id) return;
  const id = String(doc._id);
  const previous = settlementTimers.get(id);
  if (previous) clearTimeout(previous);
  const delay = Math.max(0, new Date(doc.endsAt).getTime() - Date.now());
  const timer = setTimeout(
    () => {
      void settleExpiredAuction(id)
        .catch((error) => console.error("[auctions] settlement failed:", error))
        .finally(() => settlementTimers.delete(id));
    },
    Math.min(delay, 2_147_000_000),
  );
  settlementTimers.set(id, timer);
}

function newOwnedCard(doc: WebAuctionDoc, winnerId: string, winnerName: string, paid: number) {
  const id = String(doc._id ?? "");
  return {
    cardId: doc.cardId,
    name: doc.name,
    tier: doc.tier,
    tierNum: doc.tierNum,
    index: null,
    spawnId: `web-auction-${id}`,
    price: paid,
    series: doc.series,
    media: doc.media,
    mediaType: doc.mediaType || "image",
    obtainedAt: new Date().toISOString(),
    ownerId: winnerId,
    ownerName: winnerName,
  };
}

async function settleExpiredAuction(auctionId: string): Promise<boolean> {
  if (!ObjectId.isValid(auctionId)) return false;
  const objectId = new ObjectId(auctionId);
  const now = new Date();
  const settled = await withMongoTransaction(async (db, session) => {
    const auctions = db.collection<WebAuctionDoc>("mn_web_auctions");
    const users = db.collection<UserDoc>("users");
    const cardUsers = db.collection("mn_users");
    const auction = await auctions.findOne(
      { _id: objectId, status: "live", endsAt: { $lte: now } } as never,
      { session },
    );
    if (!auction) return false;

    const winningBid = auction.topBid;
    let winnerName: string | null = null;
    if (winningBid) {
      const winner = await users.findOne(identityFilter([winningBid.userId]) as never, { session });
      const seller = await users.findOne(identityFilter([auction.ownerId]) as never, { session });
      if (!winner || !seller)
        throw new Error("The winner or auction owner account could not be found.");
      winnerName = displayName(winner);

      const sellerCredit = await users.updateOne(
        { _id: seller._id } as never,
        {
          $inc: { money: winningBid.amount },
          $push: {
            history: {
              $each: [
                {
                  type: "auction_sold",
                  amount: winningBid.amount,
                  desc: `Auction sold: ${auction.name}`,
                  ts: now.getTime(),
                },
              ],
              $slice: -10,
            },
          },
        } as never,
        { session },
      );
      if (sellerCredit.modifiedCount !== 1)
        throw new Error("The auction owner wallet could not be credited.");

      const winnerIdentity = identityValues(winner);
      const ownedCard = newOwnedCard(auction, String(winner._id), winnerName, winningBid.amount);
      const cardUser = await cardUsers.findOne(identityFilter(winnerIdentity) as never, {
        session,
      });
      if (cardUser?._id !== undefined) {
        const added = await cardUsers.updateOne(
          { _id: cardUser._id } as never,
          { $push: { cards: ownedCard }, $inc: { totalCards: 1 } } as never,
          { session },
        );
        if (added.modifiedCount !== 1)
          throw new Error("The winner's card collection could not be updated.");
      } else {
        const digits = phoneDigits(winner);
        const canonicalJid = digits ? `${digits}@s.whatsapp.net` : String(winner._id);
        await cardUsers.insertOne(
          {
            userId: digits || canonicalJid.split("@")[0],
            whatsappNumber: canonicalJid,
            username: winnerName,
            cards: [ownedCard],
            totalCards: 1,
          } as never,
          { session },
        );
      }
    }

    const update = await auctions.updateOne(
      { _id: objectId, status: "live", endsAt: { $lte: now } } as never,
      {
        $set: {
          status: "ended",
          endedAt: now,
          winnerId: winningBid?.userId ?? null,
          winnerName,
          winningBid: winningBid?.amount ?? 0,
        },
      } as never,
      { session },
    );
    if (update.modifiedCount !== 1) throw new Error("This auction was settled by another request.");
    return true;
  });

  if (settled) settlementTimers.delete(auctionId);
  return settled;
}

async function settleExpiredAuctions(): Promise<void> {
  const now = new Date();
  const expired = await (
    await getDb()
  )
    .collection<WebAuctionDoc>("mn_web_auctions")
    .find({ status: "live", endsAt: { $lte: now } } as never)
    .project({ _id: 1 } as never)
    .limit(30)
    .toArray();
  for (const auction of expired) {
    await settleExpiredAuction(String(auction["_id"]));
  }
}

export async function getAuctionBoard() {
  const user = await requireUser();
  await settleExpiredAuctions();
  const db = await getDb();
  const collection = db.collection<WebAuctionDoc>("mn_web_auctions");
  const live = await collection
    .find({ status: "live" } as never)
    .sort({ endsAt: 1 })
    .limit(60)
    .toArray();
  for (const auction of live) scheduleSettlement(auction);
  const upcoming = await collection
    .find({ status: "upcoming" } as never)
    .sort({ createdAt: 1 })
    .limit(250)
    .toArray();
  const ended = await collection
    .find({ status: "ended" } as never)
    .sort({ endedAt: -1 })
    .limit(18)
    .toArray();

  return {
    live: live.map(publicAuction),
    upcoming: upcoming.map(publicAuction),
    ended: ended.map(publicAuction),
    canManage: canManageAuctions(user),
  };
}

export async function createUpcomingAuctionCard(input: AuctionInput) {
  const owner = await requireAuctionAdmin();
  const image = Buffer.from(input.imageBase64, "base64");
  if (image.length < 100 || image.length > IMAGE_MAX_BYTES) {
    throw new Error("Card artwork must be a valid image under 1.25 MB after compression.");
  }
  const db = await getDb();
  const assetId = new ObjectId();
  const auctionId = new ObjectId();
  const mediaOrigin = String(process.env["PUBLIC_APP_URL"] || "https://aidoru.zone.id").replace(
    /\/+$/,
    "",
  );
  const media = `${mediaOrigin}/auction-media/${assetId.toHexString()}`;
  const cardId = `AUC-${auctionId.toHexString().slice(-8).toUpperCase()}`;

  await withMongoTransaction(async (transactionDb, session) => {
    await transactionDb.collection("mn_web_auction_assets").insertOne(
      {
        _id: assetId,
        contentType: input.contentType,
        imageBase64: image.toString("base64"),
        createdAt: new Date(),
      },
      { session },
    );
    await transactionDb.collection<WebAuctionDoc>("mn_web_auctions").insertOne(
      {
        _id: auctionId,
        cardId,
        name: input.name,
        tier: input.tier,
        tierNum: TIER_NUMBER[input.tier],
        series: input.series,
        media,
        mediaType: "image",
        price: input.startingBid,
        ownerId: String(owner._id),
        ownerName: displayName(owner),
        startingBid: input.startingBid,
        durationMinutes: input.durationMinutes,
        status: "upcoming",
        bids: [],
        topBid: null,
        createdAt: new Date(),
      },
      { session },
    );
  });

  return { ok: true, cardId };
}

export async function startUpcomingAuctionBatch() {
  await requireAuctionAdmin();
  const startedAt = new Date();
  const started = await withMongoTransaction(async (db, session) => {
    const auctions = db.collection<WebAuctionDoc>("mn_web_auctions");
    const upcoming = await auctions
      .find({ status: "upcoming" } as never, { session })
      .sort({ createdAt: 1 })
      .limit(ROUND_SIZE)
      .toArray();
    if (upcoming.length !== ROUND_SIZE) {
      throw new Error(
        `Add ${ROUND_SIZE - upcoming.length} more upcoming card${ROUND_SIZE - upcoming.length === 1 ? "" : "s"} before starting a six-card round.`,
      );
    }

    const activeDocs: WebAuctionDoc[] = [];
    for (const card of upcoming) {
      const endsAt = new Date(startedAt.getTime() + card.durationMinutes * 60_000);
      const result = await auctions.updateOne(
        { _id: card._id, status: "upcoming" } as never,
        {
          $set: {
            status: "live",
            startedAt,
            endsAt,
            bids: [],
            topBid: null,
          },
        } as never,
        { session },
      );
      if (result.modifiedCount !== 1)
        throw new Error(
          "A queued card changed before the round could start. Refresh and try again.",
        );
      activeDocs.push({ ...card, status: "live", startedAt, endsAt, bids: [], topBid: null });
    }
    return activeDocs;
  });

  for (const auction of started) scheduleSettlement(auction);
  return { ok: true, started: started.length };
}

export async function placeWebAuctionBid(auctionId: string, amount: number) {
  const bidder = await requireUser();
  if (!ObjectId.isValid(auctionId)) throw new Error("This auction card could not be found.");
  const objectId = new ObjectId(auctionId);
  const bidderId = String(bidder._id);
  const bidderName = displayName(bidder);
  const bidderIds = identityValues(bidder);
  const now = new Date();

  const result = await withMongoTransaction(async (db, session) => {
    const auctions = db.collection<WebAuctionDoc>("mn_web_auctions");
    const users = db.collection<UserDoc>("users");
    const auction = await auctions.findOne({ _id: objectId, status: "live" } as never, { session });
    if (!auction) throw new Error("This auction is no longer live.");
    if (!auction.endsAt || new Date(auction.endsAt).getTime() <= now.getTime()) {
      throw new Error("The timer has ended. Refresh the auction board to see the winner.");
    }
    if (sameUser(bidderIds[0], auction.ownerId))
      throw new Error("You can't bid on your own auction card.");

    const previousLeader = auction.topBid;
    const ownBid = (Array.isArray(auction.bids) ? auction.bids : []).find(
      (bid) => bid.active && sameUser(bid.userId, bidderId),
    );
    const minimum = Math.max(auction.startingBid, (previousLeader?.amount ?? 0) + 1);
    if (!Number.isSafeInteger(amount) || amount < minimum) {
      throw new Error(`Your bid must be at least ${minimum.toLocaleString()} coins.`);
    }

    const bidderDoc = await users.findOne(identityFilter(bidderIds) as never, { session });
    if (!bidderDoc) throw new Error("Your wallet could not be found.");
    const debitAmount = amount - (ownBid?.amount ?? 0);
    const debit = await users.updateOne(
      { _id: bidderDoc._id, money: { $gte: debitAmount } } as never,
      {
        $inc: { money: -debitAmount },
        $push: {
          history: {
            $each: [
              {
                type: "auction_bid",
                amount: -debitAmount,
                desc: `Bid on auction: ${auction.name}`,
                ts: now.getTime(),
              },
            ],
            $slice: -10,
          },
        },
      } as never,
      { session },
    );
    if (!debit.modifiedCount) throw new Error("Not enough coins in your wallet for this bid.");

    const bids = (Array.isArray(auction.bids) ? auction.bids : []).map((bid) => ({
      ...bid,
      ...(previousLeader &&
      !sameUser(previousLeader.userId, bidderId) &&
      sameUser(bid.userId, previousLeader.userId)
        ? { active: false }
        : {}),
    }));
    const ownIndex = bids.findIndex((bid) => sameUser(bid.userId, bidderId));
    const nextBid: AuctionBidDoc = {
      userId: bidderId,
      userName: bidderName,
      amount,
      active: true,
      updatedAt: now,
    };
    if (ownIndex >= 0) bids[ownIndex] = nextBid;
    else bids.push(nextBid);

    if (previousLeader && !sameUser(previousLeader.userId, bidderId)) {
      const previousUser = await users.findOne(identityFilter([previousLeader.userId]) as never, {
        session,
      });
      if (!previousUser)
        throw new Error("The previous highest bidder's wallet could not be found.");
      const refund = await users.updateOne(
        { _id: previousUser._id } as never,
        {
          $inc: { money: previousLeader.amount },
          $push: {
            history: {
              $each: [
                {
                  type: "auction_outbid",
                  amount: previousLeader.amount,
                  desc: `Outbid on auction: ${auction.name}`,
                  ts: now.getTime(),
                },
              ],
              $slice: -10,
            },
          },
        } as never,
        { session },
      );
      if (!refund.modifiedCount) throw new Error("The previous bid could not be refunded.");
    }

    const updated = await auctions.updateOne(
      { _id: objectId, status: "live", endsAt: { $gt: now } } as never,
      { $set: { bids, topBid: nextBid, updatedAt: now } } as never,
      { session },
    );
    if (!updated.modifiedCount)
      throw new Error("This auction just ended or changed. Refresh and try again.");
    return { ok: true, amount, balance: Math.max(0, Number(bidderDoc.money ?? 0) - debitAmount) };
  });

  return result;
}
