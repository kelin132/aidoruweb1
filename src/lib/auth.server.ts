import { SignJWT, jwtVerify } from "jose";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { users, guilds, type UserDoc } from "./db.server";
import { STARTING_COINS, normalisePhone, type PublicUser } from "./game";
import { syncBotDataByPhone } from "./botSync.server";

const COOKIE = "aidoru_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function secret(): Uint8Array {
  const value = process.env["AIDORU_JWT_SECRET"];
  if (!value) throw new Error("AIDORU_JWT_SECRET is not configured.");
  return new TextEncoder().encode(value);
}

export async function issueSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());

  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
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
  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    return null;
  }
  const col = await users();
  return col.findOne({ _id: oid } as never);
}

export async function requireUser(): Promise<UserDoc & { _id: ObjectId }> {
  const id = await currentUserId();
  if (!id) throw new Error("Not signed in.");
  const user = await findUserById(id);
  if (!user) throw new Error("Session expired. Please sign in again.");
  return user as UserDoc & { _id: ObjectId };
}

export async function toPublicUser(doc: UserDoc): Promise<PublicUser> {
  let guildName: string | null = null;
  if (doc.guildId) {
    try {
      const col = await guilds();
      const guild = await col.findOne({ _id: new ObjectId(doc.guildId) } as never);
      guildName = guild?.name ?? null;
    } catch {
      guildName = null;
    }
  }
  return {
    id: String(doc._id),
    phoneNumber: doc.phoneNumber,
    name: doc.name ?? "Trainer",
    bio: doc.bio ?? "",
    title: doc.title ?? "Rookie Trainer",
    avatar: doc.avatar ?? "default",
    banner: doc.banner ?? "aurora",
    coins: doc.coins ?? 0,
    bank: doc.bank ?? 0,
    xp: doc.xp ?? 0,
    inventory: Array.isArray(doc.inventory) ? doc.inventory : [],
    guildId: doc.guildId ?? null,
    guildName,
    starter: doc.starter ?? null,
    starterChosen: Boolean(doc.starterChosen),
    dailyClaimedAt: doc.dailyClaimedAt ? new Date(doc.dailyClaimedAt).toISOString() : null,
    streak: doc.streak ?? 0,
    onboarding: Array.isArray(doc.onboarding) ? doc.onboarding : [],
  };
}

export async function registerUser(input: {
  phoneNumber: string;
  password: string;
  name: string;
}): Promise<PublicUser> {
  const phone = normalisePhone(input.phoneNumber);
  if (phone.length < 8) throw new Error("Enter a valid phone number with country code.");
  if (input.password.length < 6) throw new Error("Password must be at least 6 characters.");

  const col = await users();
  const existing = await col.findOne({ phoneNumber: phone });
  if (existing) throw new Error("That phone number is already registered. Try signing in.");

  const doc: UserDoc = {
    phoneNumber: phone,
    passwordHash: await bcrypt.hash(input.password, 10),
    name: input.name.trim().slice(0, 32) || "Trainer",
    bio: "",
    title: "Rookie Trainer",
    avatar: "default",
    banner: "aurora",
    coins: STARTING_COINS,
    bank: 0,
    xp: 0,
    inventory: [],
    guildId: null,
    starter: null,
    starterChosen: false,
    dailyClaimedAt: null,
    streak: 0,
    onboarding: [],
    createdAt: new Date(),
  };

  const result = await col.insertOne(doc as never);
  await issueSession(String(result.insertedId));

  // try to sync bot data (seed or update this newly created user)
  try {
    await syncBotDataByPhone(phone, String(result.insertedId));
  } catch (err) {
    console.warn("Bot->Aidoru sync on register failed:", err);
  }

  return toPublicUser({ ...doc, _id: result.insertedId });
}

export async function loginUser(input: {
  phoneNumber: string;
  password: string;
}): Promise<PublicUser> {
  const phone = normalisePhone(input.phoneNumber);
  const col = await users();
  const doc = await col.findOne({ phoneNumber: phone });
  if (!doc) throw new Error("No account found for that phone number.");

  const stored = doc.passwordHash ?? "";
  const isHashed = /^\$2[aby]\$/.test(stored);
  const ok = isHashed ? await bcrypt.compare(input.password, stored) : stored === input.password;
  if (!ok) throw new Error("Incorrect password.");

  // Upgrade legacy plaintext passwords written by the bot.
  if (!isHashed && stored) {
    await col.updateOne(
      { _id: doc._id } as never,
      { $set: { passwordHash: await bcrypt.hash(input.password, 10) } },
    );
  }

  await issueSession(String(doc._id));

  // attempt to sync bot data on login
  try {
    await syncBotDataByPhone(phone, String(doc._id));
  } catch (err) {
    console.warn("Bot->Aidoru sync on login failed:", err);
  }

  return toPublicUser(doc);
}
