import { getDb, guilds, users, type GuildDoc } from "./db.server";
import { requireUser, toPublicUser } from "./auth.server";
import { BOT_MART_ITEMS } from "./martCatalog";
import {
  type LeaderboardMetric,
  type LeaderboardRow,
  type PublicGuild,
  type PublicUser,
  type ShopItem,
  type Rarity,
} from "./game";

const READ_ONLY_MESSAGE =
  "This portal is read-only. Use Kelin-MD2 in WhatsApp to change your account.";

function rarityForPrice(price: number): Rarity {
  if (price >= 10000) return "legend";
  if (price >= 2500) return "epic";
  if (price >= 800) return "rare";
  return "common";
}

export async function listShopItems(): Promise<ShopItem[]> {
  return BOT_MART_ITEMS.map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    category: item.category as ShopItem["category"],
    price: item.price,
    rarity: rarityForPrice(item.price),
    description: item.description,
    sprite: item.slug,
    emoji: item.emoji,
    page: item.page,
    index: item.index,
    imageUrl: item.imageUrl,
  }));
}

export async function getLiveSession(): Promise<PublicUser | null> {
  const user = await requireUser();
  return toPublicUser(user);
}

function guildToPublic(doc: GuildDoc, userId: string): PublicGuild {
  const id = String(doc._id ?? "");
  const members = Array.isArray(doc.members) ? doc.members : [];
  return {
    id,
    name: doc.name ?? "Unnamed guild",
    tag: (doc.name ?? "GUILD").slice(0, 5).toUpperCase(),
    description: doc.description ?? "",
    leaderId: doc.owner ?? "",
    memberCount: members.length,
    level: Number(doc.level) || 1,
    bank: Number(doc.treasury) || 0,
    isMember: members.includes(userId),
  };
}

export async function listGuilds(): Promise<PublicGuild[]> {
  const user = await requireUser();
  const docs = await (await guilds()).find({}).sort({ level: -1 }).limit(100).toArray();
  return docs.map((guild) => guildToPublic(guild, String(user._id)));
}

function rowFromUser(
  doc: Record<string, unknown>,
  metric: LeaderboardMetric,
  score: number,
  counts?: { pokemonCount?: number; cardCount?: number },
): LeaderboardRow {
  const title = String(doc["job"] ?? (doc["isPremium"] ? "Premium Player" : "Player"));
  return {
    id: String(doc["websiteId"] ?? doc["_id"] ?? ""),
    name: String(doc["name"] ?? "Player"),
    title,
    score,
    scoreLabel:
      metric === "xp"
        ? "XP"
        : metric === "coins"
          ? "COINS"
          : metric === "cards"
            ? "CARDS"
            : "POKÉMON",
    xp: Number(doc["xp"]) || 0,
    coins: Number(doc["money"]) || 0,
    avatarUrl: typeof doc["profilePictureUrl"] === "string" ? doc["profilePictureUrl"] : null,
    pokemonCount: counts?.pokemonCount ?? 0,
    cardCount: counts?.cardCount ?? 0,
  };
}

export async function leaderboard(metric: LeaderboardMetric = "xp"): Promise<LeaderboardRow[]> {
  const db = await getDb();
  const userCollection = await users();

  if (metric === "cards") {
    const cardDocs = await db
      .collection("mn_users")
      .find({ cards: { $exists: true } })
      .limit(200)
      .toArray();
    const ranked = cardDocs
      .map((doc) => ({
        jid: String(doc["whatsappNumber"] ?? doc["jid"] ?? ""),
        score: Array.isArray(doc["cards"]) ? doc["cards"].length : 0,
      }))
      .filter((entry) => entry.jid)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    const docs = await userCollection
      .find({ _id: { $in: ranked.map((entry) => entry.jid) }, registered: true } as never)
      .toArray();
    const byId = new Map(docs.map((doc) => [String(doc["_id"]), doc as Record<string, unknown>]));
    return ranked.flatMap((entry) => {
      const doc = byId.get(entry.jid);
      return doc ? [rowFromUser(doc, metric, entry.score, { cardCount: entry.score })] : [];
    });
  }

  if (metric === "pokemon") {
    const ranked = await db
      .collection("pokemon_owned")
      .aggregate([
        { $group: { _id: "$ownerJid", score: { $sum: 1 } } },
        { $sort: { score: -1 } },
        { $limit: 10 },
      ])
      .toArray();
    const ids = ranked.map((entry) => String(entry["_id"]));
    const docs = await userCollection
      .find({ _id: { $in: ids }, registered: true } as never)
      .toArray();
    const byId = new Map(docs.map((doc) => [String(doc["_id"]), doc as Record<string, unknown>]));
    return ranked.flatMap((entry) => {
      const jid = String(entry["_id"]);
      const doc = byId.get(jid);
      const score = Number(entry["score"]) || 0;
      return doc ? [rowFromUser(doc, metric, score, { pokemonCount: score })] : [];
    });
  }

  const sort: Record<string, 1 | -1> =
    metric === "coins" ? { money: -1, bank: -1, xp: -1 } : { xp: -1, money: -1 };
  const docs = await userCollection
    .find(
      { registered: true },
      {
        projection: {
          name: 1,
          websiteId: 1,
          xp: 1,
          money: 1,
          bank: 1,
          job: 1,
          isPremium: 1,
          profilePictureUrl: 1,
        },
      },
    )
    .sort(sort)
    .limit(10)
    .toArray();
  return docs.map((doc) =>
    rowFromUser(
      doc as Record<string, unknown>,
      metric,
      metric === "coins"
        ? (Number(doc["money"]) || 0) + (Number(doc["bank"]) || 0)
        : Number(doc["xp"]) || 0,
    ),
  );
}

export async function updateProfile(_input?: unknown): Promise<PublicUser> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function chooseStarter(_starterId?: string): Promise<PublicUser> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function claimDaily(): Promise<{ user: PublicUser; reward: number; streak: number }> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function buyItem(
  _input?: unknown,
): Promise<{ user: PublicUser; itemName: string; spent: number }> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function joinGuild(_guildId?: string): Promise<PublicUser> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function leaveGuild(): Promise<PublicUser> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function createGuild(_input?: unknown): Promise<PublicUser> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function playCoinFlip(
  _input?: unknown,
): Promise<{ user: PublicUser; result: "heads" | "tails"; won: boolean; delta: number }> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function playSlots(
  _input?: unknown,
): Promise<{ user: PublicUser; reels: string[]; delta: number; multiplier: number }> {
  throw new Error(READ_ONLY_MESSAGE);
}
