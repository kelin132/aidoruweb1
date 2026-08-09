import { getDb } from "./db.server";
import { users as aidoruUsers } from "./db.server";
import { issueSession } from "./auth.server";
import bcrypt from "bcryptjs";

const WEB_LINK_COLLECTION = "web_link_codes";

function normalizeWhatsAppNumber(value = "") {
  return String(value || "")
    .replace(/[^\d]/g, "")
    .replace(/^00/, "");
}

function uidFromJid(jid = "") {
  return String(jid || "").split("@")[0].split(":")[0];
}

async function findBotUser(db, jid, identifier) {
  const candidates = ["users", "mn_users", "dbz_players", "dbz_fighters", "mn_users"];
  for (const name of candidates) {
    try {
      const col = db.collection(name);
      const doc = await col.findOne({
        $or: [
          { jid },
          { userId: uidFromJid(jid) },
          { whatsappNumber: jid },
          { whatsapp: identifier },
          { identifier },
          { userId: identifier },
        ],
      });
      if (doc) return { doc, colName: name };
    } catch (err) {
      // ignore missing collection
    }
  }
  return null;
}

function mapBotDocToAidoru(botDoc) {
  if (!botDoc) return {};
  // pick coin field from many possible names
  const coins = botDoc.money ?? botDoc.zeni ?? botDoc.coins ?? botDoc.balance ?? botDoc.wallet ?? 0;
  const bank = botDoc.bank ?? botDoc.vault ?? 0;
  const xp = botDoc.xp ?? 0;
  const name = botDoc.name ?? botDoc.username ?? botDoc.displayName ?? null;
  const inventory = botDoc.inventory ?? botDoc.cards ?? [];
  return { coins, bank, xp, name, inventory };
}

export async function lookupPairingCode(input: { phone: string }) {
  const phone = input?.phone ?? "";
  if (!phone) throw new Error("phone is required");

  const identifier = normalizeWhatsAppNumber(phone);
  if (!identifier) throw new Error("invalid phone");

  const db = await getDb();
  const col = db.collection(WEB_LINK_COLLECTION);
  const now = new Date();

  const doc = await col.findOne({
    expiresAt: { $gt: now },
    usedAt: null,
    $or: [
      { identifier },
      { whatsapp: identifier },
      { userId: { $regex: identifier } },
      { jid: { $regex: identifier } },
    ],
  });

  if (!doc) throw new Error("No active pairing code found");

  return { code: doc.code, expiresAt: doc.expiresAt };
}

export async function consumePairingCode(input: { phone: string; code: string }) {
  const phone = input?.phone ?? "";
  const code = input?.code ?? "";
  if (!phone || !code) throw new Error("phone and code are required");

  const identifier = normalizeWhatsAppNumber(phone);
  const db = await getDb();
  const col = db.collection(WEB_LINK_COLLECTION);
  const now = new Date();

  const result = await col.findOneAndUpdate(
    {
      code,
      identifier,
      expiresAt: { $gt: now },
      usedAt: null,
    },
    { $set: { usedAt: now } },
    { returnDocument: "after" as const },
  );

  if (!result.value) {
    throw new Error("invalid or expired code");
  }

  const jid = result.value.jid;

  // Attempt to locate the user's data in the bot database and sync it into aidoru's users collection
  try {
    const found = await findBotUser(db, jid, identifier);
    let synced = false;
    let aidoruUserId = null;

    const aidoruCol = await aidoruUsers();
    const existing = await aidoruCol.findOne({ phoneNumber: identifier });

    if (found) {
      const botDoc = found.doc;
      const mapped = mapBotDocToAidoru(botDoc);

      if (existing) {
        // Update existing aidoru user with values from the bot where applicable
        const updates: any = {};
        if (typeof mapped.coins === "number") updates.coins = mapped.coins;
        if (typeof mapped.bank === "number") updates.bank = mapped.bank;
        if (typeof mapped.xp === "number") updates.xp = mapped.xp;
        if (mapped.name) updates.name = mapped.name.slice(0, 32);
        if (Array.isArray(mapped.inventory)) updates.inventory = mapped.inventory;

        if (Object.keys(updates).length) {
          await aidoruCol.updateOne({ _id: existing._id }, { $set: updates });
        }
        aidoruUserId = existing._id;
        synced = true;
      } else {
        // Create a new aidoru user seeded from bot's data
        const rand = Math.random().toString(36).slice(2);
        const passwordHash = await bcrypt.hash(rand, 10);
        const doc: any = {
          phoneNumber: identifier,
          passwordHash,
          name: mapped.name ? mapped.name.slice(0, 32) : "Trainer",
          bio: "",
          title: "Rookie Trainer",
          avatar: "default",
          banner: "aurora",
          coins: mapped.coins ?? 0,
          bank: mapped.bank ?? 0,
          xp: mapped.xp ?? 0,
          inventory: Array.isArray(mapped.inventory) ? mapped.inventory : [],
          guildId: null,
          starter: null,
          starterChosen: false,
          dailyClaimedAt: null,
          streak: 0,
          onboarding: [],
          createdAt: new Date(),
        };
        const r = await aidoruCol.insertOne(doc);
        aidoruUserId = r.insertedId;
        synced = true;
      }
    }

    // Issue a session for the aidoru user if we have an id (logs them in)
    if (aidoruUserId) {
      await issueSession(String(aidoruUserId));
    }

    return { jid, synced };
  } catch (err) {
    console.error("weblink sync error:", err);
    // Even if sync fails, return the jid so the client can at least identify the account
    return { jid, synced: false };
  }
}
