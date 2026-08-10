import { guilds, users, type GuildDoc } from "./db.server";
import { requireUser, toPublicUser } from "./auth.server";
import {
  type PublicGuild,
  type PublicUser,
  type ShopItem,
  type Rarity,
} from "./game";

const READ_ONLY_MESSAGE =
  "This portal is read-only. Use Kelin-MD2 in WhatsApp to change your account.";

const SHOP_ITEMS: ShopItem[] = [
  { id: "poke-ball", name: "Poké Ball", category: "pokeball", price: 200, rarity: "common", description: "Standard capture sphere.", sprite: "ball" },
  { id: "great-ball", name: "Great Ball", category: "pokeball", price: 600, rarity: "rare", description: "Reinforced capture sphere.", sprite: "ball" },
  { id: "ultra-ball", name: "Ultra Ball", category: "pokeball", price: 1500, rarity: "epic", description: "High-performance capture sphere.", sprite: "ball" },
  { id: "potion", name: "Potion", category: "potion", price: 150, rarity: "common", description: "Restores partner stamina.", sprite: "potion" },
  { id: "hyper-potion", name: "Hyper Potion", category: "potion", price: 900, rarity: "rare", description: "Restores substantial stamina.", sprite: "potion" },
  { id: "full-restore", name: "Full Restore", category: "potion", price: 2200, rarity: "epic", description: "Full recovery in one vial.", sprite: "potion" },
  { id: "fire-stone", name: "Fire Stone", category: "stone", price: 3000, rarity: "epic", description: "Evolutionary stone radiating heat.", sprite: "stone" },
  { id: "water-stone", name: "Water Stone", category: "stone", price: 3000, rarity: "epic", description: "Evolutionary stone with a tidal shimmer.", sprite: "stone" },
  { id: "thunder-stone", name: "Thunder Stone", category: "stone", price: 3000, rarity: "epic", description: "Evolutionary stone humming with static.", sprite: "stone" },
  { id: "guild-token", name: "Guild Token", category: "key", price: 5000, rarity: "legend", description: "Proof of guild standing.", sprite: "token" },
];

export async function listShopItems(): Promise<ShopItem[]> {
  return SHOP_ITEMS;
}

export async function getLiveSession(): Promise<PublicUser | null> {
  const user = await requireUser();
  return toPublicUser(user);
}

function guildToPublic(doc: GuildDoc, userId: string): PublicGuild {
  const id = String(doc._id ?? "");
  const members = Array.isArray(doc.members) ? doc.members : [];
  return {
    id,
    name: doc.name ?? "Unnamed guild",
    tag: (doc.name ?? "GUILD").slice(0, 5).toUpperCase(),
    description: doc.description ?? "",
    leaderId: doc.owner ?? "",
    memberCount: members.length,
    level: Number(doc.level) || 1,
    bank: Number(doc.treasury) || 0,
    isMember: members.includes(userId),
  };
}

export async function listGuilds(): Promise<PublicGuild[]> {
  const user = await requireUser();
  const docs = await (await guilds()).find({}).sort({ level: -1 }).limit(100).toArray();
  return docs.map((guild) => guildToPublic(guild, String(user._id)));
}

export async function leaderboard(): Promise<
  { id: string; name: string; xp: number; coins: number; title: string }[]
> {
  const docs = await (await users())
    .find({ registered: true }, { projection: { name: 1, xp: 1, money: 1, job: 1, isPremium: 1 } })
    .sort({ xp: -1, money: -1 })
    .limit(10)
    .toArray();
  return docs.map((doc) => ({
    id: String(doc._id),
    name: doc.name ?? "Player",
    xp: Number(doc.xp) || 0,
    coins: Number(doc.money) || 0,
    title: doc.job ?? (doc.isPremium ? "Premium Player" : "Player"),
  }));
}

export async function updateProfile(_input?: unknown): Promise<PublicUser> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function chooseStarter(_starterId?: string): Promise<PublicUser> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function claimDaily(): Promise<{ user: PublicUser; reward: number; streak: number }> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function buyItem(_input?: unknown): Promise<{ user: PublicUser; itemName: string; spent: number }> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function joinGuild(_guildId?: string): Promise<PublicUser> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function leaveGuild(): Promise<PublicUser> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function createGuild(_input?: unknown): Promise<PublicUser> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function playCoinFlip(_input?: unknown): Promise<{ user: PublicUser; result: "heads" | "tails"; won: boolean; delta: number }> {
  throw new Error(READ_ONLY_MESSAGE);
}
export async function playSlots(_input?: unknown): Promise<{ user: PublicUser; reels: string[]; delta: number; multiplier: number }> {
  throw new Error(READ_ONLY_MESSAGE);
}