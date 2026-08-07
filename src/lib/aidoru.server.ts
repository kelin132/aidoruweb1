import { ObjectId } from "mongodb";
import { users, guilds, shopItems, type GuildDoc } from "./db.server";
import { requireUser, toPublicUser } from "./auth.server";
import {
  DAILY_BASE_REWARD,
  GUILD_CREATION_COST,
  SLOT_SYMBOLS,
  STARTERS,
  TITLES,
  AVATARS,
  type PublicGuild,
  type PublicUser,
  type ShopItem,
} from "./game";

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export async function listShopItems(): Promise<ShopItem[]> {
  const col = await shopItems();
  const docs = await col.find({}).sort({ price: 1 }).toArray();
  return docs.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category as ShopItem["category"],
    price: d.price,
    rarity: d.rarity as ShopItem["rarity"],
    description: d.description,
    sprite: d.sprite,
  }));
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export async function updateProfile(input: {
  name: string;
  bio: string;
  title: string;
  avatar: string;
  banner: string;
}): Promise<PublicUser> {
  const user = await requireUser();
  const name = input.name.trim().slice(0, 32);
  if (name.length < 2) throw new Error("Name must be at least 2 characters.");
  const bio = input.bio.trim().slice(0, 240);
  const title = (TITLES as readonly string[]).includes(input.title) ? input.title : user.title;
  const avatar = (AVATARS as readonly string[]).includes(input.avatar) ? input.avatar : user.avatar;
  const banner = ["aurora", "neon", "sakura"].includes(input.banner) ? input.banner : user.banner;

  const col = await users();
  const onboarding = Array.from(new Set([...(user.onboarding ?? []), "profile"]));
  await col.updateOne(
    { _id: user._id } as never,
    { $set: { name, bio, title, avatar, banner, onboarding } },
  );
  return toPublicUser({ ...user, name, bio, title, avatar, banner, onboarding });
}

/* ------------------------------------------------------------------ */
/* Journey                                                             */
/* ------------------------------------------------------------------ */

export async function chooseStarter(starterId: string): Promise<PublicUser> {
  const user = await requireUser();
  if (user.starterChosen) throw new Error("You have already chosen a partner.");
  const starter = STARTERS.find((s) => s.id === starterId);
  if (!starter) throw new Error("Unknown starter partner.");

  const col = await users();
  const onboarding = Array.from(new Set([...(user.onboarding ?? []), "starter"]));
  const xp = (user.xp ?? 0) + 150;
  await col.updateOne(
    { _id: user._id } as never,
    { $set: { starter: starter.id, starterChosen: true, xp, onboarding } },
  );
  return toPublicUser({ ...user, starter: starter.id, starterChosen: true, xp, onboarding });
}

export async function claimDaily(): Promise<{ user: PublicUser; reward: number; streak: number }> {
  const user = await requireUser();
  const now = new Date();
  const last = user.dailyClaimedAt ? new Date(user.dailyClaimedAt) : null;

  if (last) {
    const hours = (now.getTime() - last.getTime()) / 36e5;
    if (hours < 20) {
      const wait = Math.ceil(20 - hours);
      throw new Error(`Already claimed. Come back in about ${wait}h.`);
    }
  }

  const withinChain = last ? (now.getTime() - last.getTime()) / 36e5 <= 48 : false;
  const streak = withinChain ? (user.streak ?? 0) + 1 : 1;
  const reward = DAILY_BASE_REWARD + Math.min(streak, 14) * 75;
  const coins = (user.coins ?? 0) + reward;
  const xp = (user.xp ?? 0) + 60;
  const onboarding = Array.from(new Set([...(user.onboarding ?? []), "daily"]));

  const col = await users();
  await col.updateOne(
    { _id: user._id } as never,
    { $set: { coins, xp, streak, dailyClaimedAt: now, onboarding } },
  );
  const publicUser = await toPublicUser({
    ...user,
    coins,
    xp,
    streak,
    dailyClaimedAt: now,
    onboarding,
  });
  return { user: publicUser, reward, streak };
}

/* ------------------------------------------------------------------ */
/* Mart                                                                */
/* ------------------------------------------------------------------ */

export async function buyItem(input: {
  itemId: string;
  qty: number;
}): Promise<{ user: PublicUser; spent: number; itemName: string }> {
  const user = await requireUser();
  const qty = Math.max(1, Math.min(99, Math.floor(input.qty)));

  const itemCol = await shopItems();
  const item = await itemCol.findOne({ id: input.itemId });
  if (!item) throw new Error("That item is not stocked right now.");

  const cost = item.price * qty;
  if ((user.coins ?? 0) < cost) throw new Error("Not enough coins for that purchase.");

  const inventory = Array.isArray(user.inventory) ? [...user.inventory] : [];
  const idx = inventory.findIndex((e) => e.itemId === item.id);
  if (idx >= 0) inventory[idx] = { itemId: item.id, qty: inventory[idx]!.qty + qty };
  else inventory.push({ itemId: item.id, qty });

  const coins = (user.coins ?? 0) - cost;
  const onboarding = Array.from(new Set([...(user.onboarding ?? []), "mart"]));

  const col = await users();
  await col.updateOne({ _id: user._id } as never, { $set: { coins, inventory, onboarding } });

  return {
    user: await toPublicUser({ ...user, coins, inventory, onboarding }),
    spent: cost,
    itemName: item.name,
  };
}

/* ------------------------------------------------------------------ */
/* Guilds                                                              */
/* ------------------------------------------------------------------ */

function toPublicGuild(doc: GuildDoc, userId: string): PublicGuild {
  return {
    id: String(doc._id),
    name: doc.name,
    tag: doc.tag,
    description: doc.description,
    leaderId: doc.leaderId,
    memberCount: Array.isArray(doc.members) ? doc.members.length : 0,
    level: doc.level ?? 1,
    bank: doc.bank ?? 0,
    isMember: Array.isArray(doc.members) ? doc.members.includes(userId) : false,
  };
}

export async function listGuilds(): Promise<PublicGuild[]> {
  const user = await requireUser();
  const col = await guilds();
  const docs = await col.find({}).sort({ level: -1, bank: -1 }).toArray();
  return docs.map((d) => toPublicGuild(d, String(user._id)));
}

export async function joinGuild(guildId: string): Promise<PublicUser> {
  const user = await requireUser();
  const userId = String(user._id);
  const col = await guilds();

  let oid: ObjectId;
  try {
    oid = new ObjectId(guildId);
  } catch {
    throw new Error("Unknown guild.");
  }
  const guild = await col.findOne({ _id: oid } as never);
  if (!guild) throw new Error("Unknown guild.");
  if (user.guildId === guildId) throw new Error("You are already in this guild.");

  if (user.guildId) {
    try {
      await col.updateOne(
        { _id: new ObjectId(user.guildId) } as never,
        { $pull: { members: userId } },
      );
    } catch {
      /* previous guild missing — ignore */
    }
  }

  await col.updateOne({ _id: oid } as never, { $addToSet: { members: userId } });
  const onboarding = Array.from(new Set([...(user.onboarding ?? []), "guild"]));
  const userCol = await users();
  await userCol.updateOne({ _id: user._id } as never, { $set: { guildId: guildId, onboarding } });
  return toPublicUser({ ...user, guildId, onboarding });
}

export async function leaveGuild(): Promise<PublicUser> {
  const user = await requireUser();
  if (!user.guildId) throw new Error("You are not in a guild.");
  const col = await guilds();
  try {
    await col.updateOne(
      { _id: new ObjectId(user.guildId) } as never,
      { $pull: { members: String(user._id) } },
    );
  } catch {
    /* ignore */
  }
  const userCol = await users();
  await userCol.updateOne({ _id: user._id } as never, { $set: { guildId: null } });
  return toPublicUser({ ...user, guildId: null });
}

export async function createGuild(input: {
  name: string;
  tag: string;
  description: string;
}): Promise<PublicUser> {
  const user = await requireUser();
  const name = input.name.trim().slice(0, 32);
  const tag = input.tag.trim().toUpperCase().slice(0, 5);
  const description = input.description.trim().slice(0, 200);

  if (name.length < 3) throw new Error("Guild name must be at least 3 characters.");
  if (tag.length < 2) throw new Error("Guild tag must be at least 2 characters.");
  if ((user.coins ?? 0) < GUILD_CREATION_COST)
    throw new Error(`You need ${GUILD_CREATION_COST} coins to charter a guild.`);

  const col = await guilds();
  if (await col.findOne({ $or: [{ name }, { tag }] }))
    throw new Error("That guild name or tag is taken.");

  const userId = String(user._id);
  const result = await col.insertOne({
    name,
    tag,
    description,
    leaderId: userId,
    members: [userId],
    level: 1,
    bank: Math.floor(GUILD_CREATION_COST / 2),
    createdAt: new Date(),
  });

  if (user.guildId) {
    try {
      await col.updateOne(
        { _id: new ObjectId(user.guildId) } as never,
        { $pull: { members: userId } },
      );
    } catch {
      /* ignore */
    }
  }

  const coins = (user.coins ?? 0) - GUILD_CREATION_COST;
  const guildId = String(result.insertedId);
  const onboarding = Array.from(new Set([...(user.onboarding ?? []), "guild"]));
  const userCol = await users();
  await userCol.updateOne({ _id: user._id } as never, { $set: { coins, guildId, onboarding } });
  return toPublicUser({ ...user, coins, guildId, onboarding });
}

/* ------------------------------------------------------------------ */
/* Arcade                                                              */
/* ------------------------------------------------------------------ */

function validateWager(user: { coins?: number }, wager: number) {
  const amount = Math.floor(wager);
  if (!Number.isFinite(amount) || amount < 50) throw new Error("Minimum wager is 50 coins.");
  if (amount > 100000) throw new Error("Maximum wager is 100,000 coins.");
  if ((user.coins ?? 0) < amount) throw new Error("Not enough coins for that wager.");
  return amount;
}

export async function playCoinFlip(input: {
  wager: number;
  pick: "heads" | "tails";
}): Promise<{ user: PublicUser; result: "heads" | "tails"; won: boolean; delta: number }> {
  const user = await requireUser();
  const amount = validateWager(user, input.wager);
  const result: "heads" | "tails" = Math.random() < 0.5 ? "heads" : "tails";
  const won = result === input.pick;
  const delta = won ? amount : -amount;

  const coins = (user.coins ?? 0) + delta;
  const xp = (user.xp ?? 0) + (won ? 25 : 8);
  const col = await users();
  await col.updateOne({ _id: user._id } as never, { $set: { coins, xp } });

  return { user: await toPublicUser({ ...user, coins, xp }), result, won, delta };
}

function spinReel(): (typeof SLOT_SYMBOLS)[number] {
  const total = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;
  for (const symbol of SLOT_SYMBOLS) {
    roll -= symbol.weight;
    if (roll <= 0) return symbol;
  }
  return SLOT_SYMBOLS[0]!;
}

export async function playSlots(input: {
  wager: number;
}): Promise<{ user: PublicUser; reels: string[]; delta: number; multiplier: number }> {
  const user = await requireUser();
  const amount = validateWager(user, input.wager);

  const reels = [spinReel(), spinReel(), spinReel()];
  let multiplier = 0;
  if (reels[0]!.id === reels[1]!.id && reels[1]!.id === reels[2]!.id) {
    multiplier = reels[0]!.payout;
  } else if (
    reels[0]!.id === reels[1]!.id ||
    reels[1]!.id === reels[2]!.id ||
    reels[0]!.id === reels[2]!.id
  ) {
    multiplier = 1.5;
  }

  const payout = Math.floor(amount * multiplier);
  const delta = payout - amount;
  const coins = (user.coins ?? 0) + delta;
  const xp = (user.xp ?? 0) + (multiplier > 0 ? 30 : 10);

  const col = await users();
  await col.updateOne({ _id: user._id } as never, { $set: { coins, xp } });

  return {
    user: await toPublicUser({ ...user, coins, xp }),
    reels: reels.map((r) => r.id),
    delta,
    multiplier,
  };
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                         */
/* ------------------------------------------------------------------ */

export async function leaderboard(): Promise<
  { id: string; name: string; xp: number; coins: number; title: string }[]
> {
  const col = await users();
  const docs = await col
    .find({}, { projection: { name: 1, xp: 1, coins: 1, title: 1 } })
    .sort({ xp: -1, coins: -1 })
    .limit(10)
    .toArray();
  return docs.map((d) => ({
    id: String(d._id),
    name: d.name ?? "Trainer",
    xp: d.xp ?? 0,
    coins: d.coins ?? 0,
    title: d.title ?? "Rookie Trainer",
  }));
}
