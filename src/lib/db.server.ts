import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import { getMongoUri } from "./config.server";

export type UserDoc = {
  _id: string;
  phoneNumber?: string | null;
  phone?: string | null;
  whatsappNumber?: string | null;
  whatsappId?: string | null;
  whatsappJid?: string | null;
  jid?: string | null;
  userId?: string | number | null;
  userJid?: string | null;
  sender?: string | null;
  discordId?: string | null;
  websiteId?: string;
  websitePasswordHash?: string;
  websitePasswordUpdatedAt?: string | Date | null;
  websiteIdCreatedAt?: string | Date | null;
  websiteVerificationCode?: string | null;
  websiteVerificationExpiresAt?: string | Date | null;
  websitePendingPasswordHash?: string | null;
  websiteVerificationRequestedAt?: string | Date | null;
  websiteResetCode?: string | null;
  websiteResetExpiresAt?: string | Date | null;
  websiteResetPendingPasswordHash?: string | null;
  websiteResetRequestedAt?: string | Date | null;
  websiteVerifiedAt?: string | Date | null;
  websiteOtpHash?: string | null;
  websiteOtpSalt?: string | null;
  websiteOtpExpiresAt?: string | Date | null;
  websiteOtpRequestedAt?: string | Date | null;
  websiteResetTokenHash?: string | null;
  websiteResetTokenExpiresAt?: string | Date | null;
  websiteBanned?: boolean;
  websiteBanReason?: string | null;
  websiteBannedAt?: string | Date | null;
  websiteSessionRevokedAt?: string | Date | null;
  profilePictureUrl?: string | null;
  profilePictureUpdatedAt?: string | Date | null;
  profileBackground?: string | null;
  profileFrame?: string | null;
  avatarVideo?: string | null;
  age?: number | null;
  birthday?: string | null;
  name?: string;
  username?: string;
  pushName?: string;
  notifyName?: string;
  bio?: string;
  registered?: boolean;
  registeredAt?: string | Date | null;
  createdAt?: string | Date | null;
  money?: number;
  bank?: number;
  bankLimit?: number;
  bankCard?: boolean;
  bankUpgradeLevel?: number;
  vault?: number;
  orbs?: number;
  diamonds?: number;
  level?: number;
  xp?: number;
  inventory?: unknown;
  history?: unknown;
  job?: string | null;
  isPremium?: boolean;
  staffLevel?: number;
  streak?: number;
  lastDaily?: number | string | Date | null;
  lastWebsiteDaily?: number | string | Date | null;
};

export type ModeratorApplicationDoc = {
  _id: string;
  name: string;
  nameKey: string;
  phoneNumber: string;
  reason: string;
  requestedRole: "mod" | "staff";
  botKnowledge: "new" | "basic" | "confident" | "expert";
  gender: "female" | "male";
  status: "pending" | "reviewed" | "accepted" | "rejected";
  submittedAt: Date;
};

export type GuildDoc = {
  _id?: string;
  name?: string;
  owner?: string;
  members?: string[];
  level?: number;
  guildXp?: number;
  treasury?: number;
  taxRate?: number;
  tag?: string;
  description?: string;
  icon?: string | null;
};

export type CardDoc = {
  _id?: unknown;
  userId?: string;
  whatsappNumber?: string;
  jid?: string;
  username?: string | null;
  cards?: Array<Record<string, unknown>>;
  totalCards?: number;
  cardLimit?: number;
};

export type CardMarketListingDoc = {
  _id?: unknown;
  sellerId: string;
  cardId: string;
  cardName: string;
  cardImage?: string | null;
  cardRarity?: string | null;
  price: number;
  listedAt: Date | string;
};

export type WebBattleMoveDoc = {
  name: string;
  type: string;
  power: number;
  accuracy: number;
  pp?: number;
  priority?: number;
  desc?: string;
};

export type WebBattlePokemonDoc = {
  id: string;
  pokedexId: number;
  name: string;
  displayName: string;
  level: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  types: string[];
  imageUrl: string;
  frontSpriteUrl: string;
  backSpriteUrl: string;
  shiny: boolean;
  moves: WebBattleMoveDoc[];
  fainted: boolean;
};

export type WebBattleTrainerDoc = {
  id: string;
  name: string;
  avatarUrl: string | null;
  trainerSpriteUrl: string | null;
  ready: boolean;
  party: WebBattlePokemonDoc[];
  activeIndex: number;
  inventory: Record<string, number>;
};

export type WebBattleRoomDoc = {
  gym?: {
    id: string;
    name: string;
    type: string;
    leader: string;
    badge: string;
    theme: string;
    accent: string;
    background: string;
    music: string;
    rewardCoins: number;
    rewardXp: number;
  } | null;
  rewardGrantedAt?: Date | null;
  _id: string;
  code?: string;
  status: "waiting" | "active" | "finished";
  challenger: WebBattleTrainerDoc;
  opponent: WebBattleTrainerDoc | null;
  invitedOpponentId?: string | null;
  pairKey?: string | null;
  autoStart?: boolean;
  spectatorIds: string[];
  turn: "challenger" | "opponent" | null;
  forcedSwitch: "challenger" | "opponent" | null;
  round: number;
  winnerId: string | null;
  combatLog: string[];
  version: number;
  createdAt: Date;
  lastActionAt: Date;
  expiresAt: Date | null;
  finishedAt?: Date | null;
};

export type PetDoc = {
  _id?: unknown;
  owner?: string;
  petId?: string;
  name?: string;
  species?: string;
  rarity?: string;
  level?: number;
  exp?: number;
  expNeeded?: number;
  hp?: number;
  maxHp?: number;
  attack?: number;
  defense?: number;
  speed?: number;
  hunger?: number;
  happiness?: number;
  imageUrl?: string;
  skill?: string;
  isActive?: boolean;
  createdAt?: string | Date;
  lastFed?: string | Date | null;
  lastPlayed?: string | Date | null;
};

type Cache = {
  client: MongoClient | null;
  promise: Promise<Db> | null;
  healthPromise: Promise<void> | null;
  lastHealthCheckAt: number;
};
const globalCache = globalThis as unknown as { __aidoruMongo?: Cache };
const cache: Cache = (globalCache.__aidoruMongo ??= {
  client: null,
  promise: null,
  healthPromise: null,
  lastHealthCheckAt: 0,
});

const HEALTH_CHECK_INTERVAL_MS = 60_000;
const CONNECT_RETRY_DELAYS_MS = [250, 750];
let leaderboardIndexesPromise: Promise<void> | null = null;

async function ensureIndex(collection: Collection<Document>, key: Record<string, 1 | -1>): Promise<void> {
  const indexes = await collection.listIndexes().toArray();
  const existing = indexes.some((index) => {
    const existingKey = (index.key ?? {}) as Record<string, 1 | -1>;
    const fields = Object.keys(key);
    return fields.length === Object.keys(existingKey).length && fields.every((field) => existingKey[field] === key[field]);
  });
  if (!existing) await collection.createIndex(key);
}

function ensureLeaderboardIndexes(db: Db): Promise<void> {
  const startedAt = Date.now();
  const usersCollection = db.collection("users");
  const mnUsersCollection = db.collection("mn_users");
  const trainerCollection = db.collection("pokemon_trainers");
  const ownedPokemonCollection = db.collection("pokemon_owned");
  leaderboardIndexesPromise ??= Promise.all([
    ensureIndex(usersCollection, { userId: 1 }),
    ensureIndex(usersCollection, { whatsappNumber: 1 }),
    ensureIndex(usersCollection, { jid: 1 }),
    ensureIndex(usersCollection, { owner: 1 }),
    ensureIndex(usersCollection, { websiteId: 1 }),
    ensureIndex(usersCollection, { level: -1, xp: -1 }),
    ensureIndex(usersCollection, { xp: -1, level: -1 }),
    ensureIndex(mnUsersCollection, { userId: 1 }),
    ensureIndex(mnUsersCollection, { whatsappNumber: 1 }),
    ensureIndex(mnUsersCollection, { jid: 1 }),
    ensureIndex(mnUsersCollection, { owner: 1 }),
    ensureIndex(trainerCollection, { coins: -1, _id: 1 }),
    ensureIndex(trainerCollection, { jid: 1 }),
    ensureIndex(ownedPokemonCollection, { ownerJid: 1 }),
  ])
    .then(() => {
      console.error(`[mongo] leaderboard indexes ready in ${Date.now() - startedAt}ms`);
    })
    .catch((error) => {
      console.error("[mongo] leaderboard index setup failed:", error instanceof Error ? error.message : error);
      leaderboardIndexesPromise = null;
    });
  return leaderboardIndexesPromise;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function clearConnectionCache(): void {
  const client = cache.client;
  cache.client = null;
  cache.promise = null;
  cache.healthPromise = null;
  cache.lastHealthCheckAt = 0;
  leaderboardIndexesPromise = null;
  void client?.close().catch(() => undefined);
}

async function connect(): Promise<Db> {
  const uri = getMongoUri();
  let lastError: unknown;

  for (let attempt = 0; attempt < CONNECT_RETRY_DELAYS_MS.length + 1; attempt += 1) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
      waitQueueTimeoutMS: 5_000,
      maxPoolSize: 20,
    });

    try {
      await client.connect();
      const db = client.db("kelin_md");
      cache.client = client;
      cache.lastHealthCheckAt = Date.now();
      return db;
    } catch (error) {
      lastError = error;
      await client.close().catch(() => undefined);
      const delay = CONNECT_RETRY_DELAYS_MS[attempt];
      if (delay !== undefined) await wait(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("MongoDB connection failed.");
}

async function ensureHealthy(db: Db): Promise<void> {
  if (Date.now() - cache.lastHealthCheckAt < HEALTH_CHECK_INTERVAL_MS) return;

  cache.healthPromise ??= db
    .command({ ping: 1 })
    .then(() => {
      cache.lastHealthCheckAt = Date.now();
    })
    .catch((error) => {
      clearConnectionCache();
      throw error;
    })
    .finally(() => {
      cache.healthPromise = null;
    });

  await cache.healthPromise;
}

export async function getDb(): Promise<Db> {
  cache.promise ??= connect().catch((error) => {
    cache.promise = null;
    throw error;
  });
  const db = await cache.promise;
  await ensureHealthy(db);
  // Index creation must never block the first live leaderboard response.
  // MongoDB can take a while to build an index on an existing collection.
  void ensureLeaderboardIndexes(db);
  return db;
}

export async function collection<T extends Document>(name: string): Promise<Collection<T>> {
  return (await getDb()).collection<T>(name);
}

export const users = () => collection<UserDoc>("users");
export const guilds = () => collection<GuildDoc>("guilds");
export const cardUsers = () => collection<CardDoc>("mn_users");
export const cardMarket = () => collection<CardMarketListingDoc>("mn_card_market");
export const pets = () => collection<PetDoc>("pets");
export const battleRooms = () => collection<WebBattleRoomDoc>("web_battle_rooms");
export const moderatorApplications = () =>
  collection<ModeratorApplicationDoc>("moderator_applications");
