import { createServerFn } from "@tanstack/react-start";
import { getDb } from "./db.server";

export type CommunityBot = {
  name: string;
  platform: "WhatsApp" | "Discord";
};

type CommunityOverview = {
  accounts: number | null;
  cardsCollected: number | null;
  discordInvite: string | null;
};

let cachedOverview: CommunityOverview | null = null;
let cachedUntil = 0;
let overviewPromise: Promise<CommunityOverview> | null = null;
let cachedBots: CommunityBot[] | null | undefined;
let cachedBotsUntil = 0;
let botsPromise: Promise<CommunityBot[] | null> | null = null;

async function loadCommunityOverview(): Promise<CommunityOverview> {
  try {
    const db = await getDb();
    const [accounts, cardCounts, communityConfig] = await Promise.all([
      db.collection("users").countDocuments({ registered: true }),
      db.collection("mn_users")
        .aggregate<{ total: number }>([
          { $unwind: "$cards" },
          { $count: "total" },
        ])
        .toArray(),
      db.collection("site_public_config").findOne(
        { _id: "community_links" },
        { projection: { discordInvite: 1 } },
      ),
    ]);

    const invite = typeof communityConfig?.discordInvite === "string"
      ? communityConfig.discordInvite
      : null;
    return {
      accounts,
      cardsCollected: Number(cardCounts[0]?.total ?? 0),
      discordInvite: invite,
    };
  } catch {
    return {
      accounts: null,
      cardsCollected: null,
      discordInvite: null,
    };
  }
}

async function loadActiveBots(): Promise<CommunityBot[] | null> {
  try {
    const cutoff = new Date(Date.now() - 70_000);
    const records = await (await getDb()).collection("bot_status")
      .find(
        {
          status: "online",
          sessionDeleted: { $ne: true },
          lastSeenAt: { $gte: cutoff },
        },
        { projection: { _id: 0, botName: 1, platform: 1 } },
      )
      .sort({ platform: 1, botName: 1 })
      .toArray();

    return records.map((record) => ({
      name: String(record.botName || "Unnamed Bot").slice(0, 60),
      platform: String(record.platform).toLowerCase() === "discord" ? "Discord" : "WhatsApp",
    }));
  } catch {
    return null;
  }
}

export const fetchCommunityOverview = createServerFn({ method: "GET" }).handler(async () => {
  if (cachedOverview && cachedUntil > Date.now()) return cachedOverview;
  if (overviewPromise) return overviewPromise;

  overviewPromise = loadCommunityOverview();
  try {
    cachedOverview = await overviewPromise;
    cachedUntil = Date.now() + 60_000;
    return cachedOverview;
  } finally {
    overviewPromise = null;
  }
});

export const fetchCommunityBots = createServerFn({ method: "GET" }).handler(async () => {
  if (cachedBots !== undefined && cachedBotsUntil > Date.now()) return cachedBots;
  if (botsPromise) return botsPromise;

  botsPromise = loadActiveBots();
  try {
    cachedBots = await botsPromise;
    cachedBotsUntil = Date.now() + 10_000;
    return cachedBots;
  } finally {
    botsPromise = null;
  }
});
