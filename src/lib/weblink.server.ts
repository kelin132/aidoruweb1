import { getDb } from "./db.server";
import { users as aidoruUsers } from "./db.server";
import { issueSession } from "./auth.server";
import { syncBotDataByPhone } from "./botSync.server";

const WEB_LINK_COLLECTION = "web_link_codes";

function normalizeWhatsAppNumber(value = "") {
  return String(value || "")
    .replace(/[^\d]/g, "")
    .replace(/^00/, "");
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

  try {
    const { synced, aidoruUserId } = await syncBotDataByPhone(identifier);

    if (aidoruUserId) {
      await issueSession(String(aidoruUserId));
    }

    return { jid, synced };
  } catch (err) {
    console.error("weblink sync error:", err);
    return { jid, synced: false };
  }
}
