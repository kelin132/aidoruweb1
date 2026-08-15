import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { requireUser } from "./auth.server";
import {
  battleRooms,
  getDb,
  type WebBattleMoveDoc,
  type WebBattlePokemonDoc,
  type WebBattleRoomDoc,
  type WebBattleTrainerDoc,
} from "./db.server";
import type { BattleAction, BattleRoom, BattleRoomSummary } from "./game";

const ROOM_TTL_MS = 10 * 60 * 1000;
const FINISHED_TTL_MS = 2_000;

type Role = "challenger" | "opponent";

type BattleRoomInput = WebBattleRoomDoc;

const TYPE_CHART: Record<string, Record<string, number>> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, rock: 0.5, dragon: 0.5, grass: 2, ice: 2, bug: 2, steel: 2 },
  water: { water: 0.5, grass: 0.5, dragon: 0.5, fire: 2, ground: 2, rock: 2 },
  electric: { electric: 0.5, grass: 0.5, dragon: 0.5, ground: 0, flying: 2, water: 2 },
  grass: { fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5, steel: 0.5, water: 2, ground: 2, rock: 2 },
  ice: { water: 0.5, ice: 0.5, steel: 0.5, fire: 0.5, grass: 2, ground: 2, flying: 2, dragon: 2 },
  fighting: { poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0, normal: 2, ice: 2, rock: 2, dark: 2, steel: 2 },
  poison: { poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, grass: 2, fairy: 2 },
  ground: { grass: 0.5, bug: 0.5, flying: 0, electric: 2, fire: 2, poison: 2, rock: 2, steel: 2 },
  flying: { electric: 0.5, rock: 0.5, steel: 0.5, ground: 0, grass: 2, fighting: 2, bug: 2 },
  psychic: { psychic: 0.5, steel: 0.5, dark: 0, fighting: 2, poison: 2 },
  bug: { fire: 0.5, fighting: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5, grass: 2, psychic: 2, dark: 2 },
  rock: { fighting: 0.5, ground: 0.5, steel: 0.5, normal: 2, fire: 2, flying: 2, ice: 2, bug: 2 },
  ghost: { normal: 0, dark: 0.5, psychic: 2, ghost: 2 },
  dragon: { steel: 0.5, fairy: 0, dragon: 2 },
  dark: { fighting: 0.5, dark: 0.5, fairy: 0.5, psychic: 2, ghost: 2 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5, ice: 2, rock: 2, fairy: 2 },
  fairy: { fire: 0.5, poison: 0.5, steel: 0.5, fighting: 2, dragon: 2, dark: 2 },
};

const ITEM_HEAL: Record<string, number> = {
  potion: 20,
  superpotion: 50,
  hyperpotion: 120,
  fullrestore: Number.MAX_SAFE_INTEGER,
};

function value(value: unknown, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function userName(user: Record<string, unknown>) {
  return value(user["name"] ?? user["username"] ?? user["pushName"] ?? user["notifyName"], "Trainer");
}

function userAvatar(user: Record<string, unknown>) {
  const candidate = user["avatarUrl"] ?? user["profilePicUrl"] ?? user["profilePictureUrl"] ?? null;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function mongoId(id: string) {
  return ObjectId.isValid(id) ? new ObjectId(id) : id;
}

function publicMove(move: Record<string, unknown>): WebBattleMoveDoc {
  const desc = typeof move["desc"] === "string" ? move["desc"] : null;
  return {
    name: value(move["name"], "Unknown move"),
    type: value(move["type"], "normal").toLowerCase(),
    power: numberValue(move["power"], 0),
    accuracy: numberValue(move["accuracy"], 100),
    pp: numberValue(move["pp"], 0),
    priority: numberValue(move["priority"], 0),
    ...(desc ? { desc } : {}),
  };
}

function publicPokemon(doc: Record<string, unknown>): WebBattlePokemonDoc {
  const id = value(doc["_id"] ?? doc["id"]);
  const pokedexId = numberValue(doc["pokedexId"], 0);
  const imageUrl = value(
    doc["imageUrl"],
    pokedexId > 0
      ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokedexId}.png`
      : "",
  );
  return {
    id,
    pokedexId,
    name: value(doc["name"], "Unknown"),
    displayName: value(doc["displayName"] ?? doc["nickname"] ?? doc["name"], "Unknown"),
    level: numberValue(doc["level"], 1),
    hp: Math.max(0, numberValue(doc["hp"], 0)),
    maxHp: Math.max(1, numberValue(doc["maxHp"], 1)),
    attack: Math.max(1, numberValue(doc["attack"], 10)),
    defense: Math.max(1, numberValue(doc["defense"], 10)),
    speed: Math.max(1, numberValue(doc["speed"], 10)),
    types: Array.isArray(doc["types"]) ? (doc["types"] as unknown[]).map((item) => value(item).toLowerCase()) : [value(doc["primaryType"], "normal").toLowerCase()],
    imageUrl,
    frontSpriteUrl: value(doc["frontSpriteUrl"], imageUrl),
    backSpriteUrl: value(doc["backSpriteUrl"] ?? doc["backImageUrl"], imageUrl),
    shiny: Boolean(doc["shiny"]),
    fainted: numberValue(doc["hp"], 0) <= 0,
    moves: Array.isArray(doc["moves"])
      ? (doc["moves"] as unknown[]).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map(publicMove)
      : [],
  };
}

async function loadTrainerSnapshot(jid: string, fallbackName?: string, fallbackAvatar?: string | null): Promise<WebBattleTrainerDoc> {
  const db = await getDb();
  const [user, trainer, allPokemon] = await Promise.all([
    (await db.collection("users")).findOne({ _id: jid } as never),
    db.collection("pokemon_trainers").findOne({ jid }),
    db.collection("pokemon_owned").find({ ownerJid: jid }).toArray(),
  ]);
  if (!trainer) throw new Error("Start your Pokémon journey in WhatsApp first.");

  const docs = allPokemon as unknown as Array<Record<string, unknown>>;
  const byId = new Map(docs.map((doc) => [value(doc["_id"] ?? doc["id"]), doc]));
  const partyIds = Array.isArray(trainer["party"]) ? (trainer["party"] as unknown[]).map(String) : [];
  const ordered = partyIds.map((id) => byId.get(id)).filter(Boolean) as Array<Record<string, unknown>>;
  for (const doc of docs) {
    const id = value(doc["_id"] ?? doc["id"]);
    if (!ordered.some((item) => value(item["_id"] ?? item["id"]) === id)) ordered.push(doc);
  }

  const userRecord = (user ?? {}) as Record<string, unknown>;
  return {
    id: jid,
    name: user ? userName(userRecord) : fallbackName ?? jid.split("@")[0] ?? "Trainer",
    avatarUrl: user ? userAvatar(userRecord) : fallbackAvatar ?? null,
    trainerSpriteUrl: null,
    ready: false,
    party: ordered.slice(0, 6).map(publicPokemon),
    activeIndex: 0,
    inventory: Object.fromEntries(
      Object.entries((trainer["inventory"] ?? {}) as Record<string, unknown>).map(([key, qty]) => [key, numberValue(qty)]),
    ),
  };
}

function cloneTrainer(trainer: WebBattleTrainerDoc): WebBattleTrainerDoc {
  return {
    ...trainer,
    inventory: { ...trainer.inventory },
    party: trainer.party.map((pokemon) => ({ ...pokemon, types: [...pokemon.types], moves: pokemon.moves.map((move) => ({ ...move })) })),
  };
}

function cloneRoom(room: WebBattleRoomDoc): WebBattleRoomDoc {
  return {
    ...room,
    challenger: cloneTrainer(room.challenger),
    opponent: room.opponent ? cloneTrainer(room.opponent) : null,
    spectatorIds: [...room.spectatorIds],
    combatLog: [...room.combatLog],
  };
}

function opposite(role: Role): Role {
  return role === "challenger" ? "opponent" : "challenger";
}

function trainerFor(room: BattleRoomInput, role: Role) {
  return role === "challenger" ? room.challenger : room.opponent;
}

function activePokemon(room: BattleRoomInput, role: Role) {
  const trainer = trainerFor(room, role);
  return trainer?.party[trainer.activeIndex] ?? null;
}

function healthyPokemon(trainer: WebBattleTrainerDoc | null) {
  return trainer?.party.some((pokemon) => pokemon.hp > 0) ?? false;
}

function roomRole(room: BattleRoomInput, jid: string): Role | "spectator" {
  if (room.challenger.id === jid) return "challenger";
  if (room.opponent?.id === jid) return "opponent";
  return "spectator";
}

function addLog(room: BattleRoomInput, message: string) {
  room.combatLog = [...room.combatLog.slice(-11), message];
}

function effectiveness(moveType: string, defenderTypes: string[]) {
  const chart = TYPE_CHART[moveType] ?? {};
  return defenderTypes.reduce((multiplier, type) => multiplier * (chart[type] ?? 1), 1);
}

function calcDamage(attacker: WebBattlePokemonDoc, defender: WebBattlePokemonDoc, move: WebBattleMoveDoc) {
  if (!move.power) return 0;
  const level = attacker.level || 5;
  const base = ((2 * level / 5 + 2) * move.power * attacker.attack / Math.max(1, defender.defense)) / 50 + 2;
  const roll = 0.85 + Math.random() * 0.15;
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
  const multiplier = effectiveness(move.type, defender.types);
  return Math.max(1, Math.floor(base * roll * stab * multiplier));
}

async function clearExpired() {
  return (await battleRooms()).deleteMany({ expiresAt: { $lte: new Date() } } as never);
}

function summary(room: WebBattleRoomDoc): BattleRoomSummary {
  return {
    id: room._id,
    status: room.status,
    challenger: {
      id: room.challenger.id,
      name: room.challenger.name,
      avatarUrl: room.challenger.avatarUrl,
      ready: room.challenger.ready,
    },
    opponent: room.opponent
      ? { id: room.opponent.id, name: room.opponent.name, avatarUrl: room.opponent.avatarUrl, ready: room.opponent.ready }
      : null,
    spectators: room.spectatorIds.length,
    createdAt: room.createdAt.toISOString(),
    lastActionAt: room.lastActionAt.toISOString(),
  };
}

function serializeRoom(room: WebBattleRoomDoc, joinedAs: BattleRoom["joinedAs"]): BattleRoom {
  return {
    ...summary(room),
    turn: room.turn,
    forcedSwitch: room.forcedSwitch,
    round: room.round,
    winnerId: room.winnerId,
    challenger: room.challenger,
    opponent: room.opponent,
    combatLog: room.combatLog,
    expiresAt: room.expiresAt?.toISOString() ?? null,
    joinedAs,
  };
}

async function persistHealth(room: WebBattleRoomDoc) {
  const pokemonCollection = (await getDb()).collection("pokemon_owned");
  const trainers = [room.challenger, room.opponent].filter(Boolean) as WebBattleTrainerDoc[];
  await Promise.all(
    trainers.flatMap((trainer) =>
      trainer.party.map((pokemon) =>
        pokemonCollection.updateOne(
          { _id: mongoId(pokemon.id), ownerJid: trainer.id } as never,
          { $set: { hp: pokemon.hp } } as never,
        ),
      ),
    ),
  );
}

async function finishRoom(room: WebBattleRoomDoc, winnerId: string | null, message: string) {
  room.status = "finished";
  room.winnerId = winnerId;
  room.turn = null;
  room.forcedSwitch = null;
  room.expiresAt = new Date(Date.now() + FINISHED_TTL_MS);
  addLog(room, message);
  await persistHealth(room);
}

async function saveRoom(room: WebBattleRoomDoc) {
  room.version += 1;
  room.lastActionAt = new Date();
  room.expiresAt = room.status === "finished" ? new Date(Date.now() + FINISHED_TTL_MS) : new Date(Date.now() + ROOM_TTL_MS);
  await (await battleRooms()).replaceOne({ _id: room._id }, room, { upsert: false });
}

export async function listBattleRooms() {
  await clearExpired();
  const docs = await (await battleRooms()).find({ status: { $in: ["waiting", "active"] } } as never).sort({ lastActionAt: -1 }).limit(40).toArray();
  return docs.map(summary);
}

export async function createBattleRoom() {
  const user = await requireUser();
  const jid = String(user._id);
  const challenger = await loadTrainerSnapshot(jid);
  if (!challenger.party.some((pokemon) => pokemon.hp > 0)) throw new Error("You need one healthy Pokémon to open a room.");
  const now = new Date();
  const room: WebBattleRoomDoc = {
    _id: `battle-${randomUUID().replaceAll("-", "").slice(0, 16)}`,
    status: "waiting",
    challenger,
    opponent: null,
    spectatorIds: [],
    turn: null,
    forcedSwitch: null,
    round: 0,
    winnerId: null,
    combatLog: ["Room opened. Waiting for an opponent to join."],
    version: 1,
    createdAt: now,
    lastActionAt: now,
    expiresAt: new Date(now.getTime() + ROOM_TTL_MS),
  };
  await (await battleRooms()).insertOne(room);
  return serializeRoom(room, "challenger");
}

export async function getBattleRoom(roomId: string) {
  await clearExpired();
  const user = await requireUser();
  let room = await (await battleRooms()).findOne({ _id: roomId });
  if (!room) throw new Error("That battle room has expired or does not exist.");
  const jid = String(user._id);
  let role = roomRole(room, jid);
  if (role === "spectator") {
    const next = cloneRoom(room);
    if (!next.opponent && jid !== next.challenger.id && (!next.invitedOpponentId || next.invitedOpponentId === jid)) {
      next.opponent = await loadTrainerSnapshot(jid);
      addLog(next, `${next.opponent.name} joined the room. Both trainers must ready up.`);
      role = "opponent";
    } else {
      if (!next.spectatorIds.includes(jid)) next.spectatorIds.push(jid);
      role = "spectator";
    }
    await saveRoom(next);
    room = next;
  }
  return serializeRoom(room, role);
}

export async function performBattleAction(roomId: string, action: BattleAction) {
  const user = await requireUser();
  const jid = String(user._id);
  const current = await (await battleRooms()).findOne({ _id: roomId });
  if (!current) throw new Error("That battle room has expired or does not exist.");
  const room = cloneRoom(current);
  const role = roomRole(room, jid);
  if (role === "spectator") throw new Error("Spectators can watch this room but cannot control a trainer.");
  const trainer = trainerFor(room, role);
  if (!trainer) throw new Error("This trainer is no longer in the room.");

  if (action.type === "ready") {
    trainer.ready = true;
    if (room.opponent?.ready && room.challenger.ready) {
      room.status = "active";
      room.turn = "challenger";
      room.round = 1;
      addLog(room, "Both trainers are ready. The challenger moves first.");
    } else {
      addLog(room, `${trainer.name} is ready.`);
    }
    await saveRoom(room);
    return serializeRoom(room, role);
  }

  if (room.status !== "active") throw new Error("The battle is not active yet.");
  if (room.forcedSwitch && room.forcedSwitch !== role) throw new Error("Your opponent must choose a replacement Pokémon first.");

  if (action.type === "switch") {
    const index = action.pokemonIndex;
    if (!Number.isInteger(index) || index < 0 || index >= trainer.party.length) throw new Error("Choose a valid party slot.");
    if (index === trainer.activeIndex) throw new Error("That Pokémon is already in battle.");
    const replacement = trainer.party[index];
    if (!replacement || replacement.hp <= 0) throw new Error("A fainted Pokémon cannot be sent out.");
    const wasForced = room.forcedSwitch === role;
    trainer.activeIndex = index;
    room.forcedSwitch = null;
    room.turn = wasForced ? opposite(role) : opposite(role);
    addLog(room, `${trainer.name} sent out ${replacement.displayName}.`);
    await saveRoom(room);
    return serializeRoom(room, role);
  }

  if (room.forcedSwitch) throw new Error("Choose a replacement Pokémon before taking another action.");
  if (room.turn !== role) throw new Error("Wait for your turn.");

  if (action.type === "forfeit") {
    await finishRoom(room, room[opposite(role)]?.id ?? null, `${trainer.name} forfeited the battle.`);
    await saveRoom(room);
    setTimeout(() => void battleRooms().then((collection) => collection.deleteOne({ _id: room._id, status: "finished" })), FINISHED_TTL_MS);
    return serializeRoom(room, role);
  }

  if (action.type === "item") {
    const count = Number(trainer.inventory[action.item] ?? 0);
    if (count < 1) throw new Error("You do not have that battle item.");
    const active = activePokemon(room, role);
    if (!active) throw new Error("No active Pokémon is available.");
    if (action.item === "revive") throw new Error("Revive a fainted Pokémon by choosing it in the switch panel.");
    if (active.hp >= active.maxHp) throw new Error("That Pokémon already has full HP.");
    active.hp = Math.min(active.maxHp, active.hp + (ITEM_HEAL[action.item] ?? 20));
    trainer.inventory[action.item] = count - 1;
    room.turn = opposite(role);
    room.round += 1;
    addLog(room, `${trainer.name} used ${action.item} on ${active.displayName}.`);
    await saveRoom(room);
    return serializeRoom(room, role);
  }

  if (action.type !== "move") throw new Error("Choose a move, switch, item, or forfeit.");
  const attacker = activePokemon(room, role);
  const defender = activePokemon(room, opposite(role));
  if (!attacker || !defender) throw new Error("Both trainers need an active Pokémon.");
  const move = attacker.moves[action.moveIndex];
  if (!move) throw new Error("Choose one of the visible moves.");
  const attackName = `${attacker.displayName} used ${move.name}.`;
  if (Math.random() * 100 > (move.accuracy || 100)) {
    addLog(room, `${attackName} It missed.`);
    room.turn = opposite(role);
    room.round += 1;
    await saveRoom(room);
    return serializeRoom(room, role);
  }

  const multiplier = effectiveness(move.type, defender.types);
  const damage = calcDamage(attacker, defender, move);
  defender.hp = Math.max(0, defender.hp - damage);
  const effectivenessText = multiplier === 0 ? " It had no effect." : multiplier >= 2 ? " Super effective!" : multiplier <= 0.5 ? " It was not very effective." : "";
  addLog(room, `${attackName} ${damage} damage.${effectivenessText}`);

  if (defender.hp <= 0) {
    addLog(room, `${defender.displayName} fainted.`);
    const defenderTrainer = trainerFor(room, opposite(role));
    if (!healthyPokemon(defenderTrainer)) {
      await finishRoom(room, trainer.id, `${trainer.name} wins the battle!`);
      await saveRoom(room);
      setTimeout(() => void battleRooms().then((collection) => collection.deleteOne({ _id: room._id, status: "finished" })), FINISHED_TTL_MS);
      return serializeRoom(room, role);
    }
    room.forcedSwitch = opposite(role);
    room.turn = null;
    await saveRoom(room);
    return serializeRoom(room, role);
  }

  room.turn = opposite(role);
  room.round += 1;
  await saveRoom(room);
  return serializeRoom(room, role);
}
