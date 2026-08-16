/**
 * Client-safe game constants and pure helpers shared by UI and server code.
 * No database or environment access lives here.
 */

export type Rarity = "common" | "rare" | "epic" | "legend";

export type ShopItem = {
  id: string;
  name: string;
  slug?: string;
  category:
    | "pokeball"
    | "potion"
    | "stone"
    | "key"
    | "cosmetic"
    | "boost"
    | "ball"
    | "heal"
    | "battle"
    | "cure"
    | "vitamin"
    | "mega";
  price: number;
  rarity: Rarity;
  description: string;
  sprite: string;
  emoji?: string;
  page?: number;
  index?: number;
  imageUrl?: string;
};

export type OwnedPokemon = {
  id: string;
  name: string;
  displayName: string;
  nickname: string | null;
  level: number;
  xp: number;
  xpNeeded: number;
  hp: number;
  maxHp: number;
  types: string[];
  primaryType: string;
  imageUrl: string;
  shiny: boolean;
  inParty: boolean;
  isStarter: boolean;
};

export type LeaderboardRow = {
  id: string;
  name: string;
  title: string;
  score: number;
  scoreLabel: string;
  xp: number;
  trainerXp: number;
  trainerLevel: number;
  coins: number;
  avatarUrl: string | null;
  pokemonCount: number;
  cardCount: number;
};

export type LeaderboardMetric = "xp" | "coins" | "cards" | "pokemon";

export type InventoryEntry = { itemId: string; qty: number };

export type OwnedCard = {
  cardId: string;
  name: string;
  tier: string;
  tierNum: number;
  index: number | null;
  spawnId: string | null;
  price: number;
  series: string;
  media: string;
  mediaType: string;
  obtainedAt: string | null;
};

export type OwnedPet = {
  petId: string;
  name: string;
  species: string;
  rarity: string;
  level: number;
  exp: number;
  expNeeded: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  hunger: number;
  happiness: number;
  imageUrl: string;
  skill: string;
  isActive: boolean;
  lastFed: string | null;
  lastPlayed: string | null;
};

export type PetAction = "feed" | "play" | "hatch" | "release" | "select" | "shop";

export type BattleMove = {
  name: string;
  type: string;
  power: number;
  accuracy: number;
  pp?: number;
  priority?: number;
  desc?: string;
};

export type BattlePokemon = {
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
  moves: BattleMove[];
  fainted: boolean;
};

export type BattleTrainer = {
  id: string;
  name: string;
  avatarUrl: string | null;
  trainerSpriteUrl: string | null;
  ready: boolean;
  party: BattlePokemon[];
  activeIndex: number;
  inventory: Record<string, number>;
};

export type BattleRoomSummary = {
  id: string;
  code: string;
  status: "waiting" | "active" | "finished";
  challenger: { id: string; name: string; avatarUrl: string | null; ready: boolean };
  opponent: { id: string; name: string; avatarUrl: string | null; ready: boolean } | null;
  spectators: number;
  createdAt: string;
  lastActionAt: string;
};

export type BattleRoom = BattleRoomSummary & {
  turn: "challenger" | "opponent" | null;
  forcedSwitch: "challenger" | "opponent" | null;
  round: number;
  winnerId: string | null;
  challenger: BattleTrainer;
  opponent: BattleTrainer | null;
  combatLog: string[];
  expiresAt: string | null;
  joinedAs: "challenger" | "opponent" | "spectator" | null;
};

export type BattleAction =
  | { type: "ready" }
  | { type: "move"; moveIndex: number }
  | { type: "switch"; pokemonIndex: number }
  | { type: "item"; item: "potion" | "superpotion" | "hyperpotion" | "revive" | "fullrestore" }
  | { type: "forfeit" };

export type PublicUser = {
  id: string;
  websiteId: string;
  name: string;
  bio: string;
  title: string;
  avatar: string;
  avatarUrl: string | null;
  banner: string;
  coins: number;
  bank: number;
  xp: number;
  inventory: InventoryEntry[];
  trainerInventory: InventoryEntry[];
  trainerCoins: number;
  trainerLevel: number;
  trainerXp: number;
  partyPokemon: OwnedPokemon[];
  pcPokemon: OwnedPokemon[];
  leadPokemonId: string | null;
  guildId: string | null;
  guildName: string | null;
  starter: string | null;
  starterChosen: boolean;
  dailyClaimedAt: string | null;
  streak: number;
  onboarding: string[];
  pokemon: OwnedPokemon[];
};

export type PublicGuild = {
  id: string;
  name: string;
  tag: string;
  description: string;
  iconUrl: string | null;
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

export const PET_RARITY_LABEL: Record<string, string> = {
  common: "COMMON",
  uncommon: "UNCOMMON",
  rare: "RARE",
  epic: "EPIC",
  legendary: "LEGENDARY",
  mythic: "MYTHIC",
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

export function trainerLevelProgress(level: number, xp: number) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const current = Math.max(0, Math.floor(Number(xp) || 0));
  const needed = safeLevel * 100;
  return {
    level: safeLevel,
    current,
    needed,
    percent: Math.min(100, Math.round((current / needed) * 100)),
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

export function formatCompactCoins(n: number): string {
  const value = Math.max(0, Number(n) || 0);
  if (value < 1_000_000) return formatCoins(value);
  const units = [
    { threshold: 1_000_000_000_000, suffix: "t" },
    { threshold: 1_000_000_000, suffix: "b" },
    { threshold: 1_000_000, suffix: "m" },
    { threshold: 1_000, suffix: "k" },
  ];
  const unit = units.find(({ threshold }) => value >= threshold);
  if (!unit) return formatCoins(value);
  const amount = value / unit.threshold;
  const digits = amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(digits).replace(/\\.?0+$/, "")}${unit.suffix}`;
}
