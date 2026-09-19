import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  currentUserId,
  findUserById,
  toPublicUser,
  beginPhoneLogin,
  createWebsiteAccount,
  completePhoneVerification,
  loginUser,
  beginPasswordReset,
  completePasswordReset,
  requestOtp,
  verifyOtpForReset,
  resetPasswordWithOtp,
  getDiscordLinkStatus,
  startDiscordLink,
  completeDiscordLink,
  startDiscordLogin,
  completeDiscordLogin,
  completePendingDiscordLink,
  completeDiscordCallback,
  unlinkDiscordAccount,
  clearSession,
} from "./auth.server";
import {
  listShopItems,
  updateProfile,
  chooseStarter,
  claimDaily,
  claimWebsiteDaily,
  buyItem,
  listGuilds,
  joinGuild,
  leaveGuild,
  createGuild,
  upgradeGuild,
  updateGuildInfo,
  playCoinFlip,
  playBet,
  playSlots,
  playDice,
  playRoulette,
  setLeadPokemon,
  swapParty,
  movePokemon,
  leaderboard,
  listMyCards,
  listCards,
  listCardMarket,
  purchaseCardListing,
  listMyPets,
  feedPet,
  playPet,
  hatchPet,
  selectPet,
  releasePet,
  buyPetCare,
  submitModeratorApplication,
} from "./aidoru.server";
import type { PublicUser } from "./game";
import {
  createBattleRoom,
  createGymBattleRoom,
  getBattleRoom,
  listBattleRooms,
  listGyms,
  performBattleAction,
} from "./battle.server";

export const getSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicUser | null> => {
    const id = await currentUserId();
    if (!id) return null;
    try {
      const doc = await findUserById(id);
      return doc ? toPublicUser(doc) : null;
    } catch {
      // A stale cookie must not make the public login page unusable when one
      // deployment instance temporarily cannot reach MongoDB. Mutations and
      // protected data requests still surface their own database errors.
      return null;
    }
  },
);

export const phoneLogin = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        countryCode: z.string().min(1).max(4),
        phoneNumber: z.string().min(5).max(18),
        password: z.string().min(8).max(128),
      })
      .parse(data),
  )
  .handler(({ data }) => beginPhoneLogin(data));

export const websiteIdLogin = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        websiteId: z.string().min(1).max(32),
        password: z.string().min(8).max(128),
      })
      .parse(data),
  )
  .handler(({ data }) => loginUser(data));

export const createAccount = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        countryCode: z.string().min(1).max(4),
        phoneNumber: z.string().min(5).max(18),
        name: z.string().min(2).max(20),
        password: z.string().min(8).max(128),
      })
      .parse(data),
  )
  .handler(({ data }) => createWebsiteAccount(data));

export const verifyPhone = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        countryCode: z.string().min(1).max(4),
        phoneNumber: z.string().min(5).max(18),
        code: z.string().regex(/^\d{6}$/),
      })
      .parse(data),
  )
  .handler(({ data }) => completePhoneVerification(data));

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        countryCode: z.string().min(1).max(4),
        phoneNumber: z.string().min(5).max(18),
        password: z.string().min(8).max(128),
      })
      .parse(data),
  )
  .handler(({ data }) => beginPasswordReset(data));

export const resetPassword = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        countryCode: z.string().min(1).max(4),
        phoneNumber: z.string().min(5).max(18),
        code: z.string().regex(/^\d{6}$/),
      })
      .parse(data),
  )
  .handler(({ data }) => completePasswordReset(data));

export const requestOtpCode = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        websiteId: z.string().min(8).max(32).optional(),
        countryCode: z.string().min(1).max(4).optional(),
        phoneNumber: z.string().min(5).max(18).optional(),
      })
      .refine(
        (value) =>
          Boolean(value.websiteId?.trim()) ||
          Boolean(value.countryCode?.trim() && value.phoneNumber?.trim()),
        "Enter your AIDORU ID or phone number.",
      )
      .parse(data),
  )
  .handler(({ data }) => {
    if (data.websiteId) return requestOtp({ websiteId: data.websiteId });
    return requestOtp({
      countryCode: data.countryCode!,
      phoneNumber: data.phoneNumber!,
    });
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        websiteId: z.string().min(8).max(32),
        otp: z.string().regex(/^\d{6}$/),
      })
      .parse(data),
  )
  .handler(({ data }) => verifyOtpForReset(data));

export const resetPasswordWithCode = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        websiteId: z.string().min(8).max(32),
        resetToken: z.string().min(32).max(128),
        newPassword: z.string().min(8).max(128),
      })
      .parse(data),
  )
  .handler(({ data }) => resetPasswordWithOtp(data));

export const startDiscordAccountLink = createServerFn({ method: "POST" }).handler(() =>
  startDiscordLink(),
);

export const finishDiscordAccountLink = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ code: z.string().min(1).max(2048), state: z.string().min(1).max(256) }).parse(data),
  )
  .handler(({ data }) => completeDiscordLink(data));

export const finishDiscordCallback = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ code: z.string().min(1).max(2048), state: z.string().min(1).max(256) }).parse(data),
  )
  .handler(({ data }) => completeDiscordCallback(data));

export const startDiscordWebsiteLogin = createServerFn({ method: "POST" }).handler(() =>
  startDiscordLogin(),
);

export const finishDiscordWebsiteLogin = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ code: z.string().min(1).max(2048), state: z.string().min(1).max(256) }).parse(data),
  )
  .handler(({ data }) => completeDiscordLogin(data));

export const linkDiscordWebsiteAccount = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        websiteId: z.string().min(1).max(32),
        password: z.string().min(8).max(128),
      })
      .parse(data),
  )
  .handler(({ data }) => completePendingDiscordLink(data));

export const fetchDiscordLinkStatus = createServerFn({ method: "GET" }).handler(() =>
  getDiscordLinkStatus(),
);

export const removeDiscordAccountLink = createServerFn({ method: "POST" }).handler(() =>
  unlinkDiscordAccount(),
);

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
export const fetchGymsLeaderboard = createServerFn({ method: "GET" }).handler(() =>
  leaderboard("gyms"),
);

export const fetchMyCards = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z.object({ scope: z.enum(["mine", "global"]).default("mine") }).parse(data ?? {}),
  )
  .handler(({ data }) => (data.scope === "global" ? listCards("global") : listMyCards()));

export const fetchCardMarket = createServerFn({ method: "GET" }).handler(() => listCardMarket());

export const buyCardListing = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ listingId: z.string().min(1).max(128) }).parse(data))
  .handler(({ data }) => purchaseCardListing(data.listingId));

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
  .inputValidator((data) =>
    z
      .object({
        itemKey: z.enum([
          "kibble",
          "meal",
          "toy",
          "exppotion",
          "revival",
          "berry",
          "energy",
          "deluxemeal",
          "grooming",
          "friendship",
          "superxp",
          "goldenmeal",
        ]),
        petId: z.string().min(1).max(16),
      })
      .parse(data),
  )
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
        avatarImage: z.string().max(1_500_000).optional(),
        avatarVideo: z.string().max(5_000_000).optional(),
        background: z.string().max(1_500_000).optional(),
        profileFrame: z.string().max(32).optional(),
      })
      .parse(data),
  )
  .handler(({ data }) => updateProfile(data));

export const pickStarter = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ starterId: z.string().max(40) }).parse(data))
  .handler(({ data }) => chooseStarter(data.starterId));

export const claimDailyReward = createServerFn({ method: "POST" }).handler(() => claimDaily());

export const claimWebsiteDailyReward = createServerFn({ method: "POST" }).handler(() =>
  claimWebsiteDaily(),
);

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

export const upgradeMyGuild = createServerFn({ method: "POST" }).handler(() => upgradeGuild());

export const updateGuildSettings = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        description: z.string().max(200).optional(),
        iconUrl: z.string().url().optional(),
        bannerUrl: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(({ data }) => updateGuildInfo({
    description: data.description,
    iconUrl: data.iconUrl,
    bannerUrl: data.bannerUrl,
  }));

export const flipCoin = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({ wager: z.number().int().min(50).max(1000000000), pick: z.enum(["heads", "tails"]) })
      .parse(data),
  )
  .handler(({ data }) => playCoinFlip(data));

export const spinSlots = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ wager: z.number().int().min(50).max(1000000000) }).parse(data))
  .handler(({ data }) => playSlots(data));

export const placeBet = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ wager: z.number().int().min(10).max(1000000000) }).parse(data),
  )
  .handler(({ data }) => playBet(data));

export const throwDice = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ wager: z.number().int().min(50).max(500000000), guess: z.number().int().min(1).max(6) }).parse(data),
  )
  .handler(({ data }) => playDice(data));

export const spinRoulette = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ wager: z.number().int().min(100).max(1000000000), color: z.enum(["red", "black", "green"]) }).parse(data),
  )
  .handler(({ data }) => playRoulette(data));

export const setLead = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ pokemonId: z.string().min(1).max(64) }).parse(data))
  .handler(({ data }) => setLeadPokemon(data.pokemonId));

export const reorderParty = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({ first: z.number().int().min(1).max(6), second: z.number().int().min(1).max(6) })
      .parse(data),
  )
  .handler(({ data }) => swapParty(data));

export const movePartyPokemon = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({ pokemonId: z.string().min(1).max(64), destination: z.enum(["party", "pc"]) })
      .parse(data),
  )
  .handler(({ data }) => movePokemon(data));

export const fetchBattleRooms = createServerFn({ method: "GET" }).handler(() => listBattleRooms());
export const openBattleRoom = createServerFn({ method: "POST" }).handler(() => createBattleRoom());
export const fetchGyms = createServerFn({ method: "GET" }).handler(() => listGyms());
export const openGymRoom = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ gymId: z.string().min(1).max(40) }).parse(data))
  .handler(({ data }) => createGymBattleRoom(data.gymId));
export const fetchBattleRoom = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ roomId: z.string().min(1).max(64) }).parse(data))
  .handler(({ data }) => getBattleRoom(data.roomId));
export const applyBattleAction = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        roomId: z.string().min(1).max(64),
        action: z.discriminatedUnion("type", [
          z.object({ type: z.literal("ready") }),
          z.object({ type: z.literal("move"), moveIndex: z.number().int().min(0).max(10) }),
          z.object({ type: z.literal("switch"), pokemonIndex: z.number().int().min(0).max(5) }),
          z.object({
            type: z.literal("item"),
            item: z.enum(["potion", "superpotion", "hyperpotion", "revive", "fullrestore"]),
          }),
          z.object({ type: z.literal("forfeit") }),
        ]),
      })
      .parse(data),
  )
  .handler(({ data }) => performBattleAction(data.roomId, data.action));

export const sendModeratorApplication = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        name: z.string().trim().min(2).max(60),
        phoneNumber: z.string().trim().min(5).max(32),
        reason: z.string().trim().min(20).max(1_200),
        requestedRole: z.enum(["mod", "staff"]),
        botKnowledge: z.enum(["new", "basic", "confident", "expert"]),
        gender: z.enum(["female", "male"]),
      })
      .parse(data),
  )
  .handler(({ data }) => submitModeratorApplication(data));
