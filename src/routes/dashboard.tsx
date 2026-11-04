import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type CSSProperties } from "react";
import { Coins, Crown, Layers3, PackageOpen, Trophy } from "lucide-react";
import { AppShell } from "@/components/aidoru/AppShell";
import { UserAvatar } from "@/components/aidoru/UserAvatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/components/aidoru/session";
import {
  fetchCardsLeaderboard,
  fetchCoinsLeaderboard,
  fetchGymsLeaderboard,
  fetchPokemonLeaderboard,
  fetchXpLeaderboard,
} from "@/lib/aidoru.functions";
import {
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
  { id: "coins", label: "Wallet", icon: Coins },
  { id: "cards", label: "Cards", icon: PackageOpen },
  { id: "pokemon", label: "Pokémon", icon: Crown },
  { id: "gyms", label: "Gym Achievements", icon: Trophy },
];

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
  const [page, setPage] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState<LeaderboardRow | null>(null);
  const fetchXP = useServerFn(fetchXpLeaderboard);
  const fetchCoins = useServerFn(fetchCoinsLeaderboard);
  const fetchCards = useServerFn(fetchCardsLeaderboard);
  const fetchPokemon = useServerFn(fetchPokemonLeaderboard);
  const fetchGyms = useServerFn(fetchGymsLeaderboard);
  const leaderboardFn = metric === "xp" ? fetchXP : metric === "coins" ? fetchCoins : metric === "cards" ? fetchCards : metric === "pokemon" ? fetchPokemon : fetchGyms;
  const boardQuery = useQuery({
    queryKey: ["aidoru", "leaderboard", metric],
    queryFn: () => leaderboardFn(),
    staleTime: metric === "coins" ? 30_000 : 120_000,
    gcTime: 10 * 60_000,
    retry: false,
    refetchOnMount: true,
  });

  const board = [...(boardQuery.data ?? [])].sort((left, right) => {
    const scoreDelta = Number(right.score) - Number(left.score);
    if (scoreDelta !== 0) return scoreDelta;
    return left.name.localeCompare(right.name);
  }).slice(0, 50);
  const pageCount = Math.max(1, Math.ceil(board.length / 20));
  const pageRows = board.slice(page * 20, page * 20 + 20);
  const podium = page === 0 ? pageRows.slice(0, 3) : [];
  const remaining = page === 0 ? pageRows.slice(3) : pageRows;
  const selectedPlayerRank = selectedPlayer
    ? board.findIndex((row) => row.id === selectedPlayer.id) + 1
    : 0;

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
              onClick={() => {
                setMetric(id);
                setPage(0);
              }}
              className="leaderboard-tab"
            >
              <Icon className="size-5" /> <span>{label}</span>
            </button>
          ))}
        </div>

        {boardQuery.isLoading && <LeaderboardLoading />}
        {boardQuery.isError && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {String(boardQuery.error instanceof Error ? boardQuery.error.message : "").match(/MONGO(?:DB)?_URI|Database connection is not configured/i)
              ? "The leaderboard needs the MongoDB connection to be configured before it can load."
              : "The leaderboard is unavailable until the shared database is reachable."}
          </div>
        )}
        {!boardQuery.isLoading && !boardQuery.isError && board.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">No ranked trainers yet.</div>}

        {board.length > 0 && (
          <>
            {podium.length > 0 && (
              <div className="leaderboard-podium mt-8">
                {[podium[1], podium[0], podium[2]].map((row, index) => row && (
                  <PodiumCard
                    key={row.id}
                    row={row}
                    place={row === podium[0] ? 1 : index === 0 ? 2 : 3}
                    onClick={() => setSelectedPlayer(row)}
                  />
                ))}
              </div>
            )}
            <div className="mt-5 space-y-3">
              {remaining.map((row, index) => (
                <LeaderboardRowCard
                  key={`${row.id}-${index}`}
                  row={row}
                  rank={page === 0 ? index + 4 : page * 20 + index + 1}
                  current={row.id === user?.id}
                  onClick={() => setSelectedPlayer(row)}
                />
              ))}
            </div>
            {board.length > 20 && (
              <nav className="mt-6 flex items-center justify-center gap-4" aria-label="Leaderboard pages">
                <button
                  type="button"
                  className="leaderboard-tab"
                  disabled={page === 0}
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                >
                  Previous 20
                </button>
                <span className="text-sm text-muted-foreground">
                  Showing {page * 20 + 1}–{Math.min((page + 1) * 20, board.length)} of {board.length}
                </span>
                <button
                  type="button"
                  className="leaderboard-tab"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                >
                  Next 20
                </button>
              </nav>
            )}
          </>
        )}
        <Dialog open={Boolean(selectedPlayer)} onOpenChange={(open) => !open && setSelectedPlayer(null)}>
          <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto border-border bg-card">
            {selectedPlayer && (
              <div
                className={`space-y-5 rounded-xl p-2 ${selectedPlayer.profileBackground ? "leaderboard-has-background" : ""}`}
                style={leaderboardBackgroundStyle(selectedPlayer.profileBackground)}
              >
                <div className="flex items-center gap-4">
                  <UserAvatar
                    name={selectedPlayer.name}
                    src={selectedPlayer.avatarUrl}
                    videoSrc={selectedPlayer.avatarVideoUrl}
                    frame={selectedPlayer.profileFrame}
                    className="size-20 shrink-0"
                  />
                  <div className="min-w-0">
                    <DialogTitle className="truncate text-xl">{selectedPlayer.name}</DialogTitle>
                    <DialogDescription className="mt-1">{selectedPlayer.title} · Level {selectedPlayer.trainerLevel}</DialogDescription>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ProfileStat label="Rank" value={`#${selectedPlayerRank}`} />
                  <ProfileStat label={selectedPlayer.scoreLabel} value={scoreText(selectedPlayer)} />
                  <ProfileStat label="Pokémon" value={String(selectedPlayer.pokemonCount)} />
                  <ProfileStat label="Cards" value={String(selectedPlayer.cardCount)} />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </section>
    </div>
  );
}

function scoreText(row: LeaderboardRow) {
  const value = Math.max(0, Math.floor(Number(row.score) || 0));
  if (row.scoreLabel === "WALLET") return `${new Intl.NumberFormat("en-US").format(value)}`;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function metricLabel(row: LeaderboardRow) {
  if (row.scoreLabel === "BADGES") return `${row.score} badge${row.score === 1 ? "" : "s"}`;
  return `LV ${row.trainerLevel}`;
}

function trainerCollectionLabel(row: LeaderboardRow) {
  const pokemon = row.pokemonCount || (row.scoreLabel === "POKÉMON" ? row.score : 0);
  const cards = row.cardCount || (row.scoreLabel === "CARDS" ? row.score : 0);
  return `${pokemon} Pokémon · ${cards} cards`;
}

function PodiumCard({ row, place, onClick }: { row: LeaderboardRow; place: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`leaderboard-podium-card ${row.profileBackground ? "leaderboard-has-background" : ""}`}
      data-place={place}
      style={leaderboardBackgroundStyle(row.profileBackground)}
    >
      <span className="leaderboard-place">{place}</span>
      <UserAvatar name={row.name} src={row.avatarUrl} videoSrc={row.avatarVideoUrl} frame={row.profileFrame} className="leaderboard-podium-avatar" />
      <p className="leaderboard-podium-name" title={row.name}>{row.name}</p>
      <p className="leaderboard-score">{scoreText(row)} <span>{row.scoreLabel}</span></p>
    </button>
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

function LeaderboardRowCard({ row, rank, current, onClick }: {
  row: LeaderboardRow;
  rank: number;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`leaderboard-rank-row w-full text-left ${current ? "leaderboard-rank-row-current" : ""} ${row.profileBackground ? "leaderboard-has-background" : ""}`}
      style={leaderboardBackgroundStyle(row.profileBackground)}
    >
      <span className="leaderboard-rank">#{rank}</span>
      <UserAvatar name={row.name} src={row.avatarUrl} videoSrc={row.avatarVideoUrl} frame={row.profileFrame} className="leaderboard-rank-avatar" />
      <div className="min-w-0 flex-1">
        <p className="leaderboard-rank-name" title={row.name}>{row.name}</p>
        <p className="leaderboard-rank-meta">{row.title} · {metricLabel(row)} · {trainerCollectionLabel(row)}</p>
      </div>
      <p className="leaderboard-rank-score">{scoreText(row)} <span>{row.scoreLabel}</span></p>
    </button>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-bold">{value}</p>
    </div>
  );
}

function leaderboardBackgroundStyle(background: string | null): CSSProperties | undefined {
  if (!background) return undefined;
  return {
    backgroundImage: `linear-gradient(90deg, rgba(8, 12, 20, 0.96) 0%, rgba(8, 12, 20, 0.8) 52%, rgba(8, 12, 20, 0.64) 100%), url("${background}")`,
  };
}
