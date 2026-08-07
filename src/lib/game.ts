/**
 * Client-safe game constants and pure helpers shared by UI and server code.
 * No database or environment access lives here.
 */

export type Rarity = "common" | "rare" | "epic" | "legend";

export type ShopItem = {
  id: string;
  name: string;
  category: "pokeball" | "potion" | "stone" | "key" | "cosmetic" | "boost";
  price: number;
  rarity: Rarity;
  description: string;
  sprite: string;
};

export type InventoryEntry = { itemId: string; qty: number };

export type PublicUser = {
  id: string;
  phoneNumber: string;
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
  guildName: string | null;
  starter: string | null;
  starterChosen: boolean;
  dailyClaimedAt: string | null;
  streak: number;
  onboarding: string[];
};

export type PublicGuild = {
  id: string;
  name: string;
  tag: string;
  description: string;
  leaderId: string;
  memberCount: number;
  level: number;
  bank: number;
  isMember: boolean;
};

export const STARTERS = [
  {
    id: "volt-kitsune",
    name: "Volt-Kitsune",
    type: "Electric",
    focus: "Speed",
    blurb: "A crackling fox spirit that outruns its own thunder.",
    sprite: "volt",
  },
  {
    id: "aqua-lumi",
    name: "Aqua-Lumi",
    type: "Water",
    focus: "Defense",
    blurb: "A tide-born guardian with a shimmering prism shell.",
    sprite: "aqua",
  },
  {
    id: "ember-ryu",
    name: "Ember-Ryu",
    type: "Fire",
    focus: "Attack",
    blurb: "A hatchling dragon whose crest burns rose-gold.",
    sprite: "ember",
  },
] as const;

export const TITLES = [
  "Rookie Trainer",
  "Neon Drifter",
  "Star Chaser",
  "Guild Vanguard",
  "Arcade Menace",
  "Master Rank",
] as const;

export const AVATARS = ["default", "volt", "aqua", "ember", "ball"] as const;

export const ONBOARDING_TASKS = [
  { id: "starter", label: "Choose your starter partner" },
  { id: "profile", label: "Personalise your profile" },
  { id: "daily", label: "Claim your first daily streak" },
  { id: "mart", label: "Buy your first item at the Mart" },
  { id: "guild", label: "Join or create a guild" },
] as const;

export const GUILD_CREATION_COST = 5000;
export const DAILY_BASE_REWARD = 250;
export const STARTING_COINS = 1000;

/** Slots reel symbols with weights and payout multipliers. */
export const SLOT_SYMBOLS = [
  { id: "ball", glyph: "◉", weight: 30, payout: 4 },
  { id: "star", glyph: "✦", weight: 24, payout: 7 },
  { id: "heart", glyph: "❤", weight: 18, payout: 12 },
  { id: "bolt", glyph: "⚡", weight: 14, payout: 20 },
  { id: "crown", glyph: "♛", weight: 9, payout: 45 },
  { id: "seven", glyph: "7", weight: 5, payout: 120 },
] as const;

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "COMMON",
  rare: "RARE",
  epic: "EPIC",
  legend: "LEGEND",
};

export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

export function xpForLevel(level: number): number {
  return Math.pow(Math.max(1, level) - 1, 2) * 100;
}

export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const span = Math.max(1, ceiling - floor);
  return {
    level,
    current: Math.max(0, xp - floor),
    needed: span,
    percent: Math.min(100, Math.round(((xp - floor) / span) * 100)),
  };
}

export function rankFromLevel(level: number): string {
  if (level >= 60) return "Master Rank";
  if (level >= 40) return "Vanguard";
  if (level >= 25) return "Elite";
  if (level >= 12) return "Drifter";
  return "Rookie";
}

export function formatCoins(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(n)));
}

/** Normalise a phone number to digits with a leading +. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}
