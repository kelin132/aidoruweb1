import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { currentUserId, findUserById, toPublicUser, loginUser, clearSession } from "./auth.server";
import {
  listShopItems,
  updateProfile,
  chooseStarter,
  claimDaily,
  buyItem,
  listGuilds,
  joinGuild,
  leaveGuild,
  createGuild,
  playCoinFlip,
  playBet,
  playSlots,
  setLeadPokemon,
  swapParty,
  movePokemon,
  leaderboard,
  listMyCards,
  listMyPets,
  feedPet,
  playPet,
  hatchPet,
  selectPet,
  releasePet,
  buyPetCare,
} from "./aidoru.server";
import type { PublicUser } from "./game";
import { createBattleRoom, getBattleRoom, listBattleRooms, performBattleAction } from "./battle.server";

export const getSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicUser | null> => {
    const id = await currentUserId();
    if (!id) return null;
    const doc = await findUserById(id);
    return doc ? toPublicUser(doc) : null;
  },
);

export const login = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({ websiteId: z.string().min(8).max(32), password: z.string().min(8).max(128) })
      .parse(data),
  )
  .handler(({ data }) => loginUser(data));

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  clearSession();
  return { ok: true };
});

export const fetchShopItems = createServerFn({ method: "GET" }).handler(() => listShopItems());

export const fetchLeaderboard = createServerFn({ method: "GET" }).handler(() => leaderboard("xp"));
export const fetchXpLeaderboard = createServerFn({ method: "GET" }).handler(() =>
  leaderboard("xp"),
);
export const fetchCoinsLeaderboard = createServerFn({ method: "GET" }).handler(() =>
  leaderboard("coins"),
);
export const fetchCardsLeaderboard = createServerFn({ method: "GET" }).handler(() =>
  leaderboard("cards"),
);
export const fetchPokemonLeaderboard = createServerFn({ method: "GET" }).handler(() =>
  leaderboard("pokemon"),
);

export const fetchMyCards = createServerFn({ method: "GET" }).handler(() => listMyCards());
export const fetchMyPets = createServerFn({ method: "GET" }).handler(() => listMyPets());

export const feedMyPet = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ petId: z.string().min(1).max(16) }).parse(data))
  .handler(({ data }) => feedPet(data.petId));

export const playWithPet = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ petId: z.string().min(1).max(16) }).parse(data))
  .handler(({ data }) => playPet(data.petId));

export const hatchMyPet = createServerFn({ method: "POST" }).handler(() => hatchPet());

export const selectMyPet = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ petId: z.string().min(1).max(16) }).parse(data))
  .handler(({ data }) => selectPet(data.petId));

export const releaseMyPet = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ petId: z.string().min(1).max(16) }).parse(data))
  .handler(({ data }) => releasePet(data.petId));

export const buyPetCareItem = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ itemKey: z.enum(["kibble", "meal", "toy", "exppotion", "revival"]), petId: z.string().min(1).max(16) }).parse(data))
  .handler(({ data }) => buyPetCare(data.itemKey, data.petId));

export const saveProfile = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        name: z.string().min(2).max(32),
        bio: z.string().max(240),
        title: z.string().max(40),
        avatar: z.string().max(24),
        banner: z.string().max(24),
      })
      .parse(data),
  )
  .handler(({ data }) => updateProfile(data));

export const pickStarter = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ starterId: z.string().max(40) }).parse(data))
  .handler(({ data }) => chooseStarter(data.starterId));

export const claimDailyReward = createServerFn({ method: "POST" }).handler(() => claimDaily());

export const purchaseItem = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ itemId: z.string().max(40), qty: z.number().int().min(1).max(99) }).parse(data),
  )
  .handler(({ data }) => buyItem(data));

export const fetchGuilds = createServerFn({ method: "GET" }).handler(() => listGuilds());

export const requestJoinGuild = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ guildId: z.string().max(40) }).parse(data))
  .handler(({ data }) => joinGuild(data.guildId));

export const requestLeaveGuild = createServerFn({ method: "POST" }).handler(() => leaveGuild());

export const charterGuild = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        name: z.string().min(3).max(32),
        tag: z.string().min(2).max(5),
        description: z.string().max(200),
      })
      .parse(data),
  )
  .handler(({ data }) => createGuild(data));

export const flipCoin = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({ wager: z.number().int().min(50).max(100000), pick: z.enum(["heads", "tails"]) })
      .parse(data),
  )
  .handler(({ data }) => playCoinFlip(data));

export const spinSlots = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ wager: z.number().int().min(50).max(50000) }).parse(data))
  .handler(({ data }) => playSlots(data));

export const placeBet = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ wager: z.number().int().min(10).max(1000000) }).parse(data))
  .handler(({ data }) => playBet(data));

export const setLead = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ pokemonId: z.string().min(1).max(64) }).parse(data))
  .handler(({ data }) => setLeadPokemon(data.pokemonId));

export const reorderParty = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ first: z.number().int().min(1).max(6), second: z.number().int().min(1).max(6) }).parse(data))
  .handler(({ data }) => swapParty(data));

export const movePartyPokemon = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ pokemonId: z.string().min(1).max(64), destination: z.enum(["party", "pc"]) }).parse(data))
  .handler(({ data }) => movePokemon(data));

export const fetchBattleRooms = createServerFn({ method: "GET" }).handler(() => listBattleRooms());
export const openBattleRoom = createServerFn({ method: "POST" }).handler(() => createBattleRoom());
export const fetchBattleRoom = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ roomId: z.string().min(1).max(64) }).parse(data))
  .handler(({ data }) => getBattleRoom(data.roomId));
export const applyBattleAction = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    roomId: z.string().min(1).max(64),
    action: z.discriminatedUnion("type", [
      z.object({ type: z.literal("ready") }),
      z.object({ type: z.literal("move"), moveIndex: z.number().int().min(0).max(10) }),
      z.object({ type: z.literal("switch"), pokemonIndex: z.number().int().min(0).max(5) }),
      z.object({ type: z.literal("item"), item: z.enum(["potion", "superpotion", "hyperpotion", "revive", "fullrestore"]) }),
      z.object({ type: z.literal("forfeit") }),
    ]),
  }).parse(data))
  .handler(({ data }) => performBattleAction(data.roomId, data.action));
