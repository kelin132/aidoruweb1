import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { motion } from "motion/react";
import { Coins, Landmark, Flame, Backpack, Trophy, Check, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { Sprite } from "@/components/aidoru/Sprite";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import { fetchLeaderboard, fetchShopItems, saveProfile } from "@/lib/aidoru.functions";
import {
  AVATARS,
  ONBOARDING_TASKS,
  STARTERS,
  TITLES,
  formatCoins,
  levelProgress,
  rankFromLevel,
} from "@/lib/game";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — AIDORU trainer stats" },
      {
        name: "description",
        content:
          "Track coins, bank, XP level, streaks, inventory and guild standing across your AIDORU account.",
      },
      { property: "og:title", content: "Dashboard — AIDORU trainer stats" },
      {
        property: "og:description",
        content: "Coins, XP, streaks, inventory and guild standing in one neon dashboard.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <AppShell title="Dashboard" subtitle="Everything your AIDORU account is carrying right now.">
      <DashboardBody />
    </AppShell>
  );
}

function DashboardBody() {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const [editing, setEditing] = useState(false);

  const itemsQuery = useQuery({
    queryKey: ["aidoru", "items"],
    queryFn: useServerFn(fetchShopItems),
    retry: false,
  });
  const boardQuery = useQuery({
    queryKey: ["aidoru", "leaderboard"],
    queryFn: useServerFn(fetchLeaderboard),
    retry: false,
  });

  const persist = useServerFn(saveProfile);
  const [draft, setDraft] = useState({
    name: user?.name ?? "",
    bio: user?.bio ?? "",
    title: user?.title ?? TITLES[0],
    avatar: user?.avatar ?? "default",
    banner: user?.banner ?? "aurora",
  });

  const save = useMutation({
    mutationFn: () => persist({ data: draft }),
    onSuccess: (updated) => {
      writeSession(updated);
      setEditing(false);
      toast.success("Profile updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) return null;
  const progress = levelProgress(user.xp);
  const starter = STARTERS.find((s) => s.id === user.starter);
  const itemName = (id: string) => itemsQuery.data?.find((i) => i.id === id)?.name ?? id;
  const done = new Set(user.onboarding);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
        <StatCard
          icon={Coins}
          label="Wallet"
          value={formatCoins(user.coins)}
          hint="Spendable coins"
        />
        <StatCard
          icon={Landmark}
          label="Bank"
          value={formatCoins(user.bank)}
          hint="Stored safely"
        />
        <StatCard
          icon={Flame}
          label="Daily streak"
          value={`${user.streak} day${user.streak === 1 ? "" : "s"}`}
          hint="Keep it alive"
        />
        <StatCard
          icon={Backpack}
          label="Inventory"
          value={`${user.inventory.reduce((s, e) => s + e.qty, 0)}`}
          hint={`${user.inventory.length} unique items`}
        />

        {/* XP */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-6 sm:col-span-2"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono-ui text-muted-foreground text-[10px] tracking-[0.24em] uppercase">
                Progression
              </p>
              <p className="font-display mt-1 text-2xl font-bold">
                Level {progress.level}{" "}
                <span className="text-muted-foreground text-sm font-medium">
                  · {rankFromLevel(progress.level)}
                </span>
              </p>
            </div>
            <p className="font-mono-ui text-muted-foreground text-xs">
              {formatCoins(progress.current)} / {formatCoins(progress.needed)} XP
            </p>
          </div>
          <div className="bg-muted mt-4 h-3 overflow-hidden rounded-full">
            <motion.div
              className="bg-gradient-xp h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress.percent}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </motion.div>

        {/* Inventory */}
        <div className="glass rounded-3xl p-6 sm:col-span-2">
          <h2 className="font-display text-lg font-bold">Bag</h2>
          {user.inventory.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">
              Empty for now — grab your first item at the Mart.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {user.inventory.map((entry) => (
                <div
                  key={entry.itemId}
                  className="glass glass-hover flex items-center gap-3 rounded-2xl p-3"
                >
                  <Sprite name="ball" alt="" className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{itemName(entry.itemId)}</p>
                    <p className="text-muted-foreground font-mono-ui text-[10px] tracking-widest uppercase">
                      Qty {entry.qty}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div className="glass rounded-3xl p-6 sm:col-span-2">
          <h2 className="font-display flex items-center gap-2 text-lg font-bold">
            <Trophy className="text-neon-cyan size-4" /> Top trainers
          </h2>
          <ol className="mt-4 space-y-2">
            {boardQuery.isError ? (
              <li className="text-muted-foreground text-sm">
                Leaderboard unavailable until the database connection is restored.
              </li>
            ) : (
              (boardQuery.data ?? []).map((row, i) => (
                <li
                  key={row.id}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                    row.id === user.id ? "glass border-neon-pink/40" : ""
                  }`}
                >
                  <span className="font-mono-ui text-muted-foreground w-6 text-xs">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 truncate text-sm font-semibold">{row.name}</span>
                  <span className="text-muted-foreground hidden text-xs sm:block">{row.title}</span>
                  <span className="font-mono-ui text-neon-cyan text-xs">
                    {formatCoins(row.xp)} XP
                  </span>
                </li>
              ))
            )}
            {!boardQuery.isError && boardQuery.data?.length === 0 && (
              <li className="text-muted-foreground text-sm">No trainers ranked yet.</li>
            )}
          </ol>
        </div>
      </div>

      {/* Profile column */}
      <div className="space-y-5">
        <div className="glass-strong overflow-hidden rounded-3xl">
          <div className="bg-gradient-brand relative h-24">
            <div className="absolute inset-0 opacity-40 blur-2xl" />
          </div>
          <div className="-mt-12 px-6 pb-6">
            <span className="border-neon-cyan/50 bg-panel-strong grid size-24 place-items-center overflow-hidden rounded-full border-2">
              <Sprite name={user.avatar} alt={user.name} className="size-24" />
            </span>

            {!editing ? (
              <>
                <p className="font-display mt-4 text-xl font-bold">{user.name}</p>
                <p className="text-neon-cyan font-mono-ui text-[11px] tracking-[0.2em] uppercase">
                  {user.title}
                </p>
                <p className="text-muted-foreground mt-3 text-sm">
                  {user.bio || "No bio yet. Tell the network who you are."}
                </p>
                <p className="text-muted-foreground font-mono-ui mt-3 text-[11px]">
                  {user.phoneNumber} · {user.guildName ?? "No guild"}
                </p>
                <button
                  onClick={() => setEditing(true)}
                  className="glass glass-hover mt-5 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-xs font-semibold tracking-widest uppercase"
                >
                  <Pencil className="size-3.5" /> Edit profile
                </button>
              </>
            ) : (
              <div className="mt-4 space-y-3">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Name"
                  className="glass w-full rounded-2xl px-4 py-2.5 text-sm outline-none"
                />
                <textarea
                  value={draft.bio}
                  onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                  placeholder="Bio"
                  rows={3}
                  className="glass w-full resize-none rounded-2xl px-4 py-2.5 text-sm outline-none"
                />
                <select
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="glass text-foreground w-full rounded-2xl px-4 py-2.5 text-sm outline-none"
                >
                  {TITLES.map((t) => (
                    <option key={t} value={t} className="bg-popover">
                      {t}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  {AVATARS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setDraft({ ...draft, avatar: a })}
                      className={`grid size-11 place-items-center overflow-hidden rounded-full border transition-all ${
                        draft.avatar === a
                          ? "border-neon-pink glow-pink scale-105"
                          : "border-border opacity-70 hover:opacity-100"
                      }`}
                    >
                      <Sprite name={a} alt={a} className="size-10" />
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => save.mutate()}
                    disabled={save.isPending}
                    className="bg-gradient-brand text-foreground flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-xs font-bold tracking-widest uppercase disabled:opacity-60"
                  >
                    <Save className="size-3.5" /> Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="glass rounded-full px-4 py-2.5 text-xs font-semibold tracking-widest uppercase"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {starter && (
          <div className="glass glass-hover flex items-center gap-4 rounded-3xl p-5">
            <Sprite
              name={starter.sprite}
              alt={starter.name}
              className="animate-float-soft size-20"
            />
            <div>
              <p className="font-mono-ui text-muted-foreground text-[10px] tracking-[0.24em] uppercase">
                Partner
              </p>
              <p className="font-display text-lg font-bold">{starter.name}</p>
              <p className="text-neon-cyan text-xs">
                {starter.type} · {starter.focus}
              </p>
            </div>
          </div>
        )}

        <div className="glass rounded-3xl p-6">
          <h2 className="font-display text-lg font-bold">Getting started</h2>
          <ul className="mt-4 space-y-2.5">
            {ONBOARDING_TASKS.map((task) => {
              const complete = done.has(task.id);
              return (
                <li key={task.id} className="flex items-center gap-3 text-sm">
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-full border ${
                      complete ? "bg-gradient-brand border-transparent" : "border-border"
                    }`}
                  >
                    {complete && <Check className="size-3" />}
                  </span>
                  <span className={complete ? "text-muted-foreground line-through" : ""}>
                    {task.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass glass-hover rounded-3xl p-6"
    >
      <span className="bg-gradient-brand grid size-10 place-items-center rounded-full">
        <Icon className="size-4" />
      </span>
      <p className="font-mono-ui text-muted-foreground mt-4 text-[10px] tracking-[0.24em] uppercase">
        {label}
      </p>
      <p className="font-display mt-1 text-3xl font-bold">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
    </motion.div>
  );
}
