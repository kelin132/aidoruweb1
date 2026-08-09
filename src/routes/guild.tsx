import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { motion } from "motion/react";
import { Users, Crown, Coins, LogOut, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import {
  charterGuild,
  fetchGuilds,
  requestJoinGuild,
  requestLeaveGuild,
} from "@/lib/aidoru.functions";
import { GUILD_CREATION_COST, formatCoins } from "@/lib/game";

export const Route = createFileRoute("/guild")({
  head: () => ({
    meta: [
      { title: "Guilds — Join or charter a crew | AIDORU" },
      {
        name: "description",
        content:
          "Browse AIDORU guilds, join a crew, or charter your own with a name, tag and description.",
      },
      { property: "og:title", content: "Guilds — Join or charter a crew | AIDORU" },
      {
        property: "og:description",
        content: "Browse guilds, join a crew, or charter your own in AIDORU.",
      },
    ],
  }),
  component: GuildPage,
});

function GuildPage() {
  return (
    <AppShell title="Guild System" subtitle="Find a crew, or start one and lead it yourself.">
      <GuildBody />
    </AppShell>
  );
}

function GuildBody() {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", tag: "", description: "" });
  const [creating, setCreating] = useState(false);

  const guildsQuery = useQuery({
    queryKey: ["aidoru", "guilds"],
    queryFn: useServerFn(fetchGuilds),
  });
  const join = useServerFn(requestJoinGuild);
  const leave = useServerFn(requestLeaveGuild);
  const charter = useServerFn(charterGuild);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["aidoru", "guilds"] });

  const joinMutation = useMutation({
    mutationFn: (guildId: string) => join({ data: { guildId } }),
    onSuccess: (u) => {
      writeSession(u);
      void refresh();
      toast.success("Joined the guild");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leaveMutation = useMutation({
    mutationFn: () => leave(),
    onSuccess: (u) => {
      writeSession(u);
      void refresh();
      toast.success("You left the guild");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMutation = useMutation({
    mutationFn: () => charter({ data: form }),
    onSuccess: (u) => {
      writeSession(u);
      void refresh();
      setCreating(false);
      setForm({ name: "", tag: "", description: "" });
      toast.success("Guild chartered");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="glass-strong flex flex-wrap items-center gap-4 rounded-3xl p-6">
        <span className="bg-gradient-brand grid size-12 place-items-center rounded-full">
          <Users className="size-5" />
        </span>
        <div className="min-w-52 flex-1">
          <p className="font-mono-ui text-muted-foreground text-[10px] tracking-[0.24em] uppercase">
            Your standing
          </p>
          <p className="font-display text-xl font-bold">{user.guildName ?? "Unaffiliated"}</p>
        </div>
        {user.guildId ? (
          <button
            onClick={() => leaveMutation.mutate()}
            className="glass glass-hover hover:text-destructive flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-[0.16em] uppercase"
          >
            <LogOut className="size-3.5" /> Leave
          </button>
        ) : null}
        <button
          onClick={() => setCreating((v) => !v)}
          className="bg-gradient-brand text-foreground flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-bold tracking-[0.16em] uppercase"
        >
          <Plus className="size-3.5" /> Charter guild
        </button>
      </div>

      {creating && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="glass overflow-hidden rounded-3xl p-6"
        >
          <h2 className="font-display text-lg font-bold">New guild</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Costs {formatCoins(GUILD_CREATION_COST)} coins. Half is seeded into the guild bank.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Guild name"
              className="glass rounded-2xl px-4 py-3 text-sm outline-none"
            />
            <input
              value={form.tag}
              onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase() })}
              placeholder="TAG"
              maxLength={5}
              className="glass font-mono-ui rounded-2xl px-4 py-3 text-sm tracking-[0.2em] outline-none"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What is this guild about?"
              rows={3}
              className="glass resize-none rounded-2xl px-4 py-3 text-sm outline-none md:col-span-2"
            />
          </div>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="bg-gradient-brand text-foreground glow-pink mt-4 rounded-full px-8 py-3 text-[11px] font-bold tracking-[0.2em] uppercase disabled:opacity-50"
          >
            {createMutation.isPending ? "Chartering…" : "Create for 5,000"}
          </button>
        </motion.div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(guildsQuery.data ?? []).map((guild, i) => (
          <motion.div
            key={guild.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.05 }}
            className={`glass glass-hover flex flex-col rounded-3xl p-6 ${
              guild.isMember ? "border-neon-pink/50" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="bg-gradient-brand font-mono-ui grid size-12 place-items-center rounded-2xl text-xs font-bold tracking-widest">
                {guild.tag}
              </span>
              <div className="min-w-0">
                <p className="font-display truncate text-lg font-bold">{guild.name}</p>
                <p className="text-muted-foreground font-mono-ui text-[10px] tracking-[0.2em] uppercase">
                  Level {guild.level} · {guild.memberCount} members
                </p>
              </div>
            </div>
            <p className="text-muted-foreground mt-3 flex-1 text-sm">{guild.description}</p>
            <div className="mt-4 flex items-center gap-3">
              <span className="glass font-mono-ui flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px]">
                <Coins className="text-neon-pink size-3.5" /> {formatCoins(guild.bank)}
              </span>
              {guild.leaderId === user.id && (
                <span className="glass text-rarity-legend flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px]">
                  <Crown className="size-3.5" /> Leader
                </span>
              )}
              <button
                onClick={() => joinMutation.mutate(guild.id)}
                disabled={guild.isMember || joinMutation.isPending}
                className="bg-gradient-brand text-foreground ml-auto rounded-full px-5 py-2 text-[11px] font-bold tracking-[0.16em] uppercase disabled:opacity-40"
              >
                {guild.isMember ? "Joined" : "Join"}
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
