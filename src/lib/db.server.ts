import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import type { InventoryEntry } from "./game";

export type UserDoc = {
  _id?: unknown;
  phoneNumber: string;
  passwordHash: string;
  name: string;
  bio: string;
  title: string;
  avatar: string;
  banner: string;
  coins: number;
  bank: number;
  xp: number;
  inventory: InventoryEntry[];
  guildId: string | null;
  starter: string | null;
  starterChosen: boolean;
  dailyClaimedAt: Date | null;
  streak: number;
  onboarding: string[];
  createdAt: Date;
};

export type GuildDoc = {
  _id?: unknown;
  name: string;
  tag: string;
  description: string;
  leaderId: string;
  members: string[];
  level: number;
  bank: number;
  createdAt: Date;
};

export type ShopItemDoc = {
  _id?: unknown;
  id: string;
  name: string;
  category: string;
  price: number;
  rarity: string;
  description: string;
  sprite: string;
};

type Cache = { client: MongoClient | null; promise: Promise<Db> | null };

const globalCache = globalThis as unknown as { __aidoruMongo?: Cache };
const cache: Cache = (globalCache.__aidoruMongo ??= { client: null, promise: null });

const SEED_ITEMS: ShopItemDoc[] = [
  {
    id: "poke-ball",
    name: "Poké Ball",
    category: "pokeball",
    price: 200,
    rarity: "common",
    description: "Standard capture sphere. Reliable on weakened partners.",
    sprite: "ball",
  },
  {
    id: "great-ball",
    name: "Great Ball",
    category: "pokeball",
    price: 600,
    rarity: "rare",
    description: "Reinforced coil. Noticeably better capture rate.",
    sprite: "ball",
  },
  {
    id: "ultra-ball",
    name: "Ultra Ball",
    category: "pokeball",
    price: 1500,
    rarity: "epic",
    description: "High-performance sphere tuned for rare encounters.",
    sprite: "ball",
  },
  {
    id: "master-ball",
    name: "Master Ball",
    category: "pokeball",
    price: 12000,
    rarity: "legend",
    description: "Never fails. One is all you will ever need.",
    sprite: "ball",
  },
  {
    id: "potion",
    name: "Potion",
    category: "potion",
    price: 150,
    rarity: "common",
    description: "Restores a small amount of your partner's stamina.",
    sprite: "potion",
  },
  {
    id: "hyper-potion",
    name: "Hyper Potion",
    category: "potion",
    price: 900,
    rarity: "rare",
    description: "Restores a large amount of stamina instantly.",
    sprite: "potion",
  },
  {
    id: "full-restore",
    name: "Full Restore",
    category: "potion",
    price: 2200,
    rarity: "epic",
    description: "Full stamina and status recovery in one vial.",
    sprite: "potion",
  },
  {
    id: "fire-stone",
    name: "Fire Stone",
    category: "stone",
    price: 3000,
    rarity: "epic",
    description: "Evolutionary stone radiating steady heat.",
    sprite: "stone",
  },
  {
    id: "water-stone",
    name: "Water Stone",
    category: "stone",
    price: 3000,
    rarity: "epic",
    description: "Evolutionary stone with a tidal shimmer.",
    sprite: "stone",
  },
  {
    id: "thunder-stone",
    name: "Thunder Stone",
    category: "stone",
    price: 3000,
    rarity: "epic",
    description: "Evolutionary stone humming with static.",
    sprite: "stone",
  },
  {
    id: "guild-token",
    name: "Guild Token",
    category: "key",
    price: 5000,
    rarity: "legend",
    description: "Proof of standing. Required for guild charters.",
    sprite: "token",
  },
  {
    id: "rare-candy",
    name: "Rare Candy",
    category: "boost",
    price: 1800,
    rarity: "rare",
    description: "Grants an instant burst of experience.",
    sprite: "candy",
  },
  {
    id: "xp-charm",
    name: "XP Charm",
    category: "boost",
    price: 4200,
    rarity: "epic",
    description: "Doubles experience gain for your next session.",
    sprite: "charm",
  },
  {
    id: "lucky-egg",
    name: "Lucky Egg",
    category: "boost",
    price: 2600,
    rarity: "rare",
    description: "Improves your odds across the Arcade zone.",
    sprite: "egg",
  },
  {
    id: "banner-neon",
    name: "Neon Skyline Banner",
    category: "cosmetic",
    price: 1200,
    rarity: "rare",
    description: "A drifting neon skyline for your profile header.",
    sprite: "banner",
  },
  {
    id: "banner-sakura",
    name: "Sakura Drift Banner",
    category: "cosmetic",
    price: 1200,
    rarity: "rare",
    description: "Soft petals over a pastel dusk gradient.",
    sprite: "banner",
  },
  {
    id: "title-card",
    name: "Title Card",
    category: "cosmetic",
    price: 800,
    rarity: "common",
    description: "Unlocks an extra anime title badge slot.",
    sprite: "card",
  },
  {
    id: "avatar-frame",
    name: "Holo Avatar Frame",
    category: "cosmetic",
    price: 2400,
    rarity: "epic",
    description: "An iridescent ring that orbits your avatar.",
    sprite: "frame",
  },
];

const SEED_GUILDS: Omit<GuildDoc, "_id">[] = [
  {
    name: "Neon Syndicate",
    tag: "NEON",
    description: "Night-shift traders and arcade regulars. Loud, fast, generous.",
    leaderId: "system",
    members: [],
    level: 12,
    bank: 84200,
    createdAt: new Date("2026-01-14T00:00:00Z"),
  },
  {
    name: "Void Walkers",
    tag: "VOID",
    description: "Quiet collectors chasing legendary encounters only.",
    leaderId: "system",
    members: [],
    level: 9,
    bank: 51600,
    createdAt: new Date("2026-02-02T00:00:00Z"),
  },
  {
    name: "Sakura Circuit",
    tag: "SKRA",
    description: "A friendly starter-run guild. New trainers always welcome.",
    leaderId: "system",
    members: [],
    level: 5,
    bank: 18400,
    createdAt: new Date("2026-03-21T00:00:00Z"),
  },
];

async function connect(): Promise<Db> {
  const uri = process.env["MONGODB_URI"];
  if (!uri) throw new Error("MONGODB_URI is not configured.");
  const dbName = process.env["MONGODB_DB"] || "kelin132";

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 5,
  });
  await client.connect();
  cache.client = client;
  const db = client.db(dbName);
  await bootstrap(db);
  return db;
}

let bootstrapped = false;

async function bootstrap(db: Db) {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    await db.collection("users").createIndex({ phoneNumber: 1 }, { unique: true });
    await db.collection("guilds").createIndex({ name: 1 }, { unique: true });
    await db.collection("guilds").createIndex({ tag: 1 }, { unique: true });
    await db.collection("shopitems").createIndex({ id: 1 }, { unique: true });

    const items = db.collection<ShopItemDoc>("shopitems");
    for (const item of SEED_ITEMS) {
      await items.updateOne({ id: item.id }, { $setOnInsert: item }, { upsert: true });
    }

    const guilds = db.collection<GuildDoc>("guilds");
    if ((await guilds.estimatedDocumentCount()) === 0) {
      await guilds.insertMany(SEED_GUILDS as GuildDoc[]);
    }
  } catch (error) {
    console.error("[aidoru] bootstrap warning", error);
  }
}

export async function getDb(): Promise<Db> {
  cache.promise ??= connect().catch((error) => {
    cache.promise = null;
    throw error;
  });
  return cache.promise;
}

export async function collection<T extends Document>(name: string): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

export const users = () => collection<UserDoc>("users");
export const guilds = () => collection<GuildDoc>("guilds");
export const shopItems = () => collection<ShopItemDoc>("shopitems");
