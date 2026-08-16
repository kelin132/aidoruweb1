import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import { getMongoUri } from "./config.server";

export type UserDoc = {
  _id: string;
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
  profilePictureUrl?: string | null;
  profilePictureUpdatedAt?: string | Date | null;
  profileBackground?: string | null;
  name?: string;
  username?: string;
  pushName?: string;
  notifyName?: string;
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
  streak?: number;
  lastDaily?: number | string | Date | null;
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
export const cardUsers = () => collection<CardDoc>("mn_users");
export const pets = () => collection<PetDoc>("pets");
export const battleRooms = () => collection<WebBattleRoomDoc>("web_battle_rooms");
