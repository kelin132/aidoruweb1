import { randomUUID } from "node:crypto";
import {
  battleRooms,
  cardUsers,
  getDb,
  guilds,
  pets,
  users,
  type GuildDoc,
  type PetDoc,
  type WebBattleMoveDoc,
  type WebBattlePokemonDoc,
  type WebBattleRoomDoc,
  type WebBattleTrainerDoc,
} from "./db.server";
import { requireUser, toPublicUser } from "./auth.server";
import { BOT_MART_ITEMS } from "./martCatalog";
import {
  GUILD_CREATION_COST,
  type LeaderboardMetric,
  type LeaderboardRow,
  type PublicGuild,
  type PublicUser,
  type ShopItem,
  type Rarity,
  type OwnedCard,
  type OwnedPet,
  type BattleAction,
  type BattleRoom,
  type BattleRoomSummary,
} from "./game";

const SLOT_POOL = [
  ...Array(6).fill("🍒"),
  ...Array(5).fill("🍋"),
  ...Array(5).fill("🍊"),
  ...Array(4).fill("🍇"),
  ...Array(3).fill("🔔"),
  ...Array(2).fill("💎"),
  "7️⃣",
  ...Array(2).fill("🃏"),
] as const;
const SLOT_PAYOUTS: Record<string, number> = {
  "7️⃣": 10,
  "💎": 7,
  "🔔": 5,
  "🍇": 4,
  "🍊": 3,
  "🍋": 2.5,
  "🍒": 2,
  "🃏": 1.5,
};

function rarityForPrice(price: number): Rarity {
  if (price >= 10000) return "legend";
  if (price >= 2500) return "epic";
  if (price >= 800) return "rare";
  return "common";
}

function userKey(user: { _id: unknown }): string {
  return String(user._id);
}

function identityVariants(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const withoutDevice = raw.replace(/:\d+(?=@)/, "");
  const bare = withoutDevice.split("@")[0] ?? withoutDevice;
  return [...new Set([raw, withoutDevice, bare, `${bare}@s.whatsapp.net`, `${bare}:0@s.whatsapp.net`].filter(Boolean))];
}

function identityLookup(ids: string[]) {
  const variants = [...new Set(ids.flatMap(identityVariants))];
  return { $or: variants.map((id) => ({ _id: id })) };
}

function randomChoice<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function validWager(value: unknown, minimum: number, maximum: number): number {
  const amount = Math.floor(Number(value));
  if (!Number.isFinite(amount) || amount < minimum || amount > maximum) {
    throw new Error(
      `Wager must be between $${minimum.toLocaleString()} and $${maximum.toLocaleString()}.`,
    );
  }
  return amount;
}

async function publicCurrentUser(): Promise<PublicUser> {
  return toPublicUser(await requireUser());
}

async function appendHistory(jid: string, type: string, amount: number, desc: string) {
  const db = await getDb();
  await db
    .collection("users")
    .updateOne(
      { _id: jid } as never,
      {
        $push: { history: { $each: [{ type, amount, desc, ts: Date.now() }], $slice: -10 } },
      } as never,
    );
}

async function claimCooldown(
  jid: string,
  field: string,
  cooldownMs: number,
): Promise<{ ok: boolean; remainingMs: number }> {
  const now = Date.now();
  const result = await (
    await users()
  ).updateOne(
    {
      _id: jid,
      $or: [{ [field]: { $exists: false } }, { [field]: { $lte: now - cooldownMs } }],
    } as never,
    { $set: { [field]: now } } as never,
  );
  if (result.modifiedCount === 1) return { ok: true, remainingMs: 0 };
  const current = await (await users()).findOne({ _id: jid } as never);
  const last = Number(current?.[field as keyof typeof current] ?? now);
  return { ok: false, remainingMs: Math.max(0, cooldownMs - (now - last)) };
}

async function refundWallet(jid: string, amount: number) {
  if (amount <= 0) return;
  await (await users()).updateOne({ _id: jid }, { $inc: { money: amount } } as never);
}

export async function listShopItems(): Promise<ShopItem[]> {
  return BOT_MART_ITEMS.map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    category: item.category as ShopItem["category"],
    price: item.price,
    rarity: rarityForPrice(item.price),
    description: item.description,
    sprite: item.slug,
    emoji: item.emoji,
    page: item.page,
    index: item.index,
    imageUrl: item.imageUrl,
  }));
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
    iconUrl: typeof doc.icon === "string" && doc.icon.trim() ? doc.icon : null,
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
  return docs.map((guild) => guildToPublic(guild, userKey(user)));
}

function trainerTotalXp(level: number, currentXp: number): number {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const safeXp = Math.max(0, Math.floor(Number(currentXp) || 0));
  return ((safeLevel - 1) * safeLevel * 100) / 2 + safeXp;
}

function rowFromUser(
  doc: Record<string, unknown>,
  metric: LeaderboardMetric,
  score: number,
  counts?: { pokemonCount?: number; cardCount?: number },
): LeaderboardRow {
  const title = String(doc["job"] ?? (doc["isPremium"] ? "Premium Player" : "Player"));
  const avatar = ["profilePictureUrl", "avatarUrl", "profileImage"].find(
    (key) => typeof doc[key] === "string" && String(doc[key]).trim(),
  );
  return {
    id: String(doc["websiteId"] ?? doc["_id"] ?? ""),
    name: String(
      doc["name"] ?? doc["username"] ?? doc["pushName"] ?? doc["notifyName"] ?? "Player",
    ),
    title,
    score,
    scoreLabel:
      metric === "xp"
        ? "XP"
        : metric === "coins"
          ? "COINS"
          : metric === "cards"
            ? "CARDS"
            : "POKÉMON",
    xp: Number(doc["xp"]) || 0,
    trainerXp: Number(doc["trainerXp"] ?? doc["xp"]) || 0,
    trainerLevel: Number(doc["trainerLevel"] ?? 1) || 1,
    coins: (Number(doc["money"]) || 0) + (Number(doc["bank"]) || 0),
    avatarUrl: avatar ? String(doc[avatar]) : null,
    pokemonCount: counts?.pokemonCount ?? 0,
    cardCount: counts?.cardCount ?? 0,
  };
}

export async function leaderboard(metric: LeaderboardMetric = "xp"): Promise<LeaderboardRow[]> {
  const db = await getDb();
  const userCollection = await users();

  if (metric === "xp") {
    const trainerDocs = await db
      .collection("pokemon_trainers")
      .find({ jid: { $exists: true } })
      .limit(500)
      .toArray();
    const trainerEntries = trainerDocs
      .map((trainer) => {
        const record = trainer as Record<string, unknown>;
        const jid = String(record["jid"] ?? "");
        const level = Number(record["level"]) || 1;
        const trainerXp = Number(record["xp"]) || 0;
        return { jid, level, trainerXp, score: trainerTotalXp(level, trainerXp) };
      })
      .filter((entry) => entry.jid)
      .sort((a, b) => b.score - a.score || a.jid.localeCompare(b.jid))
      .slice(0, 10);
    const docs = await userCollection.find(identityLookup(trainerEntries.map((entry) => entry.jid)) as never).toArray();
    const byId = new Map<string, Record<string, unknown>>();
    for (const doc of docs) {
      const record = doc as Record<string, unknown>;
      for (const alias of identityVariants(record["_id"])) byId.set(alias, record);
    }
    return trainerEntries.flatMap((entry) => {
      const doc = identityVariants(entry.jid).map((alias) => byId.get(alias)).find(Boolean);
      if (!doc) return [];
      return [rowFromUser({ ...doc, trainerXp: entry.trainerXp, trainerLevel: entry.level }, metric, entry.score)];
    });
  }

  if (metric === "cards") {
    const cardDocs = await db
      .collection("mn_users")
      .find({ cards: { $exists: true } })
      .limit(200)
      .toArray();
    const ranked = cardDocs
      .map((doc) => ({
        jid: String(doc["userId"] ?? doc["whatsappNumber"] ?? doc["jid"] ?? ""),
        score: Array.isArray(doc["cards"]) ? doc["cards"].length : 0,
      }))
      .filter((entry) => entry.jid)
      .sort((a, b) => b.score - a.score || a.jid.localeCompare(b.jid))
      .slice(0, 10);
    const docs = await userCollection.find(identityLookup(ranked.map((entry) => entry.jid)) as never).toArray();
    const byId = new Map<string, Record<string, unknown>>();
    for (const doc of docs) {
      const record = doc as Record<string, unknown>;
      for (const alias of identityVariants(record["_id"])) byId.set(alias, record);
    }
    return ranked.flatMap((entry) => {
      const doc = identityVariants(entry.jid).map((alias) => byId.get(alias)).find(Boolean);
      return doc ? [rowFromUser(doc, metric, entry.score, { cardCount: entry.score })] : [];
    });
  }

  if (metric === "pokemon") {
    const ranked = await db
      .collection("pokemon_owned")
      .aggregate([
        { $group: { _id: "$ownerJid", score: { $sum: 1 } } },
        { $sort: { score: -1 } },
        { $limit: 10 },
      ])
      .toArray();
    const ids = ranked.map((entry) => String(entry["_id"]));
    const lookupIds = [...new Set(ids.flatMap((id) => [id, id.includes("@") ? id : `${id}@s.whatsapp.net`]))];
    const docs = await userCollection
      .find({ _id: { $in: lookupIds } } as never)
      .toArray();
    const byId = new Map<string, Record<string, unknown>>();
    for (const doc of docs) {
      const record = doc as Record<string, unknown>;
      const rawId = String(record["_id"] ?? "");
      byId.set(rawId, record);
      byId.set(rawId.split("@")[0] ?? rawId, record);
    }
    return ranked.flatMap((entry) => {
      const jid = String(entry["_id"]);
      const doc = byId.get(jid) ?? byId.get(jid.split("@")[0] ?? jid);
      const score = Number(entry["score"]) || 0;
      return doc ? [rowFromUser(doc, metric, score, { pokemonCount: score })] : [];
    });
  }

  const docs = await userCollection
    .find(
      { registered: true },
      {
        projection: {
          name: 1,
          username: 1,
          pushName: 1,
          notifyName: 1,
          websiteId: 1,
          xp: 1,
          money: 1,
          bank: 1,
          job: 1,
          isPremium: 1,
          profilePictureUrl: 1,
          avatarUrl: 1,
          profileImage: 1,
        },
      },
    )
    .limit(500)
    .toArray();
  return docs
    .map((doc) => {
      const record = doc as Record<string, unknown>;
      const score =
        metric === "coins"
          ? (Number(record["money"]) || 0) + (Number(record["bank"]) || 0)
          : Number(record["xp"]) || 0;
      return { record, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const xpA = Number(a.record["xp"]) || 0;
      const xpB = Number(b.record["xp"]) || 0;
      if (xpA !== xpB) return xpB - xpA;
      return String(a.record["name"] ?? a.record["username"] ?? "").localeCompare(
        String(b.record["name"] ?? b.record["username"] ?? ""),
      );
    })
    .slice(0, 10)
    .map(({ record, score }) => rowFromUser(record, metric, score));
}

function ownerKeys(user: { _id: unknown }): string[] {
  return identityVariants(userKey(user));
}

function normalizeCard(card: Record<string, unknown>, index: number): OwnedCard {
  return {
    cardId: String(card["cardId"] ?? card["id"] ?? `card-${index}`),
    name: String(card["name"] ?? "Unnamed card"),
    tier: String(card["tier"] ?? card["rarity"] ?? "common"),
    tierNum: Number(card["tierNum"] ?? 0) || 0,
    index: Number.isInteger(Number(card["index"])) ? Number(card["index"]) : index,
    spawnId: card["spawnId"] ? String(card["spawnId"]) : null,
    price: Number(card["price"] ?? 0) || 0,
    series: String(card["series"] ?? "AIDORU"),
    media: typeof card["media"] === "string" ? card["media"] : "",
    mediaType: String(card["mediaType"] ?? "image"),
    obtainedAt: card["obtainedAt"] ? String(card["obtainedAt"]) : null,
  };
}

export async function listMyCards(): Promise<OwnedCard[]> {
  const user = await requireUser();
  const keys = ownerKeys(user);
  const doc = await (await cardUsers()).findOne({
    $or: [{ userId: { $in: keys } }, { whatsappNumber: { $in: keys } }, { jid: { $in: keys } }],
  } as never);
  const cards = Array.isArray(doc?.cards) ? doc.cards : [];
  return cards.map((card, index) => normalizeCard(card, index));
}

function normalizePet(doc: PetDoc): OwnedPet {
  return {
    petId: String(doc.petId ?? ""),
    name: String(doc.name ?? doc.species ?? "Companion"),
    species: String(doc.species ?? "companion"),
    rarity: String(doc.rarity ?? "common"),
    level: Number(doc.level) || 1,
    exp: Number(doc.exp) || 0,
    expNeeded: Number(doc.expNeeded) || 100,
    hp: Number(doc.hp) || 0,
    maxHp: Number(doc.maxHp) || 0,
    attack: Number(doc.attack) || 0,
    defense: Number(doc.defense) || 0,
    speed: Number(doc.speed) || 0,
    hunger: Math.max(0, Math.min(100, Number(doc.hunger ?? 100))),
    happiness: Math.max(0, Math.min(100, Number(doc.happiness ?? 100))),
    imageUrl: typeof doc.imageUrl === "string" ? doc.imageUrl : "",
    skill: String(doc.skill ?? "Companion skill"),
    isActive: doc.isActive === true,
    lastFed: doc.lastFed ? new Date(doc.lastFed).toISOString() : null,
    lastPlayed: doc.lastPlayed ? new Date(doc.lastPlayed).toISOString() : null,
  };
}

export async function listMyPets(): Promise<OwnedPet[]> {
  const user = await requireUser();
  const docs = await (await pets()).find({ owner: { $in: ownerKeys(user) } } as never).sort({ isActive: -1, level: -1, createdAt: 1 }).toArray();
  return docs.map((doc) => normalizePet(doc));
}

async function findMyPet(petId?: string): Promise<{ user: Awaited<ReturnType<typeof requireUser>>; doc: PetDoc; keys: string[] }> {
  const user = await requireUser();
  const keys = ownerKeys(user);
  const doc = await (await pets()).findOne({ owner: { $in: keys }, ...(petId ? { petId: String(petId) } : { isActive: true }) } as never);
  if (!doc) throw new Error(petId ? "That companion was not found in your stable." : "You do not have an active companion yet.");
  return { user, doc, keys };
}

const PET_HATCH_POOL = [
  { species: "cat", name: "Cat", rarity: "common", skill: "Scratch", weight: 40 },
  { species: "dog", name: "Dog", rarity: "common", skill: "Bite", weight: 40 },
  { species: "bunny", name: "Bunny", rarity: "common", skill: "Quick Step", weight: 28 },
  { species: "fox", name: "Fox", rarity: "uncommon", skill: "Fox Fire", weight: 28 },
  { species: "wolf", name: "Wolf", rarity: "uncommon", skill: "Shadow Fang", weight: 28 },
  { species: "panda", name: "Panda", rarity: "uncommon", skill: "Bamboo Strike", weight: 28 },
  { species: "tiger", name: "Tiger", rarity: "rare", skill: "Tiger Pounce", weight: 18 },
  { species: "falcon", name: "Falcon", rarity: "rare", skill: "Dive Bomb", weight: 18 },
  { species: "spirit_wolf", name: "Spirit Wolf", rarity: "rare", skill: "Soul Howl", weight: 18 },
  { species: "kitsune", name: "Kitsune", rarity: "epic", skill: "Nine Lives", weight: 9 },
  { species: "phoenix_chick", name: "Phoenix Chick", rarity: "epic", skill: "Ember Rebirth", weight: 9 },
  { species: "baby_dragon", name: "Baby Dragon", rarity: "legendary", skill: "Dragon Breath", weight: 4 },
  { species: "shadow_dragon", name: "Shadow Dragon", rarity: "mythic", skill: "Void Roar", weight: 1 },
] as const;

function hatchSpecies() {
  const total = PET_HATCH_POOL.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of PET_HATCH_POOL) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return PET_HATCH_POOL[0];
}

export async function feedPet(petId?: string): Promise<OwnedPet[]> {
  const { doc, keys } = await findMyPet(petId);
  const lastFed = doc.lastFed ? new Date(doc.lastFed).getTime() : 0;
  const remainingMs = 2 * 60 * 60 * 1000 - (Date.now() - lastFed);
  if (remainingMs > 0) throw new Error(`This companion can be fed again in ${Math.ceil(remainingMs / 60000)} minute(s).`);
  await (await pets()).updateOne({ owner: { $in: keys }, petId: String(doc.petId ?? "") }, {
    $set: { hunger: Math.min(100, Number(doc.hunger ?? 100) + 30), happiness: Math.min(100, Number(doc.happiness ?? 100) + 5), lastFed: new Date().toISOString() },
  } as never);
  return listMyPets();
}

export async function playPet(petId?: string): Promise<OwnedPet[]> {
  const { doc, keys } = await findMyPet(petId);
  const lastPlayed = doc.lastPlayed ? new Date(doc.lastPlayed).getTime() : 0;
  const remainingMs = 60 * 60 * 1000 - (Date.now() - lastPlayed);
  if (remainingMs > 0) throw new Error(`This companion is resting for ${Math.ceil(remainingMs / 60000)} minute(s).`);
  await (await pets()).updateOne({ owner: { $in: keys }, petId: String(doc.petId ?? "") }, {
    $set: { hunger: Math.max(0, Number(doc.hunger ?? 100) - 5), happiness: Math.min(100, Number(doc.happiness ?? 100) + 20), lastPlayed: new Date().toISOString() },
  } as never);
  return listMyPets();
}

export async function selectPet(petId: string): Promise<OwnedPet[]> {
  const { keys } = await findMyPet(petId);
  const collection = await pets();
  await collection.updateMany({ owner: { $in: keys }, isActive: true } as never, { $set: { isActive: false } } as never);
  await collection.updateOne({ owner: { $in: keys }, petId }, { $set: { isActive: true } } as never);
  return listMyPets();
}

export async function releasePet(petId: string): Promise<OwnedPet[]> {
  const { doc, keys } = await findMyPet(petId);
  const collection = await pets();
  await collection.deleteOne({ owner: { $in: keys }, petId: String(doc.petId ?? "") } as never);
  if (doc.isActive) {
    const next = await collection.findOne({ owner: { $in: keys } } as never, { sort: { level: -1, createdAt: 1 } } as never);
    if (next) await collection.updateOne({ _id: next._id } as never, { $set: { isActive: true } } as never);
  }
  return listMyPets();
}

export async function hatchPet(): Promise<OwnedPet[]> {
  const user = await requireUser();
  const keys = ownerKeys(user);
  const collection = await pets();
  const total = await collection.countDocuments({ owner: { $in: keys } } as never);
  if (total >= 5) throw new Error("Your stable is full. Release a companion before hatching another egg.");
  const species = hatchSpecies();
  const petId = String(Math.floor(10000 + Math.random() * 90000));
  const level = 1;
  const base = species.rarity === "mythic" ? 180 : species.rarity === "legendary" ? 150 : species.rarity === "epic" ? 125 : species.rarity === "rare" ? 110 : 90;
  const doc: PetDoc = { petId, owner: userKey(user), name: species.name, species: species.species, rarity: species.rarity, level, exp: 0, expNeeded: 100, hp: base, maxHp: base, attack: Math.round(base * 0.2), defense: Math.round(base * 0.16), speed: Math.round(base * 0.14), hunger: 100, happiness: 100, imageUrl: "", skill: species.skill, isActive: total === 0, createdAt: new Date().toISOString(), lastFed: null, lastPlayed: null };
  if (doc.isActive) await collection.updateMany({ owner: { $in: keys }, isActive: true } as never, { $set: { isActive: false } } as never);
  await collection.insertOne(doc as never);
  return listMyPets();
}

const PET_SHOP: Record<string, { name: string; price: number; effect: string }> = {
  kibble: { name: "Kibble", price: 200, effect: "hunger" },
  meal: { name: "Premium Meal", price: 500, effect: "meal" },
  toy: { name: "Toy", price: 300, effect: "happiness" },
  exppotion: { name: "EXP Potion", price: 800, effect: "exp" },
  revival: { name: "Revival Tonic", price: 600, effect: "revival" },
};

export async function buyPetCare(itemKey: string, petId?: string): Promise<{ pets: OwnedPet[]; spent: number; itemName: string }> {
  const item = PET_SHOP[itemKey];
  if (!item) throw new Error("Choose a valid pet-care item.");
  const { user, doc, keys } = await findMyPet(petId);
  const jid = userKey(user);
  const wallet = await (await users()).updateOne({ _id: jid, money: { $gte: item.price } } as never, { $inc: { money: -item.price } } as never);
  if (wallet.modifiedCount !== 1) throw new Error("You do not have enough wallet coins for that pet-care item.");
  try {
    const changes: Record<string, number> = {};
    if (item.effect === "hunger") changes["hunger"] = Math.min(100, Number(doc["hunger"] ?? 100) + 40);
    if (item.effect === "meal") { changes["hunger"] = 100; changes["happiness"] = Math.min(100, Number(doc["happiness"] ?? 100) + 10); }
    if (item.effect === "happiness") changes["happiness"] = Math.min(100, Number(doc["happiness"] ?? 100) + 35);
    if (item.effect === "revival") { changes["hunger"] = Math.min(100, Number(doc["hunger"] ?? 100) + 60); changes["happiness"] = Math.min(100, Number(doc["happiness"] ?? 100) + 40); }
    if (item.effect === "exp") {
      let level = Number(doc.level) || 1;
      let exp = (Number(doc.exp) || 0) + 150;
      let expNeeded = Number(doc.expNeeded) || Math.floor(100 * Math.pow(level, 1.3));
      while (exp >= expNeeded) {
        exp -= expNeeded;
        level += 1;
        expNeeded = Math.floor(100 * Math.pow(level, 1.3));
      }
      const scale = 1 + (level - 1) * 0.08;
      changes["exp"] = exp;
      changes["level"] = level;
      changes["expNeeded"] = expNeeded;
      changes["maxHp"] = Math.floor((Number(doc["maxHp"] ?? 100) || 100) * scale / (1 + (Number(doc["level"] ?? 1) - 1) * 0.08));
      changes["hp"] = changes["maxHp"];
      changes["attack"] = Math.floor((Number(doc["attack"] ?? 10) || 10) * scale / (1 + (Number(doc["level"] ?? 1) - 1) * 0.08));
      changes["defense"] = Math.floor((Number(doc["defense"] ?? 10) || 10) * scale / (1 + (Number(doc["level"] ?? 1) - 1) * 0.08));
      changes["speed"] = Math.floor((Number(doc["speed"] ?? 10) || 10) * scale / (1 + (Number(doc["level"] ?? 1) - 1) * 0.08));
    }
    await (await pets()).updateOne({ owner: { $in: keys }, petId: String(doc.petId ?? "") }, { $set: changes } as never);
  } catch (error) {
    await refundWallet(jid, item.price);
    throw error;
  }
  return { pets: await listMyPets(), spent: item.price, itemName: item.name };
}

export async function updateProfile(input?: {
  name?: string;
  bio?: string;
  title?: string;
  avatar?: string;
  banner?: string;
}): Promise<PublicUser> {
  const user = await requireUser();
  const updates = {
    name:
      String(input?.name ?? user.name ?? "Player")
        .trim()
        .slice(0, 32) || "Player",
    bio: String(input?.bio ?? user.bio ?? "")
      .trim()
      .slice(0, 240),
    job:
      String(input?.title ?? user.job ?? "Player")
        .trim()
        .slice(0, 40) || "Player",
    avatar: String(input?.avatar ?? "default").slice(0, 24),
    banner: String(input?.banner ?? "aurora").slice(0, 24),
  };
  await (await users()).updateOne({ _id: userKey(user) }, { $set: updates } as never);
  return publicCurrentUser();
}

export async function chooseStarter(_starterId?: string): Promise<PublicUser> {
  throw new Error(
    "Start your Pokémon trainer with .startjourney in WhatsApp, then return here to manage the live party.",
  );
}

export async function claimDaily(): Promise<{ user: PublicUser; reward: number; streak: number }> {
  const user = await requireUser();
  const jid = userKey(user);
  const cooldown = await claimCooldown(jid, "lastDaily", 24 * 60 * 60 * 1000);
  if (!cooldown.ok) {
    throw new Error(
      `Daily reward is cooling down for ${Math.ceil(cooldown.remainingMs / 3600000)} more hour(s).`,
    );
  }
  const previousStreak = Number(user.streak) || 0;
  const streak = Math.min(previousStreak + 1, 14);
  const reward = 250 + (streak - 1) * 75;
  await (
    await users()
  ).updateOne({ _id: jid }, { $inc: { money: reward, xp: 25 }, $set: { streak } } as never);
  await appendHistory(jid, "daily", reward, `Daily reward: day ${streak}`);
  return { user: await publicCurrentUser(), reward, streak };
}

export async function buyItem(input?: {
  itemId?: string;
  qty?: number;
}): Promise<{ user: PublicUser; itemName: string; spent: number }> {
  const user = await requireUser();
  const item = BOT_MART_ITEMS.find((entry) => entry.id === input?.itemId);
  if (!item) throw new Error("That Mart item is no longer available.");
  const qty = Math.max(1, Math.min(99, Math.floor(Number(input?.qty) || 1)));
  const db = await getDb();
  const trainerCollection = db.collection("pokemon_trainers");
  const trainer = await trainerCollection.findOne({ jid: userKey(user) });
  if (!trainer) throw new Error("Start your Pokémon journey with .startjourney in WhatsApp first.");
  const existingQty =
    Number((trainer["inventory"] as Record<string, unknown> | undefined)?.[item.id]) || 0;
  if (item.id === "keystone" && existingQty > 0)
    throw new Error("Your trainer can only own one Keystone.");
  const spent = item.price * qty;
  const wallet = await (
    await users()
  ).updateOne({ _id: userKey(user), registered: true, money: { $gte: spent } }, {
    $inc: { money: -spent, xp: 3 },
  } as never);
  if (wallet.modifiedCount !== 1)
    throw new Error("You do not have enough wallet coins for that purchase.");
  try {
    const updated = await trainerCollection.updateOne(
      { jid: userKey(user) },
      { $inc: { [`inventory.${item.id}`]: qty } },
    );
    if (updated.modifiedCount !== 1) throw new Error("Trainer inventory could not be updated.");
  } catch (error) {
    await refundWallet(userKey(user), spent);
    throw error;
  }
  await appendHistory(userKey(user), "mart", -spent, `Bought ${qty} ${item.name}`);
  return { user: await publicCurrentUser(), itemName: item.name, spent };
}

export async function joinGuild(guildId?: string): Promise<PublicUser> {
  const user = await requireUser();
  const jid = userKey(user);
  const guild = await (await guilds()).findOne({ _id: String(guildId ?? "") } as never);
  if (!guild) throw new Error("Guild not found.");
  const current = await (await guilds()).findOne({ members: jid } as never);
  if (current && String(current._id) !== String(guild._id))
    throw new Error("Leave your current guild before joining another.");
  await (await guilds()).updateOne({ _id: guild._id }, { $addToSet: { members: jid } } as never);
  return publicCurrentUser();
}

export async function leaveGuild(): Promise<PublicUser> {
  const user = await requireUser();
  await (
    await guilds()
  ).updateOne({ members: userKey(user) } as never, { $pull: { members: userKey(user) } } as never);
  return publicCurrentUser();
}

export async function createGuild(input?: {
  name?: string;
  tag?: string;
  description?: string;
}): Promise<PublicUser> {
  const user = await requireUser();
  const name = String(input?.name ?? "")
    .trim()
    .slice(0, 32);
  const tag = String(input?.tag ?? "")
    .trim()
    .slice(0, 5)
    .toUpperCase();
  if (name.length < 3 || tag.length < 2)
    throw new Error("Enter a guild name and a 2–5 character tag.");
  if (await (await guilds()).findOne({ members: userKey(user) } as never))
    throw new Error("Leave your current guild before creating one.");
  const wallet = await (
    await users()
  ).updateOne({ _id: userKey(user), money: { $gte: GUILD_CREATION_COST } }, {
    $inc: { money: -GUILD_CREATION_COST },
  } as never);
  if (wallet.modifiedCount !== 1)
    throw new Error(`Creating a guild costs ${GUILD_CREATION_COST.toLocaleString()} coins.`);
  try {
    await (
      await guilds()
    ).insertOne({
      _id: `guild-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      owner: userKey(user),
      members: [userKey(user)],
      level: 1,
      treasury: 0,
      description: String(input?.description ?? "")
        .trim()
        .slice(0, 200),
    } as never);
  } catch (error) {
    await refundWallet(userKey(user), GUILD_CREATION_COST);
    throw error;
  }
  return publicCurrentUser();
}

export async function playCoinFlip(input?: {
  wager?: number;
  pick?: "heads" | "tails";
}): Promise<{ user: PublicUser; result: "heads" | "tails"; won: boolean; delta: number }> {
  const user = await requireUser();
  const wager = validWager(input?.wager, 10, 1_000_000);
  if (input?.pick !== "heads" && input?.pick !== "tails") throw new Error("Choose heads or tails.");
  const cooldown = await claimCooldown(userKey(user), "lastCoinflip", 8_000);
  if (!cooldown.ok)
    throw new Error(`Coinflip cooldown: wait ${Math.ceil(cooldown.remainingMs / 1000)}s.`);
  if (Number(user.money) < wager)
    throw new Error("You do not have enough wallet coins for that wager.");
  const won = Math.random() < 0.55;
  const result = won ? input.pick : input.pick === "heads" ? "tails" : "heads";
  const delta = won ? wager : -wager;
  await (
    await users()
  ).updateOne({ _id: userKey(user) }, { $inc: { money: delta, xp: won ? 8 : 0 } } as never);
  await appendHistory(
    userKey(user),
    "coinflip",
    delta,
    `Coinflip ${won ? "win" : "loss"}: ${input.pick}`,
  );
  return { user: await publicCurrentUser(), result, won, delta };
}

export async function playBet(input?: {
  wager?: number;
}): Promise<{ user: PublicUser; won: boolean; delta: number }> {
  const user = await requireUser();
  const wager = validWager(input?.wager, 10, 1_000_000);
  const cooldown = await claimCooldown(userKey(user), "lastBet", 30_000);
  if (!cooldown.ok)
    throw new Error(`Bet cooldown: wait ${Math.ceil(cooldown.remainingMs / 1000)}s.`);
  if (Number(user.money) < wager)
    throw new Error("You do not have enough wallet coins for that wager.");
  const won = Math.random() < 0.53;
  const delta = won ? wager : -wager;
  await (
    await users()
  ).updateOne({ _id: userKey(user) }, { $inc: { money: delta, xp: won ? 15 : 0 } } as never);
  await appendHistory(userKey(user), "bet", delta, `Website bet ${won ? "win" : "loss"}`);
  return { user: await publicCurrentUser(), won, delta };
}

export async function playSlots(input?: {
  wager?: number;
}): Promise<{ user: PublicUser; reels: string[]; delta: number; multiplier: number }> {
  const user = await requireUser();
  const wager = validWager(input?.wager, 50, 50_000);
  const cooldown = await claimCooldown(userKey(user), "lastSlots", 15_000);
  if (!cooldown.ok)
    throw new Error(`Slots cooldown: wait ${Math.ceil(cooldown.remainingMs / 1000)}s.`);
  if (Number(user.money) < wager)
    throw new Error("You do not have enough wallet coins for that wager.");
  const reels = [randomChoice(SLOT_POOL), randomChoice(SLOT_POOL), randomChoice(SLOT_POOL)];
  let multiplier = 0;
  if (reels[0] === reels[1] && reels[1] === reels[2]) multiplier = SLOT_PAYOUTS[reels[0]] || 2;
  else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2])
    multiplier = 0.5;
  const winnings = Math.floor(wager * multiplier);
  const delta = winnings - wager;
  await (
    await users()
  ).updateOne({ _id: userKey(user) }, { $inc: { money: delta, xp: 5 } } as never);
  await appendHistory(userKey(user), "slots", delta, `Website slots: bet $${wager}`);
  return { user: await publicCurrentUser(), reels, delta, multiplier };
}

export async function setLeadPokemon(pokemonId?: string): Promise<PublicUser> {
  const user = await requireUser();
  const jid = userKey(user);
  const db = await getDb();
  const trainer = await db.collection("pokemon_trainers").findOne({ jid });
  if (!trainer) throw new Error("Start your Pokémon journey in WhatsApp first.");
  const id = String(pokemonId ?? "");
  if (!Array.isArray(trainer["party"]) || !(trainer["party"] as unknown[]).map(String).includes(id))
    throw new Error("That Pokémon is not in your party.");
  const pokemon = await db.collection("pokemon_owned").findOne({ _id: id } as never);
  if (pokemon && Number(pokemon["hp"] ?? 0) <= 0)
    throw new Error("A fainted Pokémon cannot be your lead.");
  await db.collection("pokemon_trainers").updateOne({ jid }, { $set: { leadPokemonId: id } });
  return publicCurrentUser();
}

export async function swapParty(input?: { first?: number; second?: number }): Promise<PublicUser> {
  const user = await requireUser();
  const jid = userKey(user);
  const first = Math.floor(Number(input?.first));
  const second = Math.floor(Number(input?.second));
  if (![first, second].every((slot) => slot >= 1 && slot <= 6) || first === second)
    throw new Error("Choose two different party slots from 1 to 6.");
  const db = await getDb();
  const trainer = await db.collection("pokemon_trainers").findOne({ jid });
  if (!trainer || !Array.isArray(trainer["party"]))
    throw new Error("Start your Pokémon journey in WhatsApp first.");
  const party = [...(trainer["party"] as unknown[])];
  if (!party[first - 1] || !party[second - 1])
    throw new Error("Both selected party slots must contain a Pokémon.");
  [party[first - 1], party[second - 1]] = [party[second - 1], party[first - 1]];
  await db
    .collection("pokemon_trainers")
    .updateOne(
      { jid },
      { $set: { party, ...(first === 1 || second === 1 ? { leadPokemonId: party[0] } : {}) } },
    );
  return publicCurrentUser();
}

export async function movePokemon(input?: {
  pokemonId?: string;
  destination?: "party" | "pc";
}): Promise<PublicUser> {
  const user = await requireUser();
  const jid = userKey(user);
  const id = String(input?.pokemonId ?? "");
  const destination = input?.destination;
  if (!id || (destination !== "party" && destination !== "pc"))
    throw new Error("Choose a Pokémon and destination.");
  const db = await getDb();
  const trainers = db.collection("pokemon_trainers");
  const pokemonCollection = db.collection("pokemon_owned");
  const trainer = await trainers.findOne({ jid });
  if (!trainer) throw new Error("Start your Pokémon journey in WhatsApp first.");
  const party = Array.isArray(trainer["party"]) ? (trainer["party"] as unknown[]).map(String) : [];
  const pc = Array.isArray(trainer["pc"]) ? (trainer["pc"] as unknown[]).map(String) : [];
  if (destination === "party") {
    if (party.length >= 6) throw new Error("Your party is full. Move one Pokémon to the PC first.");
    if (!pc.includes(id)) throw new Error("That Pokémon is not in your PC.");
    await trainers.updateOne({ jid }, { $pull: { pc: id }, $addToSet: { party: id } } as never);
    await pokemonCollection.updateOne(
      { _id: id, ownerJid: jid } as never,
      { $set: { inParty: true } } as never,
    );
  } else {
    if (!party.includes(id)) throw new Error("That Pokémon is not in your party.");
    if (party.length <= 1) throw new Error("Keep at least one Pokémon in your party.");
    const nextParty = party.filter((entry) => entry !== id);
    await trainers.updateOne({ jid }, {
      $pull: { party: id },
      $addToSet: { pc: id },
      $set: { party: nextParty, leadPokemonId: nextParty[0] },
    } as never);
    await pokemonCollection.updateOne(
      { _id: id, ownerJid: jid } as never,
      { $set: { inParty: false } } as never,
    );
  }
  return publicCurrentUser();
}
