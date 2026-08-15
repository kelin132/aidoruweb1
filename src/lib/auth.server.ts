import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { users, guilds, type UserDoc } from "./db.server";
import type { PublicUser } from "./game";

function deriveScrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(Buffer.from(derivedKey));
    });
  });
}
const COOKIE = "aidoru_session";
const MAX_AGE = 60 * 60 * 24 * 30;
const SCRYPT_MAXMEM = 32 * 1024 * 1024;

function secret(): Uint8Array {
  const value = process.env["SESSION_SECRET"];
  if (!value) throw new Error("SESSION_SECRET is not configured.");
  return new TextEncoder().encode(value);
}

function normaliseWebsiteId(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

async function verifyWebsitePassword(password: string, encodedHash: unknown): Promise<boolean> {
  if (typeof encodedHash !== "string") return false;
  const [algorithm, nText, rText, pText, saltHex, keyHex] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !saltHex || !keyHex) return false;

  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) {
    return false;
  }

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(keyHex, "hex");
    const actual = await deriveScrypt(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
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
  const numericId = Number(id);
  return col.findOne({
    registered: true,
    $or: [
      { _id: id },
      ...(Number.isSafeInteger(numericId) ? [{ _id: numericId }] : []),
    ],
  } as never);
}

export async function requireUser(): Promise<UserDoc & { _id: string }> {
  const id = await currentUserId();
  if (!id) throw new Error("Not signed in.");
  const user = await findUserById(id);
  if (!user) throw new Error("Session expired. Run .id and .wpw in WhatsApp, then sign in again.");
  return user as UserDoc & { _id: string };
}

export async function toPublicUser(doc: UserDoc): Promise<PublicUser> {
  const jid = String(doc._id);
  const guild = await (await guilds()).findOne({ members: jid } as never);
  const guildId = guild?._id ? String(guild._id) : null;
  const title = doc.job || (doc.isPremium ? "Premium Player" : "Player");

  return {
    // `id` remains the internal server-side key used by guild and leaderboard logic.
    // `websiteId` is the user-facing identifier shown and entered on AIDORU.
    id: jid,
    websiteId: String(doc.websiteId ?? ""),
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

export async function loginUser(input: { websiteId: string; password: string }): Promise<PublicUser> {
  const websiteId = normaliseWebsiteId(input.websiteId);
  const password = input.password;
  if (websiteId.length < 8 || websiteId.length > 32 || password.length < 8 || password.length > 128) {
    throw new Error("Enter your AIDORU ID and the password you set with .wpw.");
  }

  const user = await (await users()).findOne({
    registered: true,
    websiteId,
  } as never);
  if (!user || !(await verifyWebsitePassword(password, user.websitePasswordHash))) {
    throw new Error("Invalid AIDORU ID or password.");
  }

  await issueSession(String(user._id));
  return toPublicUser(user);
}
