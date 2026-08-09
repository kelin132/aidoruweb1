import { getDb } from "./db.server";
import { users as aidoruUsers } from "./db.server";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";

function normalizeWhatsAppNumber(value = "") {
  return String(value || "")
    .replace(/[^\d]/g, "")
    .replace(/^00/, "");
}

function uidFromJid(jid = "") {
  return String(jid || "").split("@")[0].split(":")[0];
}

async function findBotUser(db, jid, identifier) {
  const candidates = ["users", "mn_users", "dbz_players", "dbz_fighters", "mn_users", "mn_users"];
  for (const name of candidates) {
    try {
      const col = db.collection(name);
      const doc = await col.findOne({
        $or: [
          { jid },
          { userId: uidFromJid(jid) },
          { whatsappNumber: identifier },
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
  const coins = botDoc.money ?? botDoc.zeni ?? botDoc.coins ?? botDoc.balance ?? botDoc.wallet ?? 0;
  const bank = botDoc.bank ?? botDoc.vault ?? 0;
  const xp = botDoc.xp ?? 0;
  const name = botDoc.name ?? botDoc.username ?? botDoc.displayName ?? null;
  const inventory = botDoc.inventory ?? botDoc.cards ?? [];
  return { coins, bank, xp, name, inventory };
}

/**
 * Sync bot data into the Aidoru users collection by phone or jid.
 * - phone: user-entered phone string (any format)
 * - aidoruUserId: optional existing site user id (string) to prefer updating
 * Returns { synced: boolean, aidoruUserId?: string }
 */
export async function syncBotDataByPhone(phone, aidoruUserId = null) {
  if (!phone) throw new Error("phone is required");
  const identifier = normalizeWhatsAppNumber(phone);
  if (!identifier) throw new Error("invalid phone");

  const db = await getDb();
  // Best-effort: try to locate a jid in web_link_codes that matches identifier
  let jid = null;
  try {
    const codeCol = db.collection("web_link_codes");
    const link = await codeCol.findOne({ identifier });
    if (link?.jid) jid = link.jid;
  } catch {
    // ignore
  }

  // Try searching bot collections using jid (if available) or identifier
  const found = await findBotUser(db, jid ?? "", identifier);
  if (!found) return { synced: false };
  const botDoc = found.doc;
  const mapped = mapBotDocToAidoru(botDoc);

  const aidoruCol = await aidoruUsers();

  // If aidoruUserId provided, try to find that user; otherwise find by phone
  let siteUser = null;
  if (aidoruUserId) {
    try {
      siteUser = await aidoruCol.findOne({ _id: new ObjectId(aidoruUserId) } as any);
    } catch {
      siteUser = null;
    }
  }
  if (!siteUser) {
    siteUser = await aidoruCol.findOne({ phoneNumber: identifier });
  }

  if (siteUser) {
    const updates: any = {};
    if (typeof mapped.coins === "number") updates.coins = mapped.coins;
    if (typeof mapped.bank === "number") updates.bank = mapped.bank;
    if (typeof mapped.xp === "number") updates.xp = mapped.xp;
    if (mapped.name) updates.name = mapped.name.slice(0, 32);
    if (Array.isArray(mapped.inventory)) updates.inventory = mapped.inventory;

    if (Object.keys(updates).length) {
      await aidoruCol.updateOne({ _id: siteUser._id }, { $set: updates });
    }

    return { synced: true, aidoruUserId: String(siteUser._id) };
  }

  // create a new site user seeded from bot data
  const rand = Math.random().toString(36).slice(2);
  const passwordHash = await bcrypt.hash(rand, 10);
  const newDoc = {
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
  const r = await aidoruCol.insertOne(newDoc as any);
  return { synced: true, aidoruUserId: String(r.insertedId) };
}
