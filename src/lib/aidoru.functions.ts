import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  currentUserId,
  findUserById,
  toPublicUser,
  loginUser,
  clearSession,
} from "./auth.server";
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
  playSlots,
  leaderboard,
} from "./aidoru.server";
import type { PublicUser } from "./game";

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

export const fetchLeaderboard = createServerFn({ method: "GET" }).handler(() => leaderboard());

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
  .inputValidator((data) => z.object({ wager: z.number().int().min(50).max(100000) }).parse(data))
  .handler(({ data }) => playSlots(data));
