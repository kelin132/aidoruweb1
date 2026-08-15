import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { motion } from "motion/react";
import { Coins, Crown, PackageOpen, Sparkles, Trophy } from "lucide-react";
import { AppShell } from "@/components/aidoru/AppShell";
import { UserAvatar } from "@/components/aidoru/UserAvatar";
import { useSession } from "@/components/aidoru/session";
import {
  fetchCardsLeaderboard,
  fetchCoinsLeaderboard,
  fetchPokemonLeaderboard,
  fetchXpLeaderboard,
} from "@/lib/aidoru.functions";
import {
  formatCoins,
  formatCompactCoins,
  levelFromXp,
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

const METRICS: { id: LeaderboardMetric; label: string; icon: typeof Trophy }[] = [
  { id: "xp", label: "XP", icon: Sparkles },
  { id: "coins", label: "Coins", icon: Coins },
  { id: "cards", label: "Cards", icon: PackageOpen },
  { id: "pokemon", label: "Pokémon", icon: Crown },
];

function LeaderboardPage() {
  return (
    <AppShell title="Leaderboards" subtitle="Every ranking is pulled from the live Kelin-MD2 community data.">
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
  const leaderboardFn = metric === "xp" ? fetchXP : metric === "coins" ? fetchCoins : metric === "cards" ? fetchCards : fetchPokemon;
  const boardQuery = useQuery({ queryKey: ["aidoru", "leaderboard", metric], queryFn: leaderboardFn, retry: false });

  if (!user) return null;
  const board = boardQuery.data ?? [];
  const podium = board.slice(0, 3);
  const remaining = board.slice(3);

  return (
    <div className="space-y-6 pb-10">
      <section className="hof-panel overflow-hidden p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="hof-kicker">Live community rankings</p>
            <h2 className="hof-heading mt-1 text-3xl sm:text-4xl">Hall of Fame</h2>
          </div>
          <p className="font-mono-ui text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Usernames · avatars · stats
          </p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/15 p-2 sm:grid-cols-4">
          {METRICS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              data-active={metric === id}
              onClick={() => setMetric(id)}
              className="hof-tab flex items-center justify-center gap-2 px-3 py-3 font-display text-lg font-semibold"
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        {boardQuery.isLoading && <div className="py-12 text-center text-sm text-muted-foreground">Loading live rankings…</div>}
        {boardQuery.isError && <div className="py-12 text-center text-sm text-muted-foreground">The leaderboard is unavailable until the shared database is reachable.</div>}
        {!boardQuery.isLoading && !boardQuery.isError && board.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">No ranked trainers yet.</div>}

        {board.length > 0 && (
          <>
            <div className="mt-8 grid items-end gap-3 sm:grid-cols-3">
              {[podium[1], podium[0], podium[2]].map((row, index) => row && <PodiumCard key={row.id} row={row} place={row === podium[0] ? 1 : index === 0 ? 2 : 3} />)}
            </div>
            <div className="mt-5 space-y-3">
              {remaining.map((row, index) => (
                <LeaderboardRowCard key={`${row.id}-${index}`} row={row} rank={index + 4} current={row.id === user.websiteId} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function scoreText(row: LeaderboardRow) {
  return row.scoreLabel === "COINS" ? formatCompactCoins(row.score) : formatCoins(row.score);
}

function PodiumCard({ row, place }: { row: LeaderboardRow; place: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="hof-podium flex flex-col items-center justify-center p-4 text-center" data-place={place}>
      <span className="hof-label mb-3">#{place}</span>
      <UserAvatar name={row.name} src={row.avatarUrl} className="size-16 border-2 sm:size-20" />
      <p className="mt-3 w-full truncate font-display text-xl font-bold">{row.name}</p>
      <p className="hof-value mt-1">{scoreText(row)} {row.scoreLabel}</p>
      <p className="mt-2 font-mono-ui text-[10px] text-muted-foreground">LV {levelFromXp(row.xp)} · {formatCompactCoins(row.coins)} coins</p>
    </motion.div>
  );
}

function LeaderboardRowCard({ row, rank, current }: { row: LeaderboardRow; rank: number; current: boolean }) {
  return (
    <div className={`hof-row flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-5 ${current ? "border-cyan-300/50 bg-cyan-300/5" : ""}`}>
      <span className={`hof-number w-8 ${current ? "hof-number-cyan" : ""}`}>#{rank}</span>
      <UserAvatar name={row.name} src={row.avatarUrl} className="size-10 shrink-0 sm:size-12" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-xl font-bold">{row.name}</p>
        <p className="truncate text-xs text-muted-foreground">{row.title} · LV {levelFromXp(row.xp)} · {row.pokemonCount} Pokémon · {row.cardCount} cards</p>
      </div>
      <div className="text-right">
        <p className="hof-value whitespace-nowrap text-base sm:text-xl">{scoreText(row)} <span className="text-[10px]">{row.scoreLabel}</span></p>
        <p className="font-mono-ui text-[9px] text-muted-foreground">{formatCompactCoins(row.coins)} wallet</p>
      </div>
    </div>
  );
}
