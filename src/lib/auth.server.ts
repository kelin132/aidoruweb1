import { SignJWT, jwtVerify } from "jose";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { linkCodes, users, guilds, type UserDoc } from "./db.server";
import { normalisePhone, type PublicUser } from "./game";

const COOKIE = "aidoru_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function secret(): Uint8Array {
  const value = process.env["SESSION_SECRET"];
  if (!value) throw new Error("SESSION_SECRET is not configured.");
  return new TextEncoder().encode(value);
}

function numberFromJid(value: unknown): string {
  const [beforeAt = ""] = String(value ?? "").split("@");
  const [beforeDevice = ""] = beforeAt.split(":");
  return beforeDevice.replace(/[^\d]/g, "");
}

function inventoryEntries(value: unknown) {
  if (!Array.isArray(value)) {
    if (value && typeof value === "object") {
      return Object.entries(value).map(([itemId, qty]) => ({
        itemId,
        qty: Number(qty) || 1,
      }));
    }
    return [];
  }
  return value.map((entry) => {
    if (typeof entry === "string") return { itemId: entry, qty: 1 };
    if (!entry || typeof entry !== "object") return { itemId: "unknown", qty: 1 };
    const item = entry as Record<string, unknown>;
    return {
      itemId: String(item["itemId"] ?? item["id"] ?? item["name"] ?? item["label"] ?? "unknown"),
      qty: Number(item["qty"] ?? item["quantity"] ?? item["count"] ?? item["amount"] ?? 1) || 1,
    };
  });
}

async function issueSession(jid: string) {
  const token = await new SignJWT({ sub: jid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());

  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSession() {
  deleteCookie(COOKIE, { path: "/" });
}

export async function currentUserId(): Promise<string | null> {
  const token = getCookie(COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function findUserById(id: string): Promise<UserDoc | null> {
  const col = await users();
  return col.findOne({ _id: id, registered: true } as never);
}

export async function requireUser(): Promise<UserDoc & { _id: string }> {
  const id = await currentUserId();
  if (!id) throw new Error("Not signed in.");
  const user = await findUserById(id);
  if (!user) throw new Error("Session expired. Run .linkweb in WhatsApp and sign in again.");
  return user as UserDoc & { _id: string };
}

export async function toPublicUser(doc: UserDoc): Promise<PublicUser> {
  const jid = String(doc._id);
  const guild = await (await guilds()).findOne({ members: jid } as never);
  const guildId = guild?._id ? String(guild._id) : null;
  const title = doc.job || (doc.isPremium ? "Premium Player" : "Player");

  return {
    id: jid,
    phoneNumber: `+${numberFromJid(jid)}`,
    name: doc.name ?? "Player",
    bio: doc.bio ?? "",
    title,
    avatar: "default",
    banner: "aurora",
    coins: Number(doc.money) || 0,
    bank: Number(doc.bank) || 0,
    xp: Number(doc.xp) || 0,
    inventory: inventoryEntries(doc.inventory),
    guildId,
    guildName: guild?.name ?? null,
    starter: null,
    starterChosen: false,
    dailyClaimedAt: null,
    streak: 0,
    onboarding: [],
  };
}

export async function loginUser(input: {
  phoneNumber: string;
  code: string;
}): Promise<PublicUser> {
  const phone = normalisePhone(input.phoneNumber).replace("+", "");
  const code = input.code.replace(/\D/g, "");
  if (phone.length < 8 || code.length !== 6) {
    throw new Error("Enter your WhatsApp number and the 6-digit code from .linkweb.");
  }

  const now = new Date();
  const codes = await linkCodes();
  const link = await codes.findOne({
    code,
    identifier: phone,
    usedAt: null,
    expiresAt: { $gt: now },
  } as never);
  if (!link) {
    throw new Error("That link code is invalid or expired. Run .linkweb in WhatsApp for a new code.");
  }

  const jid = String(link.jid ?? link.userId ?? "");
  const user = await findUserById(jid);
  if (!user || numberFromJid(user._id) !== phone) {
    throw new Error("We could not find a registered bot profile for that WhatsApp number.");
  }

  const consumed = await codes.findOneAndUpdate(
    { _id: link._id, usedAt: null, expiresAt: { $gt: now } } as never,
    { $set: { usedAt: now } },
    { returnDocument: "after" },
  );
  if (!consumed) throw new Error("That link code was already used. Run .linkweb for a new code.");

  await issueSession(jid);
  return toPublicUser(user);
}