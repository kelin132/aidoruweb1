import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import { getMongoUri } from "./config.server";

export type UserDoc = {
  _id: string;
  name?: string;
  bio?: string;
  registered?: boolean;
  registeredAt?: string | Date | null;
  money?: number;
  bank?: number;
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
};

export type GuildDoc = {
  _id?: string;
  name?: string;
  owner?: string;
  members?: string[];
  level?: number;
  treasury?: number;
  description?: string;
  icon?: string | null;
};

export type LinkCodeDoc = {
  _id?: unknown;
  code: string | number;
  jid?: string;
  userId?: string;
  identifier: string;
  whatsapp?: string;
  identifiers?: string[];
  jids?: string[];
  jidAliases?: string[];
  expiresAt: Date | string | number;
  usedAt?: Date | string | number | null;
};

type Cache = { client: MongoClient | null; promise: Promise<Db> | null };
const globalCache = globalThis as unknown as { __aidoruMongo?: Cache };
const cache: Cache = (globalCache.__aidoruMongo ??= { client: null, promise: null });

async function connect(): Promise<Db> {
  const client = new MongoClient(getMongoUri(), {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 10000,
    maxPoolSize: 10,
  });
  await client.connect();
  cache.client = client;
  return client.db("kelin_md");
}

export async function getDb(): Promise<Db> {
  cache.promise ??= connect().catch((error) => {
    cache.promise = null;
    throw error;
  });
  return cache.promise;
}

export async function collection<T extends Document>(name: string): Promise<Collection<T>> {
  return (await getDb()).collection<T>(name);
}

export const users = () => collection<UserDoc>("users");
export const guilds = () => collection<GuildDoc>("guilds");
export const linkCodes = () => collection<LinkCodeDoc>("web_link_codes");
