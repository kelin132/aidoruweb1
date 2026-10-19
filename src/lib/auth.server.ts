import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getDb, users, guilds, type UserDoc } from "./db.server";
import type { OwnedPokemon, PublicUser } from "./game";
import { normalizeProfileFrame } from "./profileFrames";
import { resolveUserIdentityKeys } from "./userIdentity";
import { resolveAccountIdentity, collectionOwnershipQuery, identityVariants } from "./accountIdentity.mjs";

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
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 32 * 1024 * 1024;
const VERIFICATION_TTL_MS = 10 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
const WEBSITE_ID_PATTERN = /^AID-[0-9A-F]{10}$/;
const DISCORD_STATE_COOKIE = "aidoru_discord_oauth_state";
const DISCORD_LOGIN_STATE_COOKIE = "aidoru_discord_login_oauth_state";
const DISCORD_PENDING_LINK_COOKIE = "aidoru_discord_pending_link";
const DISCORD_STATE_TTL_SECONDS = 10 * 60;
const DISCORD_CALLBACK_URI = "https://aidoru.zone.id/profile?discord=callback";

function secret(): Uint8Array {
  const value = process.env["SESSION_SECRET"];
  if (!value) throw new Error("SESSION_SECRET is not configured.");
  return new TextEncoder().encode(value);
}

function normaliseWebsiteId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export function normalisePhoneNumber(countryCode: string, localNumber: string): string {
  const country = String(countryCode ?? "").replace(/\D/g, "");
  const rawLocal = String(localNumber ?? "").trim();
  const explicitlyInternational = rawLocal.startsWith("+") || rawLocal.startsWith("00");
  const local = rawLocal.replace(/\D/g, "").replace(/^00/, "").replace(/^0+/, "");
  if (explicitlyInternational) {
    if (local.length < 8 || local.length > 15) {
      throw new Error("Enter a valid WhatsApp phone number.");
    }
    return local;
  }
  if (country.length < 1 || country.length > 4 || local.length < 5 || local.length > 14) {
    throw new Error("Enter a valid WhatsApp phone number.");
  }
  // Accept both the intended national input and a pasted international number
  // while the country field is already populated.
  return local.startsWith(country) && local.length >= country.length + 7
    ? local
    : `${country}${local}`;
}

let websiteOtpOutboxIndexPromise: Promise<void> | null = null;

async function ensureWebsiteOtpOutboxIndexes(): Promise<void> {
  websiteOtpOutboxIndexPromise ??= (async () => {
    const collection = (await getDb()).collection("website_otp_outbox");
    const indexes = await collection.listIndexes().toArray().catch((error: unknown) => {
      if ((error as { code?: number })?.code === 26) return [];
      throw error;
    });
    if (!indexes.some((index) => index.name === "website_otp_outbox_pending")) {
      await collection.createIndex(
        { status: 1, nextAttemptAt: 1, createdAt: 1 },
        { name: "website_otp_outbox_pending" },
      );
    }
    if (!indexes.some((index) => index.name === "website_otp_outbox_expiry")) {
      await collection.createIndex(
        { expiresAt: 1 },
        { name: "website_otp_outbox_expiry", expireAfterSeconds: 86_400 },
      );
    }
  })().catch((error) => {
    websiteOtpOutboxIndexPromise = null;
    throw error;
  });
  await websiteOtpOutboxIndexPromise;
}

async function queueWebsiteOtpDelivery(
  userId: unknown,
  kind: "verification" | "reset",
  expiresAt: Date,
  flow: "signup" | "phone-login" | "password-reset" | "request-otp",
): Promise<void> {
  await ensureWebsiteOtpOutboxIndexes();
  const db = await getDb();
  const now = new Date();
  await db.collection("website_otp_outbox").updateOne(
    { _id: `website-otp:${String(userId)}` } as never,
    {
      $set: {
        userId,
        kind,
        flow,
        status: "pending",
        attempts: 0,
        createdAt: now,
        expiresAt,
      },
      $unset: {
        claimToken: "",
        lockedAt: "",
        nextAttemptAt: "",
        sentAt: "",
        failedAt: "",
      },
    } as never,
    { upsert: true },
  );
}

function phoneDigits(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || /@lid$/i.test(raw)) return null;
  const jid = raw.match(/^(\+?[\d\s().-]+?)(?::\d+)?@(s\.whatsapp\.net|c\.us)$/i);
  const candidate = jid ? jid[1] : raw;
  if (!jid && !/^\+?[\d\s().-]+$/.test(candidate)) return null;
  const digits = candidate.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

async function verifiedPhoneDigits(user: UserDoc): Promise<string> {
  for (const value of [
    user.phoneNumber,
    user.phone,
    user.whatsappNumber,
    user.whatsappId,
    user.whatsappJid,
    user.jid,
    user.userId,
    user._id,
  ]) {
    const digits = phoneDigits(value);
    if (digits) return digits;
  }

  const db = await getDb();
  const identity = await resolveAccountIdentity(db, String(user._id));
  for (const value of identity.ids || []) {
    const digits = phoneDigits(value);
    if (digits) return digits;
  }
  throw new Error("No verified WhatsApp phone number is linked to this account.");
}

function phoneLookupIds(phoneNumber: string): Array<string | number> {
  const digits = phoneNumber.replace(/\D/g, "");
  const numeric = Number(digits);
  return [
    ...new Set([
      digits,
      `+${digits}`,
      `${digits}@s.whatsapp.net`,
      `${digits}@c.us`,
      `${digits}:0@s.whatsapp.net`,
      `${digits}:0@c.us`,
      ...(Number.isSafeInteger(numeric) ? [numeric] : []),
    ]),
  ];
}

function phoneLookupClauses(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, "");
  const jidPattern = new RegExp(
    `^\\+?${digits}(?::\\d+)?@(s\\.whatsapp\\.net|c\\.us)$`,
    "i",
  );
  const compactPhonePattern = new RegExp(`^\\+?${digits}$`, "i");
  const fields = [
    "_id",
    "phoneNumber",
    "phone",
    "whatsappNumber",
    "whatsappId",
    "whatsappJid",
    "jid",
    "userId",
    "userJid",
    "sender",
  ];
  return fields.flatMap((field) => [
    { [field]: { $in: phoneLookupIds(phoneNumber) } },
    { [field]: { $regex: jidPattern } },
    { [field]: { $regex: compactPhonePattern } },
  ]);
}

const PHONE_IDENTITY_FIELDS = [
  "_id",
  "phoneNumber",
  "phone",
  "whatsappNumber",
  "whatsappId",
  "whatsappJid",
  "jid",
  "userId",
  "userJid",
] as const;

const AUTH_USER_PROJECTION = {
  _id: 1,
  identityAliases: 1,
  migratedFrom: 1,
  phoneNumber: 1,
  phone: 1,
  whatsappNumber: 1,
  whatsappId: 1,
  whatsappJid: 1,
  jid: 1,
  userId: 1,
  userJid: 1,
  sender: 1,
  discordId: 1,
  websiteId: 1,
  websiteSignupPending: 1,
  websitePasswordHash: 1,
  websitePasswordUpdatedAt: 1,
  websiteIdCreatedAt: 1,
  websiteVerificationCode: 1,
  websiteVerificationExpiresAt: 1,
  websitePendingPasswordHash: 1,
  websiteVerificationRequestedAt: 1,
  websiteResetCode: 1,
  websiteResetExpiresAt: 1,
  websiteResetPendingPasswordHash: 1,
  websiteResetRequestedAt: 1,
  websiteVerifiedAt: 1,
  websiteOtpHash: 1,
  websiteOtpSalt: 1,
  websiteOtpExpiresAt: 1,
  websiteOtpRequestedAt: 1,
  websiteResetTokenHash: 1,
  websiteResetTokenExpiresAt: 1,
  websiteBanned: 1,
  websiteSessionRevokedAt: 1,
  profilePictureUrl: 1,
  profileBackground: 1,
  profileFrame: 1,
  avatarVideo: 1,
  age: 1,
  birthday: 1,
  name: 1,
  username: 1,
  pushName: 1,
  notifyName: 1,
  bio: 1,
  registered: 1,
  registeredAt: 1,
  createdAt: 1,
  money: 1,
  staffLevel: 1,
  bank: 1,
  bankLimit: 1,
  bankCard: 1,
  bankUpgradeLevel: 1,
  level: 1,
  xp: 1,
  inventory: 1,
  job: 1,
  isPremium: 1,
  streak: 1,
  lastDaily: 1,
  lastWebsiteDaily: 1,
  halloweenIslands: 1,
  halloweenCardIslands: 1,
  halloweenActiveIsland: 1,
  halloweenStartedAt: 1,
} as const;

function looksLikeRegisteredLegacyUser(user: UserDoc): boolean {
  const record = user as UserDoc & Record<string, unknown>;
  const registered = (record as Record<string, unknown>)["registered"];
  if (registered === true || registered === "true" || registered === 1) {
    return true;
  }
  if (registered === false || registered === "false" || registered === 0) {
    return false;
  }
  return Boolean(
    record.registeredAt ||
      record.websiteId ||
      record.name ||
      record.username ||
      record.money !== undefined ||
      record.xp !== undefined,
  );
}

async function hashWebsitePassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveScrypt(password, salt, 64, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("hex"),
    derivedKey.toString("hex"),
  ].join("$");
}

function validateWebsitePassword(password: string) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    throw new Error("Your password must be between 8 and 128 characters.");
  }
  if (/[\r\n\t]/.test(password)) {
    throw new Error("Your password cannot contain line breaks or tabs.");
  }
}

async function verifyWebsitePassword(password: string, encodedHash: unknown): Promise<boolean> {
  if (typeof encodedHash !== "string") return false;
  const [algorithm, nText, rText, pText, saltHex, keyHex] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !saltHex || !keyHex) return false;

  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p))
    return false;

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

function pokemonToPublic(doc: Record<string, unknown>): OwnedPokemon {
  const pokedexId = Number(doc["pokedexId"]) || 0;
  return {
    id: String(doc["_id"] ?? ""),
    pokedexId,
    name: String(doc["name"] ?? "Unknown"),
    displayName: String(doc["displayName"] ?? doc["name"] ?? "Unknown"),
    nickname: typeof doc["nickname"] === "string" ? doc["nickname"] : null,
    level: Number(doc["level"]) || 1,
    xp: Number(doc["xp"]) || 0,
    xpNeeded: Number(doc["xpNeeded"]) || 0,
    hp: Number(doc["hp"]) || 0,
    maxHp: Number(doc["maxHp"]) || 1,
    types: Array.isArray(doc["types"]) ? doc["types"].map(String) : [],
    primaryType: String(doc["primaryType"] ?? "normal"),
    imageUrl: String(
      doc["imageUrl"] ??
        (pokedexId > 0
          ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokedexId}.png`
          : ""),
    ),
    shiny: Boolean(doc["shiny"]),
    inParty: Boolean(doc["inParty"]),
    isStarter: Boolean(doc["isStarter"]),
  };
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

function sessionWasRevoked(payloadIat: unknown, revokedAt: unknown): boolean {
  const issuedAtMs = Number(payloadIat) * 1000;
  const revokedAtMs = new Date(String(revokedAt ?? "")).getTime();
  return Number.isFinite(issuedAtMs) && Number.isFinite(revokedAtMs) && issuedAtMs <= revokedAtMs;
}

export async function currentUserId(): Promise<string | null> {
  const token = getCookie(COOKIE);
  if (!token) return null;
  const signingKey = secret();
  let payload: { sub?: unknown; iat?: unknown };
  try {
    ({ payload } = await jwtVerify(token, signingKey));
  } catch {
    // An invalid/expired token is an unauthenticated session. Database errors
    // must not be converted to null here: that made a temporary Mongo outage
    // look like a real sign-out and cleared the browser's session snapshot.
    return null;
  }
  if (typeof payload.sub !== "string") return null;

  const user = await findUserById(payload.sub);
  if (!user || sessionWasRevoked(payload.iat, user.websiteSessionRevokedAt)) {
    deleteCookie(COOKIE, { path: "/" });
    return null;
  }
  return payload.sub;
}

export async function findUserById(id: string): Promise<UserDoc | null> {
  const col = await users();
  const numericId = Number(id);
  const subject = await col.findOne({
    registered: true,
    websiteBanned: { $ne: true },
    $or: [{ _id: id }, ...(Number.isSafeInteger(numericId) ? [{ _id: numericId }] : [])],
  } as never, { projection: AUTH_USER_PROJECTION });
  if (!subject) return null;
  const { account } = await resolveAccountIdentity(await getDb(), subject._id);
  return account?.registered === true && account.websiteBanned !== true ? account as UserDoc : null;
}

export async function requireUser(): Promise<UserDoc & { _id: string }> {
  const id = await currentUserId();
  if (!id) throw new Error("Not signed in.");
  const user = await findUserById(id);
  if (!user) throw new Error("Session expired. Sign in again with your phone number.");
  return user as UserDoc & { _id: string };
}

export async function toPublicUser(doc: UserDoc): Promise<PublicUser> {
  const jid = String(doc._id);
  const db = await getDb();
  const trainerJids = await resolveUserIdentityKeys(db, doc as UserDoc & Record<string, unknown>);
  // Profile reads never reset a wallet or run a global data migration.
  const currentMoney = Number(doc.money) || 0;
  const currentBank = Number(doc.bank) || 0;
  const currentBankCard = doc.bankCard === true;
  const currentBankUpgradeLevel = Math.max(0, Number(doc.bankUpgradeLevel) || 0);
  const currentLevel = Math.max(1, Number(doc.level) || 1);
  const [guild, trainers] = await Promise.all([
    (await guilds()).findOne({ members: { $in: trainerJids } } as never),
    db.collection("pokemon_trainers").find(collectionOwnershipQuery(trainerJids, ["jid", "_id", "userId", "ownerJid"])).toArray(),
  ]);
  trainers.sort((a, b) => ((b["party"]?.length || 0) + (b["pc"]?.length || 0))
    - ((a["party"]?.length || 0) + (a["pc"]?.length || 0)) || String(a._id).localeCompare(String(b._id)));
  const trainer = trainers[0];
  const partyIds = [...new Set(trainers.flatMap((record) =>
    Array.isArray(record["party"]) ? record["party"].map(String) : [],
  ))];
  const pcIds = [...new Set(trainers.flatMap((record) =>
    Array.isArray(record["pc"]) ? record["pc"].map(String) : [],
  ))].filter((id) => !partyIds.includes(id));
  // A stale party/PC reference must not reveal a Pokemon transferred to
  // somebody else. Ownership is checked independently of the trainer arrays.
  const pokemonQuery = collectionOwnershipQuery(trainerJids, ["ownerJid", "owner", "userId"]);
  const pokemonDocs = await db
    .collection("pokemon_owned")
    .find(pokemonQuery as never)
    .sort({ inParty: -1, isStarter: -1, level: -1 })
    .toArray();
  const publicPokemon = pokemonDocs.map((pokemon) =>
    pokemonToPublic(pokemon as Record<string, unknown>),
  );
  const pokemonById = new Map(publicPokemon.map((pokemon) => [pokemon.id, pokemon]));
  const partySet = new Set(partyIds);
  const pcSet = new Set(pcIds);
  const partyPokemon = publicPokemon.filter((pokemon) =>
    partySet.has(pokemon.id) || (!pcSet.has(pokemon.id) && pokemon.inParty),
  );
  const pcPokemon = publicPokemon.filter((pokemon) => !partyPokemon.includes(pokemon));
  const guildId = guild?._id ? String(guild._id) : null;
  const title = doc.job || (doc.isPremium ? "Premium Player" : "Player");
  const imageFields = doc as UserDoc & Record<string, unknown>;

  return {
    id: jid,
    name: doc.name ?? doc.username ?? doc.pushName ?? doc.notifyName ?? "Player",
    bio: doc.bio ?? "",
    title,
    avatar: "default",
    avatarUrl:
      [
        doc.profilePictureUrl,
        imageFields["profileImage"],
        imageFields["avatarUrl"],
        imageFields["profilePic"],
        imageFields["pfp"],
        imageFields["imageUrl"],
        imageFields["image"],
      ].find((value): value is string => typeof value === "string" && value.trim().length > 0) ??
      null,
    avatarVideoUrl: String(doc["avatarVideo"] ?? "").trim() || null,
    age: Number(doc["age"] ?? 0) || 0,
    birthday: String(doc["birthday"] ?? "").trim() || null,
    banner: "aurora",
    profileBackground: typeof doc.profileBackground === "string" ? doc.profileBackground : null,
    profileFrame: normalizeProfileFrame(doc.profileFrame),
    coins: currentMoney,
    bank: currentBank,
    bankLimit: Math.floor(
      50_000 * (
        1
        + (currentLevel - 1) * 0.02
        + currentBankUpgradeLevel * 0.05
      ),
    ),
    bankCard: currentBankCard,
    xp: Number(doc.xp) || 0,
    inventory: inventoryEntries(doc.inventory),
    trainerInventory: inventoryEntries(trainer?.["inventory"]),
    trainerCoins: Number(trainer?.["coins"]) || 0,
    trainerLevel: Number(trainer?.["level"]) || 1,
    trainerXp: Number(trainer?.["xp"]) || 0,
    partyPokemon,
    pcPokemon,
    leadPokemonId: trainer?.["leadPokemonId"] ? String(trainer["leadPokemonId"]) : null,
    pokemon: publicPokemon,
    guildId,
    guildName: guild?.name ?? null,
    starter: partyPokemon.find((pokemon) => pokemon.isStarter)?.id ?? null,
    starterChosen: partyPokemon.some((pokemon) => pokemon.isStarter),
    dailyClaimedAt: doc.lastDaily ? new Date(Number(doc.lastDaily)).toISOString() : null,
    websiteDailyClaimedAt: doc.lastWebsiteDaily
      ? new Date(Number(doc.lastWebsiteDaily)).toISOString()
      : null,
    streak: Number(doc.streak) || 0,
    staffLevel: Math.max(1, Math.floor(Number(doc.staffLevel) || 1)),
    onboarding: [],
  };
}

export type PhoneLoginResult =
  | { status: "verified"; user: PublicUser }
  | {
      status: "verification_required";
      phoneNumber: string;
      maskedPhone: string;
      expiresAt: string;
    };

function maskPhone(phoneNumber: string): string {
  return phoneNumber.length <= 4
    ? phoneNumber
    : `${"•".repeat(Math.max(0, phoneNumber.length - 4))}${phoneNumber.slice(-4)}`;
}

async function ensureWebsiteId(user: UserDoc): Promise<string> {
  if (user.websiteId) return String(user.websiteId);
  const col = await users();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const websiteId = `AID-${randomBytes(5).toString("hex").toUpperCase()}`;
    try {
      const updated = await col.findOneAndUpdate(
        {
          _id: user._id,
          registered: true,
          $or: [{ websiteId: { $exists: false } }, { websiteId: null }, { websiteId: "" }],
        } as never,
        { $set: { websiteId, websiteIdCreatedAt: new Date() } } as never,
        { returnDocument: "after" },
      );
      if (updated?.websiteId) return String(updated.websiteId);
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
    }
  }
  const retry = await col.findOne({ _id: user._id } as never, {
    projection: { websiteId: 1 },
  });
  if (retry?.websiteId) return String(retry.websiteId);
  throw new Error("Could not create your AIDORU profile ID. Please try again.");
}

async function findUserByPhoneNumber(phoneNumber: string): Promise<UserDoc | null> {
  const col = await users();
  const resolved = await resolveAccountIdentity(await getDb(), `${phoneNumber}@s.whatsapp.net`);
  if (resolved.account?.registered === true) {
    return resolved.account.websiteBanned === true ? null : resolved.account as UserDoc;
  }
  const canonical = await col.findOne(
    {
      _id: `${phoneNumber}@s.whatsapp.net`,
      registered: true,
      websiteBanned: { $ne: true },
    } as never,
    { projection: AUTH_USER_PROJECTION },
  );
  if (canonical) return canonical;

  const exact = await col.findOne({
    registered: true,
    websiteBanned: { $ne: true },
    $or: PHONE_IDENTITY_FIELDS.flatMap((field) => [
      { [field]: { $in: phoneLookupIds(phoneNumber) } },
    ]),
  } as never, { projection: AUTH_USER_PROJECTION });
  if (exact) return exact;

  // Legacy records can use device-qualified JIDs or omit the registered flag.
  // Keep this bounded to one projected Mongo query instead of loading the
  // entire users collection into the login request.
  const legacy = await col.findOne(
    {
      websiteBanned: { $ne: true },
      registered: { $ne: false },
      $or: phoneLookupClauses(phoneNumber),
    } as never,
    { projection: AUTH_USER_PROJECTION },
  );
  return legacy && looksLikeRegisteredLegacyUser(legacy as UserDoc) ? legacy : null;
}

function createVerificationCode(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export async function createWebsiteAccount(input: {
  countryCode: string;
  phoneNumber: string;
  name: string;
  password: string;
}): Promise<PhoneLoginResult> {
  const phoneNumber = normalisePhoneNumber(input.countryCode, input.phoneNumber);
  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 20 || /[\r\n\t]/.test(name)) {
    throw new Error("Your trainer name must be between 2 and 20 characters.");
  }
  validateWebsitePassword(input.password);

  const existing = await findUserByPhoneNumber(phoneNumber);
  if (existing) {
    throw new Error("An account already exists for this WhatsApp number. Sign in instead.");
  }

  const col = await users();
  const canonicalJid = `${phoneNumber}@s.whatsapp.net`;
  const websitePendingPasswordHash = await hashWebsitePassword(input.password);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MS);
  const code = createVerificationCode();
  const defaults = {
    money: 100_000,
    totalWealth: 100_000,
    bank: 0,
    vault: 0,
    orbs: 0,
    diamonds: 0,
    level: 1,
    xp: 0,
    bio: "",
    inventory: [],
    history: [],
    lastDaily: 0,
    lastWeekly: 0,
    lastMonthly: 0,
    createdAt: now,
  };
  const registration = {
    name,
    phoneNumber,
    whatsappNumber: canonicalJid,
    whatsappJid: canonicalJid,
    jid: canonicalJid,
    websitePendingPasswordHash,
    websiteVerificationCode: code,
    websiteVerificationExpiresAt: expiresAt,
    websiteVerificationRequestedAt: now,
    websiteSignupPending: true,
    registered: false,
  };

  try {
    await col.findOneAndUpdate(
      {
        _id: canonicalJid,
        registered: { $ne: true },
        websiteBanned: { $ne: true },
      } as never,
      {
        $set: registration as never,
        $setOnInsert: defaults as never,
      },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    throw new Error("An account already exists for this WhatsApp number. Sign in instead.");
  }

  try {
    await queueWebsiteOtpDelivery(canonicalJid, "verification", expiresAt, "signup");
  } catch (error) {
    console.error("[auth] Could not queue the website signup code:", error);
  }

  return {
    status: "verification_required",
    phoneNumber,
    maskedPhone: maskPhone(phoneNumber),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function beginPhoneLogin(input: {
  countryCode: string;
  phoneNumber: string;
  password: string;
}): Promise<PhoneLoginResult> {
  const phoneNumber = normalisePhoneNumber(input.countryCode, input.phoneNumber);
  validateWebsitePassword(input.password);
  const user = await findUserByPhoneNumber(phoneNumber);
  if (!user)
    throw new Error(
      "No account was found for this number. Create an account here or run .register in the bot.",
    );

  if (user.websitePasswordHash && user.websiteVerifiedAt) {
    if (!(await verifyWebsitePassword(input.password, user.websitePasswordHash))) {
      throw new Error("Incorrect password for this WhatsApp number.");
    }
    await issueSession(String(user._id));
    return { status: "verified", user: await toPublicUser(user) };
  }

  const code = createVerificationCode();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  const pendingPasswordHash = await hashWebsitePassword(input.password);
  await (
    await users()
  ).updateOne(
    { _id: user._id, registered: true } as never,
    {
      $set: {
        websitePendingPasswordHash: pendingPasswordHash,
        websiteVerificationCode: code,
        websiteVerificationExpiresAt: expiresAt,
        websiteVerificationRequestedAt: new Date(),
      },
      $unset: { websiteVerifiedAt: "" },
    } as never,
  );
  try {
    await queueWebsiteOtpDelivery(user._id, "verification", expiresAt, "phone-login");
  } catch (error) {
    console.error("[auth] Could not queue the website phone-login code:", error);
  }
  return {
    status: "verification_required",
    phoneNumber,
    maskedPhone: maskPhone(phoneNumber),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function beginPasswordReset(input: {
  countryCode: string;
  phoneNumber: string;
  password: string;
}): Promise<{ phoneNumber: string; maskedPhone: string; expiresAt: string }> {
  const phoneNumber = normalisePhoneNumber(input.countryCode, input.phoneNumber);
  validateWebsitePassword(input.password);
  const user = await findUserByPhoneNumber(phoneNumber);
  if (!user) throw new Error("No registered WhatsApp profile was found for this number.");

  const code = createVerificationCode();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  const pendingPasswordHash = await hashWebsitePassword(input.password);
  await (
    await users()
  ).updateOne(
    { _id: user._id, registered: true } as never,
    {
      $set: {
        websiteResetPendingPasswordHash: pendingPasswordHash,
        websiteResetCode: code,
        websiteResetExpiresAt: expiresAt,
        websiteResetRequestedAt: new Date(),
      },
    } as never,
  );
  try {
    await queueWebsiteOtpDelivery(user._id, "reset", expiresAt, "password-reset");
  } catch (error) {
    console.error("[auth] Could not queue the website password-reset code:", error);
  }
  return { phoneNumber, maskedPhone: maskPhone(phoneNumber), expiresAt: expiresAt.toISOString() };
}

export async function completePasswordReset(input: {
  countryCode: string;
  phoneNumber: string;
  code: string;
}): Promise<PublicUser> {
  const phoneNumber = normalisePhoneNumber(input.countryCode, input.phoneNumber);
  const code = String(input.code ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code))
    throw new Error("Enter the six-digit reset code from the WhatsApp bot.");
  const user = await findUserByPhoneNumber(phoneNumber);
  if (!user || user.websiteResetCode !== code) throw new Error("That reset code is incorrect.");
  const expiry = new Date(String(user.websiteResetExpiresAt ?? "")).getTime();
  if (!Number.isFinite(expiry) || expiry < Date.now())
    throw new Error("That reset code has expired. Start again.");
  if (!user.websiteResetPendingPasswordHash)
    throw new Error("No pending new password was found. Start again.");

  const result = await (
    await users()
  ).findOneAndUpdate(
    { _id: user._id, registered: true, websiteResetCode: code } as never,
    {
      $set: {
        websitePasswordHash: user.websiteResetPendingPasswordHash,
        websitePasswordUpdatedAt: new Date(),
        websiteVerifiedAt: user.websiteVerifiedAt ?? new Date(),
      },
      $unset: {
        websiteResetPendingPasswordHash: "",
        websiteResetCode: "",
        websiteResetExpiresAt: "",
        websiteResetRequestedAt: "",
      },
    } as never,
    { returnDocument: "after" },
  );
  if (!result) throw new Error("Reset expired or was already completed. Start again.");
  await issueSession(String(result._id));
  return toPublicUser(result as UserDoc);
}

export async function completePhoneVerification(input: {
  countryCode: string;
  phoneNumber: string;
  code: string;
}): Promise<PublicUser> {
  const phoneNumber = normalisePhoneNumber(input.countryCode, input.phoneNumber);
  const code = String(input.code ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code from the WhatsApp bot.");
  const existing = await findUserByPhoneNumber(phoneNumber);
  const col = await users();
  const pendingSignup = existing
    ? null
    : await col.findOne(
        {
          _id: `${phoneNumber}@s.whatsapp.net`,
          websiteSignupPending: true,
          websiteBanned: { $ne: true },
        } as never,
        { projection: AUTH_USER_PROJECTION },
      );
  const user = existing ?? pendingSignup;
  if (!user || user.websiteVerificationCode !== code)
    throw new Error("That verification code is incorrect.");
  const expiry = new Date(String(user.websiteVerificationExpiresAt ?? "")).getTime();
  if (!Number.isFinite(expiry) || expiry < Date.now())
    throw new Error("That verification code has expired. Start again from the login page.");
  if (!user.websitePendingPasswordHash)
    throw new Error("No pending password was found. Start again from the login page.");

  const now = new Date();
  const result = await col.findOneAndUpdate(
    {
      _id: user._id,
      websiteVerificationCode: code,
      websiteVerificationExpiresAt: { $gt: now },
      websiteBanned: { $ne: true },
      $or: [{ registered: true }, { websiteSignupPending: true }],
    } as never,
    {
      $set: {
        websitePasswordHash: user.websitePendingPasswordHash,
        websitePasswordUpdatedAt: now,
        websiteVerifiedAt: now,
        ...(user.websiteSignupPending ? { registered: true, registeredAt: now } : {}),
      },
      $unset: {
        websitePendingPasswordHash: "",
        websiteVerificationCode: "",
        websiteVerificationExpiresAt: "",
        websiteVerificationRequestedAt: "",
        websiteSignupPending: "",
      },
    } as never,
    { returnDocument: "after" },
  );
  if (!result)
    throw new Error(
      "Verification expired or was already completed. Start again from the login page.",
    );
  await ensureWebsiteId(result as UserDoc);
  const refreshed = (await col.findOne(
    { _id: result._id } as never,
    { projection: AUTH_USER_PROJECTION },
  )) as UserDoc | null;
  if (!refreshed) throw new Error("Your verified account could not be loaded. Please sign in.");
  await issueSession(String(refreshed._id));
  return toPublicUser(refreshed);
}

function validateWebsiteId(value: unknown): string {
  const websiteId = normaliseWebsiteId(value);
  if (!WEBSITE_ID_PATTERN.test(websiteId))
    throw new Error("Enter a valid AIDORU ID, for example AID-XXXXXXXXXX.");
  return websiteId;
}

async function findUserByWebsiteId(websiteId: string): Promise<UserDoc | null> {
  return (await users()).findOne({ registered: true, websiteBanned: { $ne: true }, websiteId } as never);
}

function hashOtp(websiteId: string, otp: string, saltHex: string): string {
  return createHash("sha256").update(`${saltHex}:${websiteId}:${otp}`, "utf8").digest("hex");
}

function hashResetToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function setCustomPassword(input: {
  websiteId: string;
  newPassword: string;
}): Promise<PublicUser> {
  const websiteId = validateWebsiteId(input.websiteId);
  validateWebsitePassword(input.newPassword);
  const user = await findUserByWebsiteId(websiteId);
  if (!user) throw new Error("No registered WhatsApp profile was found for that AIDORU ID.");
  if (user.websitePasswordHash) {
    throw new Error(
      "A website password already exists. Use Forgot password if you need to replace it.",
    );
  }

  const websitePasswordHash = await hashWebsitePassword(input.newPassword);
  const result = await (
    await users()
  ).findOneAndUpdate(
    {
      _id: user._id,
      registered: true,
      websiteId,
      $or: [
        { websitePasswordHash: { $exists: false } },
        { websitePasswordHash: null },
        { websitePasswordHash: "" },
      ],
    } as never,
    {
      $set: {
        websitePasswordHash,
        websitePasswordUpdatedAt: new Date(),
        websiteVerifiedAt: new Date(),
      },
    } as never,
    { returnDocument: "after" },
  );
  if (!result) throw new Error("A website password was set already. Try signing in instead.");
  await issueSession(String(result._id));
  return toPublicUser(result as UserDoc);
}

export async function requestOtp(input: {
  websiteId?: string;
  countryCode?: string;
  phoneNumber?: string;
}): Promise<{ websiteId: string; expiresAt: string; maskedPhone: string }> {
  let user: UserDoc | null = null;
  if (input.websiteId?.trim()) {
    const websiteId = validateWebsiteId(input.websiteId);
    user = await findUserByWebsiteId(websiteId);
  } else {
    const phoneNumber = normalisePhoneNumber(input.countryCode ?? "", input.phoneNumber ?? "");
    user = await findUserByPhoneNumber(phoneNumber);
  }
  if (!user) throw new Error("No registered WhatsApp profile was found for that account.");

  const websiteId = user.websiteId ? String(user.websiteId) : await ensureWebsiteId(user);
  const phoneNumber = await verifiedPhoneDigits(user);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const requestedAt = new Date();
  await (
    await users()
  ).updateOne(
    { _id: user._id, registered: true, websiteId } as never,
    {
      $set: {
        websiteOtpRequestedAt: requestedAt,
        websiteOtpExpiresAt: expiresAt,
      },
      $unset: {
        websiteOtpHash: "",
        websiteOtpSalt: "",
        websiteResetTokenHash: "",
        websiteResetTokenExpiresAt: "",
      },
    } as never,
  );
  try {
    await queueWebsiteOtpDelivery(user._id, "reset", expiresAt, "request-otp");
  } catch (error) {
    console.error("[auth] Could not queue the website reset code:", error);
  }
  return { websiteId, expiresAt: expiresAt.toISOString(), maskedPhone: maskPhone(phoneNumber) };
}

export async function verifyOtpForReset(input: {
  websiteId: string;
  otp: string;
}): Promise<{ resetToken: string; expiresAt: string }> {
  const websiteId = validateWebsiteId(input.websiteId);
  const otp = String(input.otp ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(otp)) throw new Error("Enter the six-digit code sent by the WhatsApp bot.");

  const user = await findUserByWebsiteId(websiteId);
  if (!user || typeof user.websiteOtpHash !== "string" || typeof user.websiteOtpSalt !== "string") {
    throw new Error(
      "No active reset code was found. Press Forgot password again, then use .otp in your WhatsApp DM.",
    );
  }
  const expiry = new Date(String(user.websiteOtpExpiresAt ?? "")).getTime();
  if (!Number.isFinite(expiry) || expiry < Date.now())
    throw new Error("That reset code has expired. Start again.");

  const expected = Buffer.from(user.websiteOtpHash, "hex");
  const actual = Buffer.from(hashOtp(websiteId, otp, user.websiteOtpSalt), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) {
    throw new Error("That reset code is incorrect.");
  }

  const resetToken = randomBytes(32).toString("base64url");
  const resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  const result = await (
    await users()
  ).findOneAndUpdate(
    { _id: user._id, registered: true, websiteId, websiteOtpHash: user.websiteOtpHash } as never,
    {
      $set: {
        websiteResetTokenHash: hashResetToken(resetToken),
        websiteResetTokenExpiresAt: resetTokenExpiresAt,
      },
      $unset: {
        websiteOtpHash: "",
        websiteOtpSalt: "",
        websiteOtpExpiresAt: "",
        websiteOtpRequestedAt: "",
      },
    } as never,
    { returnDocument: "after" },
  );
  if (!result) throw new Error("That reset code was already used. Start again.");
  return { resetToken, expiresAt: resetTokenExpiresAt.toISOString() };
}

export async function resetPasswordWithOtp(input: {
  websiteId: string;
  resetToken: string;
  newPassword: string;
}): Promise<PublicUser> {
  const websiteId = validateWebsiteId(input.websiteId);
  validateWebsitePassword(input.newPassword);
  const resetToken = String(input.resetToken ?? "");
  if (resetToken.length < 32 || resetToken.length > 128)
    throw new Error("Your reset session is invalid. Start again.");

  const websitePasswordHash = await hashWebsitePassword(input.newPassword);
  const result = await (
    await users()
  ).findOneAndUpdate(
    {
      registered: true,
      websiteBanned: { $ne: true },
      websiteId,
      websiteResetTokenHash: hashResetToken(resetToken),
      websiteResetTokenExpiresAt: { $gt: new Date() },
    } as never,
    {
      $set: {
        websitePasswordHash,
        websitePasswordUpdatedAt: new Date(),
        websiteVerifiedAt: new Date(),
      },
      $unset: { websiteResetTokenHash: "", websiteResetTokenExpiresAt: "" },
    } as never,
    { returnDocument: "after" },
  );
  if (!result) throw new Error("Your reset session has expired. Start again with Forgot password.");
  await issueSession(String(result._id));
  return toPublicUser(result as UserDoc);
}

export async function loginUser(input: {
  websiteId: string;
  password: string;
}): Promise<PublicUser> {
  const websiteId = validateWebsiteId(input.websiteId);
  const password = input.password;
  validateWebsitePassword(password);

  const user = await findUserByWebsiteId(websiteId);
  if (!user) throw new Error("Invalid AIDORU ID or password.");
  if (!user.websitePasswordHash)
    throw new Error("No website password is set yet. Choose Set up password first.");
  if (!(await verifyWebsitePassword(password, user.websitePasswordHash))) {
    throw new Error("Invalid AIDORU ID or password.");
  }

  await issueSession(String(user._id));
  return toPublicUser(user);
}

export type DiscordLinkStatus = {
  linked: boolean;
  discordId: string | null;
  discordUsername: string | null;
  discordAvatar: string | null;
};

function whatsappIdentityVariants(value: string): string[] {
  return identityVariants(value);
}

function discordConfiguration(_flow: "link" | "login" = "link") {
  const clientId = process.env["DISCORD_CLIENT_ID"]?.trim();
  const clientSecret = process.env["DISCORD_CLIENT_SECRET"]?.trim();
  // Both website login and account linking use the callback registered in the
  // Discord application. Ignore legacy redirect overrides so an old hosting
  // environment cannot send OAuth to an invalid path.
  const redirectUri = DISCORD_CALLBACK_URI;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Discord sign-in is not configured yet. Add DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

async function activeDiscordLink(whatsappId: string) {
  const db = await getDb();
  const identity = await resolveAccountIdentity(db, whatsappId);
  if (identity.discordIds.length !== 1) return null;
  return db.collection("account_links").findOne({
    whatsappId: { $in: identity.ids },
    discordId: identity.discordIds[0],
    status: "active",
  } as never);
}

async function findUserByWhatsAppIdentity(identity: string): Promise<UserDoc | null> {
  const { account } = await resolveAccountIdentity(await getDb(), identity);
  return account?.registered === true && account.websiteBanned !== true ? account as UserDoc : null;
}

type DiscordIdentity = {
  id: string;
  username: string;
  avatar: string | null;
};

export type DiscordWebsiteLoginResult =
  | { status: "linked"; user: PublicUser }
  | { status: "link_required"; discordUsername: string; discordAvatar: string | null };

async function exchangeDiscordCode(
  code: string,
  configuration: ReturnType<typeof discordConfiguration>,
): Promise<DiscordIdentity> {
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: configuration.redirectUri,
    }),
  });
  const tokenBody = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: unknown;
    error?: unknown;
    error_description?: unknown;
  };
  if (!tokenResponse.ok) {
    const detail = String(tokenBody.error_description || tokenBody.error || "").trim();
    throw new Error(
      detail
        ? `Discord could not authorize this request (${detail}). Start again.`
        : "Discord could not authorize this request. Start again.",
    );
  }
  const tokenPayload = tokenBody;
  const accessToken = String(tokenPayload.access_token ?? "");
  if (!accessToken) throw new Error("Discord did not return an authorization token.");

  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!userResponse.ok) throw new Error("Discord profile lookup failed. Start again.");
  const discordUser = (await userResponse.json()) as {
    id?: unknown;
    username?: unknown;
    global_name?: unknown;
    avatar?: unknown;
  };
  const id = String(discordUser.id ?? "").trim();
  if (!/^\d{10,25}$/.test(id)) throw new Error("Discord returned an invalid account.");

  return {
    id,
    username: String(discordUser.global_name || discordUser.username || id),
    avatar: discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${id}/${String(discordUser.avatar)}.png?size=128`
      : null,
  };
}

async function saveDiscordLink(
  user: UserDoc,
  discordUser: DiscordIdentity,
  source: string,
): Promise<DiscordLinkStatus> {
  const db = await getDb();
  const links = db.collection("account_links");
  const now = Date.now();
  const whatsappIds = (await resolveAccountIdentity(db, user._id)).ids;
  await links.updateMany(
    { whatsappId: { $in: whatsappIds }, status: "active" } as never,
    { $set: { status: "revoked", revokedAt: now, revokedBy: source } } as never,
  );
  await links.updateMany(
    { discordId: discordUser.id, status: "active" } as never,
    { $set: { status: "revoked", revokedAt: now, revokedBy: source } } as never,
  );
  await links.insertOne({
    whatsappId: String(user._id),
    discordId: discordUser.id,
    discordUsername: discordUser.username,
    discordAvatar: discordUser.avatar,
    status: "active",
    source,
    createdAt: now,
    linkedAt: now,
  });

  return {
    linked: true,
    discordId: discordUser.id,
    discordUsername: discordUser.username,
    discordAvatar: discordUser.avatar,
  };
}

async function savePendingDiscordIdentity(discordUser: DiscordIdentity): Promise<void> {
  const token = await new SignJWT({
    username: discordUser.username,
    avatar: discordUser.avatar,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(discordUser.id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());

  setCookie(DISCORD_PENDING_LINK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: DISCORD_STATE_TTL_SECONDS,
  });
}

async function readPendingDiscordIdentity(): Promise<DiscordIdentity | null> {
  const token = getCookie(DISCORD_PENDING_LINK_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string" || typeof payload["username"] !== "string") return null;
    return {
      id: payload.sub,
      username: payload["username"],
      avatar: typeof payload["avatar"] === "string" ? payload["avatar"] : null,
    };
  } catch {
    return null;
  }
}

function clearPendingDiscordIdentity(): void {
  deleteCookie(DISCORD_PENDING_LINK_COOKIE, { path: "/" });
}

export async function getDiscordLinkStatus(): Promise<DiscordLinkStatus> {
  const user = await requireUser();
  const link = await activeDiscordLink(String(user._id));
  return {
    linked: Boolean(link?.["discordId"]),
    discordId: link?.["discordId"] ? String(link["discordId"]) : null,
    discordUsername: link?.["discordUsername"] ? String(link["discordUsername"]) : null,
    discordAvatar: link?.["discordAvatar"] ? String(link["discordAvatar"]) : null,
  };
}

export async function startDiscordLink(): Promise<{ authorizationUrl: string }> {
  await requireUser();
  const { clientId, redirectUri } = discordConfiguration();
  const state = randomBytes(32).toString("base64url");
  setCookie(DISCORD_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: DISCORD_STATE_TTL_SECONDS,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state,
  });
  return { authorizationUrl: `https://discord.com/oauth2/authorize?${params.toString()}` };
}

export async function startDiscordLogin(): Promise<{ authorizationUrl: string }> {
  const { clientId, redirectUri } = discordConfiguration("login");
  const state = randomBytes(32).toString("base64url");
  clearPendingDiscordIdentity();
  setCookie(DISCORD_LOGIN_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: DISCORD_STATE_TTL_SECONDS,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state,
  });
  return { authorizationUrl: `https://discord.com/oauth2/authorize?${params.toString()}` };
}

export async function completeDiscordLogin(input: {
  code: string;
  state: string;
}): Promise<DiscordWebsiteLoginResult> {
  const expectedState = getCookie(DISCORD_LOGIN_STATE_COOKIE);
  deleteCookie(DISCORD_LOGIN_STATE_COOKIE, { path: "/" });
  if (!expectedState || expectedState !== input.state) {
    throw new Error("That Discord sign-in session expired. Start again.");
  }

  const discordUser = await exchangeDiscordCode(input.code, discordConfiguration("login"));
  const db = await getDb();
  const resolved = await resolveAccountIdentity(db, `discord:${discordUser.id}`);
  const link = await db.collection("account_links").findOne({
    discordId: discordUser.id,
    whatsappId: { $in: resolved.ids.filter(id => !id.startsWith("discord:")) },
    status: "active",
  } as never);
  if (!link?.["whatsappId"]) {
    await savePendingDiscordIdentity(discordUser);
    return {
      status: "link_required",
      discordUsername: discordUser.username,
      discordAvatar: discordUser.avatar,
    };
  }

  const user = await findUserByWhatsAppIdentity(String(link["whatsappId"]));
  if (!user) {
    throw new Error(
      "The linked WhatsApp trainer could not be found. Generate a new link from WhatsApp.",
    );
  }
  await issueSession(String(user._id));
  return { status: "linked", user: await toPublicUser(user) };
}

export async function completeDiscordCallback(input: {
  code: string;
  state: string;
}): Promise<
  | { kind: "login"; user: PublicUser }
  | { kind: "login_link_required"; discordUsername: string; discordAvatar: string | null }
  | { kind: "link"; status: DiscordLinkStatus }
> {
  // Use the state cookie to distinguish website sign-in from account linking.
  // Both flows may return to the root page or the profile callback.
  const loginState = getCookie(DISCORD_LOGIN_STATE_COOKIE);
  if (loginState && loginState === input.state) {
    const result = await completeDiscordLogin(input);
    return result.status === "linked"
      ? { kind: "login", user: result.user }
      : { kind: "login_link_required", ...result };
  }
  return { kind: "link", status: await completeDiscordLink(input) };
}

export async function completeDiscordLink(input: {
  code: string;
  state: string;
}): Promise<DiscordLinkStatus> {
  const user = await requireUser();
  const expectedState = getCookie(DISCORD_STATE_COOKIE);
  deleteCookie(DISCORD_STATE_COOKIE, { path: "/" });
  if (!expectedState || expectedState !== input.state) {
    throw new Error("That Discord link session expired. Start the link again.");
  }

  const configuration = discordConfiguration();
  const discordUser = await exchangeDiscordCode(input.code, configuration);

  return saveDiscordLink(user, discordUser, "website-oauth");
}

export async function completePendingDiscordLink(input: {
  websiteId: string;
  password: string;
}): Promise<PublicUser> {
  const pendingDiscord = await readPendingDiscordIdentity();
  if (!pendingDiscord) {
    throw new Error("That Discord link session expired. Start again with Continue with Discord.");
  }

  const websiteId = validateWebsiteId(input.websiteId);
  validateWebsitePassword(input.password);
  const user = await findUserByWebsiteId(websiteId);
  if (!user?.websitePasswordHash) {
    throw new Error("Invalid AIDORU ID or password.");
  }
  if (!(await verifyWebsitePassword(input.password, user.websitePasswordHash))) {
    throw new Error("Invalid AIDORU ID or password.");
  }

  await saveDiscordLink(user, pendingDiscord, "website-discord-login");
  clearPendingDiscordIdentity();
  await issueSession(String(user._id));
  return toPublicUser(user);
}

export async function unlinkDiscordAccount(): Promise<DiscordLinkStatus> {
  const user = await requireUser();
  const db = await getDb();
  await db
    .collection("account_links")
    .updateMany(
      {
        whatsappId: { $in: (await resolveAccountIdentity(db, user._id)).ids },
        status: "active",
      } as never,
      { $set: { status: "revoked", revokedAt: Date.now(), revokedBy: "website" } } as never,
    );
  return {
    linked: false,
    discordId: null,
    discordUsername: null,
    discordAvatar: null,
  };
}
