import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type CSSProperties } from "react";
import { Coins, Crown, Layers3, PackageOpen, Trophy } from "lucide-react";
import { AppShell } from "@/components/aidoru/AppShell";
import { UserAvatar } from "@/components/aidoru/UserAvatar";
import { useSession } from "@/components/aidoru/session";
import {
  fetchCardsLeaderboard,
  fetchCoinsLeaderboard,
  fetchGymsLeaderboard,
  fetchPokemonLeaderboard,
  fetchXpLeaderboard,
} from "@/lib/aidoru.functions";
import {
  formatCompactCoins,
  type LeaderboardMetric,
  type LeaderboardRow,
} from "@/lib/game";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Leaderboards — AIDORU" },
      {
        name: "description",
        content: "Live AIDORU rankings with real bot usernames, avatars, and trainer statistics.",
      },
    ],
  }),
  component: LeaderboardPage,
});

const METRICS: { id: LeaderboardMetric; label: string; icon: typeof Layers3 }[] = [
  { id: "xp", label: "XP", icon: Layers3 },
  { id: "coins", label: "Ryu", icon: Coins },
  { id: "cards", label: "Cards", icon: PackageOpen },
  { id: "pokemon", label: "Pokémon", icon: Crown },
  { id: "gyms", label: "Gym Achievements", icon: Trophy },
];

const LEADERBOARD_SNAPSHOT_PREFIX = "aidoru:leaderboard:snapshot:";
type LeaderboardSnapshot = { rows: LeaderboardRow[]; savedAt: number };

function readLeaderboardSnapshot(metric: LeaderboardMetric): LeaderboardSnapshot | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.sessionStorage.getItem(`${LEADERBOARD_SNAPSHOT_PREFIX}${metric}`);
    if (!stored) return undefined;
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) return { rows: parsed as LeaderboardRow[], savedAt: 0 };
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { rows?: unknown }).rows)
    ) {
      return {
        rows: (parsed as { rows: LeaderboardRow[] }).rows,
        savedAt: Number((parsed as { savedAt?: unknown }).savedAt) || 0,
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function writeLeaderboardSnapshot(metric: LeaderboardMetric, rows: LeaderboardRow[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${LEADERBOARD_SNAPSHOT_PREFIX}${metric}`,
      JSON.stringify({ rows, savedAt: Date.now() }),
    );
  } catch {
    // Storage can be unavailable in private browsing; the network result still works.
  }
}

function LeaderboardPage() {
  return (
    <AppShell title="Leaderboards" subtitle="Every ranking is pulled from the live trainer community.">
      <LeaderboardBody />
    </AppShell>
  );
}

function LeaderboardBody() {
  const { data: user } = useSession();
  const [metric, setMetric] = useState<LeaderboardMetric>("xp");
  const fetchXP = useServerFn(fetchXpLeaderboard);
  const fetchCoins = useServerFn(fetchCoinsLeaderboard);
  const fetchCards = useServerFn(fetchCardsLeaderboard);
  const fetchPokemon = useServerFn(fetchPokemonLeaderboard);
  const fetchGyms = useServerFn(fetchGymsLeaderboard);
  const leaderboardFn = metric === "xp" ? fetchXP : metric === "coins" ? fetchCoins : metric === "cards" ? fetchCards : metric === "pokemon" ? fetchPokemon : fetchGyms;
  const snapshot = readLeaderboardSnapshot(metric);
  const boardQuery = useQuery({
    queryKey: ["aidoru", "leaderboard", metric],
    queryFn: async () => {
      const rows = await leaderboardFn();
      writeLeaderboardSnapshot(metric, rows);
      return rows;
    },
    initialData: snapshot?.rows,
    initialDataUpdatedAt: snapshot?.savedAt || 0,
    staleTime: 120_000,
    gcTime: 10 * 60_000,
    retry: false,
    placeholderData: (previous) => previous,
    refetchOnMount: true,
  });

  if (!user) return null;
  const board = [...(boardQuery.data ?? [])].sort((left, right) => {
    const scoreDelta = Number(right.score) - Number(left.score);
    if (scoreDelta !== 0) return scoreDelta;
    return left.name.localeCompare(right.name);
  });
  const podium = board.slice(0, 3);
  const remaining = board.slice(3);

  return (
    <div className="space-y-6 pb-10">
      <section className="leaderboard-shell">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="hof-kicker">Live community rankings</p>
            <h2 className="hof-heading mt-1 text-4xl tracking-tight sm:text-6xl">Global Peeps</h2>
          </div>
          <div className="leaderboard-live-pill" data-loading={boardQuery.isFetching}>
            {boardQuery.isFetching ? "SYNCING" : metric.toUpperCase()} · LIVE
          </div>
        </div>
        <div className="leaderboard-tabs mt-6" role="tablist" aria-label="Leaderboard metric">
          {METRICS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              data-active={metric === id}
              onClick={() => setMetric(id)}
              className="leaderboard-tab"
            >
              <Icon className="size-5" /> <span>{label}</span>
            </button>
          ))}
        </div>

        {boardQuery.isLoading && <LeaderboardLoading />}
        {boardQuery.isError && <div className="py-12 text-center text-sm text-muted-foreground">The leaderboard is unavailable until the shared database is reachable.</div>}
        {!boardQuery.isLoading && !boardQuery.isError && board.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">No ranked trainers yet.</div>}

        {board.length > 0 && (
          <>
            <div className="leaderboard-podium mt-8">
              {[podium[1], podium[0], podium[2]].map((row, index) => row && <PodiumCard key={row.id} row={row} place={row === podium[0] ? 1 : index === 0 ? 2 : 3} />)}
            </div>
            <div className="mt-5 space-y-3">
              {remaining.map((row, index) => (
                <LeaderboardRowCard key={`${row.id}-${index}`} row={row} rank={index + 4} current={row.id === user.id} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function scoreText(row: LeaderboardRow) {
  // Use compact formatting for all large numbers to prevent UI overlap
  return formatCompactCoins(row.score);
}

function metricLabel(row: LeaderboardRow) {
  if (row.scoreLabel === "BADGES") return `${row.score} badge${row.score === 1 ? "" : "s"}`;
  return `LV ${row.trainerLevel}`;
}

function PodiumCard({ row, place }: { row: LeaderboardRow; place: number }) {
  return (
    <div
      className={`leaderboard-podium-card ${row.profileBackground ? "leaderboard-has-background" : ""}`}
      data-place={place}
      style={leaderboardBackgroundStyle(row.profileBackground)}
    >
      <span className="leaderboard-place">{place}</span>
      <UserAvatar name={row.name} src={row.avatarUrl} videoSrc={row.avatarVideoUrl} frame={row.profileFrame} className="leaderboard-podium-avatar" />
      <p className="leaderboard-podium-name" title={row.name}>{row.name}</p>
      <p className="leaderboard-score">{scoreText(row)} <span>{row.scoreLabel}</span></p>
    </div>
  );
}

function LeaderboardLoading() {
  return (
    <div className="leaderboard-loading" aria-live="polite">
      <div className="leaderboard-loading-podium">
        <span />
        <span />
        <span />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((rank) => (
          <div key={rank} className="leaderboard-loading-row">
            <span className="leaderboard-loading-rank" />
            <span className="leaderboard-loading-avatar" />
            <span className="leaderboard-loading-copy">
              <span />
              <span />
            </span>
            <span className="leaderboard-loading-score" />
          </div>
        ))}
      </div>
    </div>
  );
}

function LeaderboardRowCard({ row, rank, current }: { row: LeaderboardRow; rank: number; current: boolean }) {
  return (
    <div
      className={`leaderboard-rank-row ${current ? "leaderboard-rank-row-current" : ""} ${row.profileBackground ? "leaderboard-has-background" : ""}`}
      style={leaderboardBackgroundStyle(row.profileBackground)}
    >
      <span className="leaderboard-rank">#{rank}</span>
      <UserAvatar name={row.name} src={row.avatarUrl} videoSrc={row.avatarVideoUrl} frame={row.profileFrame} className="leaderboard-rank-avatar" />
      <div className="min-w-0 flex-1">
        <p className="leaderboard-rank-name" title={row.name}>{row.name}</p>
        <p className="leaderboard-rank-meta">{row.title} · {metricLabel(row)}</p>
      </div>
      <p className="leaderboard-rank-score">{scoreText(row)} <span>{row.scoreLabel}</span></p>
    </div>
  );
}

function leaderboardBackgroundStyle(background: string | null): CSSProperties | undefined {
  if (!background) return undefined;
  return {
    backgroundImage: `linear-gradient(90deg, rgba(8, 12, 20, 0.96) 0%, rgba(8, 12, 20, 0.8) 52%, rgba(8, 12, 20, 0.64) 100%), url("${background}")`,
  };
}
