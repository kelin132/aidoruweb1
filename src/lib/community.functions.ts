import { createServerFn } from "@tanstack/react-start";
import { getDb } from "./db.server";

const COMMUNITY_BOTS = [
  { name: "Kelin MD", platform: "WhatsApp" },
  { name: "Aidoru", platform: "Discord" },
] as const;

type CommunityOverview = {
  accounts: number | null;
  cardsCollected: number | null;
  bots: typeof COMMUNITY_BOTS;
  discordInvite: string | null;
};

let cachedOverview: CommunityOverview | null = null;
let cachedUntil = 0;
let overviewPromise: Promise<CommunityOverview> | null = null;

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
      bots: COMMUNITY_BOTS,
      discordInvite: invite,
    };
  } catch {
    return {
      accounts: null,
      cardsCollected: null,
      bots: COMMUNITY_BOTS,
      discordInvite: null,
    };
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
