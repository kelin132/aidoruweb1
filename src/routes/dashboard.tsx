import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { motion } from "motion/react";
import { Backpack, Coins, Crown, Landmark, PackageOpen, Sparkles, Trophy } from "lucide-react";
import { AppShell } from "@/components/aidoru/AppShell";
import { UserAvatar } from "@/components/aidoru/UserAvatar";
import { useSession } from "@/components/aidoru/session";
import {
  fetchCardsLeaderboard,
  fetchCoinsLeaderboard,
  fetchPokemonLeaderboard,
  fetchShopItems,
  fetchXpLeaderboard,
} from "@/lib/aidoru.functions";
import {
  formatCoins,
  levelProgress,
  rankFromLevel,
  type LeaderboardMetric,
  type LeaderboardRow,
  type ShopItem,
} from "@/lib/game";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Hall of Fame — AIDORU" },
      {
        name: "description",
        content:
          "Live AIDORU leaderboards, trainer inventory, Pokémon ownership and bot-linked profile data.",
      },
      { property: "og:title", content: "Hall of Fame — AIDORU" },
    ],
  }),
  component: DashboardPage,
});

const METRICS: { id: LeaderboardMetric; label: string; icon: typeof Trophy }[] = [
  { id: "xp", label: "XP", icon: Sparkles },
  { id: "coins", label: "Coins", icon: Coins },
  { id: "cards", label: "Cards", icon: PackageOpen },
  { id: "pokemon", label: "Pokémon", icon: Crown },
];

function DashboardPage() {
  return (
    <AppShell
      title="Hall of Fame"
      subtitle="The live AIDORU rankings, inventory and trainer collection."
    >
      <DashboardBody />
    </AppShell>
  );
}

function DashboardBody() {
  const { data: user } = useSession();
  const [metric, setMetric] = useState<LeaderboardMetric>("xp");
  const fetchXP = useServerFn(fetchXpLeaderboard);
  const fetchCoins = useServerFn(fetchCoinsLeaderboard);
  const fetchCards = useServerFn(fetchCardsLeaderboard);
  const fetchPokemon = useServerFn(fetchPokemonLeaderboard);
  const fetchItems = useServerFn(fetchShopItems);

  const leaderboardFn =
    metric === "xp"
      ? fetchXP
      : metric === "coins"
        ? fetchCoins
        : metric === "cards"
          ? fetchCards
          : fetchPokemon;
  const boardQuery = useQuery({
    queryKey: ["aidoru", "leaderboard", metric],
    queryFn: leaderboardFn,
    retry: false,
  });
  const itemsQuery = useQuery({ queryKey: ["aidoru", "items"], queryFn: fetchItems, retry: false });

  if (!user) return null;
  const progress = levelProgress(user.xp);
  const itemMap = new Map((itemsQuery.data ?? []).map((item) => [item.id, item]));
  const board = boardQuery.data ?? [];
  const podium = board.slice(0, 3);
  const remaining = board.slice(3);
  const totalItems = user.inventory.reduce((sum, entry) => sum + entry.qty, 0);

  return (
    <div className="space-y-8 pb-10">
      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="hof-panel relative overflow-hidden p-6 sm:p-8">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="hof-kicker">Trainer profile</p>
              <h2 className="hof-heading mt-2 text-4xl leading-none sm:text-5xl">{user.name}</h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                {user.bio || "Your live trainer profile, pulled from Kelin-MD2."}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 font-mono-ui text-[10px] tracking-[0.18em] text-cyan-200 uppercase">
                  {user.websiteId}
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1 font-mono-ui text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                  {user.title}
                </span>
              </div>
            </div>
            <UserAvatar
              name={user.name}
              src={user.avatarUrl}
              className="size-24 border-2 border-cyan-300/60 sm:size-28"
            />
          </div>
          <div className="relative mt-7 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">
            <MetricChip icon={Coins} label="Wallet" value={formatCoins(user.coins)} />
            <MetricChip icon={Landmark} label="Bank" value={formatCoins(user.bank)} />
            <MetricChip
              icon={Sparkles}
              label={`Level ${progress.level}`}
              value={`${progress.percent}% XP`}
            />
          </div>
        </div>

        <div className="hof-panel p-6">
          <p className="hof-kicker">Current rank</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="hof-heading text-4xl">{rankFromLevel(progress.level)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCoins(progress.current)} / {formatCoins(progress.needed)} XP to the next
                level
              </p>
            </div>
            <Trophy className="mb-1 size-10 text-cyan-300" />
          </div>
          <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress.percent}%` }}
              transition={{ duration: 0.8 }}
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-sky-500"
            />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <MiniStat label="Bag items" value={String(totalItems)} />
            <MiniStat label="Pokémon" value={String(user.pokemon.length)} />
          </div>
        </div>
      </section>

      <section className="hof-panel overflow-hidden p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="hof-kicker">Community rankings</p>
            <h2 className="hof-heading mt-1 text-3xl sm:text-4xl">Hall of Fame</h2>
          </div>
          <span className="font-mono-ui text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Live from Kelin-MD2
          </span>
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

        {boardQuery.isLoading && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading live rankings…
          </div>
        )}
        {boardQuery.isError && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            The leaderboard is unavailable until the shared database is reachable.
          </div>
        )}
        {!boardQuery.isLoading && !boardQuery.isError && board.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No ranked trainers yet.
          </div>
        )}

        {board.length > 0 && (
          <>
            <div className="mt-10 grid items-end gap-3 sm:grid-cols-3">
              {[podium[1], podium[0], podium[2]].map(
                (row, index) =>
                  row && (
                    <PodiumCard
                      key={row.id}
                      row={row}
                      place={row === podium[0] ? 1 : index === 0 ? 2 : 3}
                    />
                  ),
              )}
            </div>
            <div className="mt-6 space-y-3">
              {remaining.map((row, index) => (
                <LeaderboardRowCard
                  key={row.id}
                  row={row}
                  rank={index + 4}
                  current={row.id === user.websiteId}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="hof-panel p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="hof-kicker">Trainer inventory</p>
              <h2 className="hof-heading mt-1 text-3xl">Your bag</h2>
            </div>
            <Backpack className="size-6 text-cyan-300" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Actual quantities from the bot account. Buy more with{" "}
            <span className="text-cyan-200">.mart</span> in WhatsApp.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {user.inventory.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Your bag is empty. Start with <span className="text-cyan-200">.mart</span>.
              </p>
            )}
            {user.inventory.map((entry) => (
              <InventoryCard key={entry.itemId} entry={entry} item={itemMap.get(entry.itemId)} />
            ))}
          </div>
        </div>

        <div className="hof-panel p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="hof-kicker">Owned collection</p>
              <h2 className="hof-heading mt-1 text-3xl">Pokémon</h2>
            </div>
            <Sparkles className="size-6 text-cyan-300" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Live Pokémon records linked to your bot trainer profile.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-3">
            {user.pokemon.length === 0 && (
              <p className="col-span-full text-sm text-muted-foreground">
                No Pokémon yet. Start your journey in WhatsApp.
              </p>
            )}
            {user.pokemon.slice(0, 9).map((pokemon) => (
              <div
                key={pokemon.id}
                className="hof-image overflow-hidden rounded-2xl border border-white/10 p-2 text-center"
              >
                <img
                  src={pokemon.imageUrl}
                  alt={pokemon.displayName}
                  loading="lazy"
                  className="mx-auto aspect-square w-full object-contain"
                />
                <p className="truncate font-display text-base font-semibold">
                  {pokemon.nickname || pokemon.displayName}
                </p>
                <p className="font-mono-ui text-[10px] text-cyan-200">LV {pokemon.level}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5 text-cyan-300" />
        {label}
      </div>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 px-3 py-2">
      <p className="hof-label">{label}</p>
      <p className="hof-value mt-1">{value}</p>
    </div>
  );
}

function PodiumCard({ row, place }: { row: LeaderboardRow; place: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="hof-podium flex flex-col items-center justify-center p-4 text-center"
      data-place={place}
    >
      <span className="hof-label mb-3">#{place}</span>
      <UserAvatar name={row.name} src={row.avatarUrl} className="size-16 border-2 sm:size-20" />
      <p className="mt-3 w-full truncate font-display text-xl font-bold">{row.name}</p>
      <p className="hof-value mt-1">
        {formatCoins(row.score)} {row.scoreLabel}
      </p>
    </motion.div>
  );
}

function LeaderboardRowCard({
  row,
  rank,
  current,
}: {
  row: LeaderboardRow;
  rank: number;
  current: boolean;
}) {
  return (
    <div
      className={`hof-row flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-5 ${current ? "border-cyan-300/50 bg-cyan-300/5" : ""}`}
    >
      <span className={`hof-number w-8 ${current ? "hof-number-cyan" : ""}`}>#{rank}</span>
      <UserAvatar name={row.name} src={row.avatarUrl} className="size-10 sm:size-12" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-xl font-bold">{row.name}</p>
        <p className="truncate text-xs text-muted-foreground">{row.title}</p>
      </div>
      <p className="hof-value whitespace-nowrap text-base sm:text-xl">
        {formatCoins(row.score)} {row.scoreLabel}
      </p>
    </div>
  );
}

function InventoryCard({
  entry,
  item,
}: {
  entry: { itemId: string; qty: number };
  item?: ShopItem | undefined;
}) {
  const src = item?.imageUrl;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 p-3">
      <div className="hof-image grid size-12 shrink-0 place-items-center rounded-xl">
        <img src={src} alt="" loading="lazy" className="size-9 object-contain" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg font-semibold">{item?.name ?? entry.itemId}</p>
        <p className="hof-label">Quantity {entry.qty}</p>
      </div>
    </div>
  );
}
