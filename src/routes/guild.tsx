import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpCircle,
  ChevronDown,
  Coins,
  Crown,
  ExternalLink,
  LoaderCircle,
  LogOut,
  Plus,
  Sparkles,
  Shuffle,
  Star,
  Swords,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { GuildWars } from "@/components/aidoru/GuildWars";
import { UserAvatar } from "@/components/aidoru/UserAvatar";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import heroArt from "@/assets/hero-idol.png";
import {
  adminBalanceGuildMembers,
  adminRemoveGuild,
  charterGuild,
  fetchGuilds,
  requestJoinGuild,
  reviewGuildApplication,
  requestLeaveGuild,
  upgradeMyGuild,
  updateGuildSettings,
} from "@/lib/aidoru.functions";
import { GUILD_CREATION_COST, formatCoins } from "@/lib/game";

const GUILD_WEBSITE_URL = "https://aidoru.zone.id/guild";

export const Route = createFileRoute("/guild")({
  head: () => ({
    meta: [
      { title: "Guilds · aidoru community" },
      {
        name: "description",
        content:
          "Build an anime guild, grow its level through bot work, manage its treasury, and meet upgrade requirements in aidoru community.",
      },
      { property: "og:title", content: "Guilds · aidoru community" },
      {
        property: "og:description",
        content: "Anime guild progression, members, treasury, taxes, and upgrades synced with Kelin-MD2.",
      },
    ],
  }),
  component: GuildPage,
});

function GuildPage() {
  const [showGuildWars, setShowGuildWars] = useState(false);

  return (
    <AppShell
      title={showGuildWars ? "Guild Wars" : "Guild System"}
      subtitle={
        showGuildWars
          ? "Guild battles, matchups, and strategy."
          : "A soft-lit anime guild hall for your bot-synced crew."
      }
    >
      <GuildBody showGuildWars={showGuildWars} setShowGuildWars={setShowGuildWars} />
    </AppShell>
  );
}

function ProgressBar({ value, tone = "pink" }: { value: number; tone?: "pink" | "cyan" }) {
  return (
    <div className="bg-background/60 h-2 overflow-hidden rounded-full">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className={`h-full rounded-full ${tone === "cyan" ? "bg-gradient-to-r from-cyan-300 to-sky-400" : "bg-gradient-to-r from-fuchsia-300 to-pink-400"}`}
      />
    </div>
  );
}

function GuildBody({
  showGuildWars,
  setShowGuildWars,
}: {
  showGuildWars: boolean;
  setShowGuildWars: (value: boolean) => void;
}) {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", tag: "", description: "", bannerUrl: "" });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ description: "", iconUrl: "", bannerUrl: "" });
  const [expandedGuildId, setExpandedGuildId] = useState<string | null>(null);

  const fetchGuildsFn = useServerFn(fetchGuilds);
  const guildsQuery = useQuery({
    queryKey: ["aidoru", "guilds"],
    queryFn: () => fetchGuildsFn(),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
  useEffect(() => {
    const requestedGuild = new URLSearchParams(window.location.search).get("apply");
    if (requestedGuild) setExpandedGuildId(requestedGuild);
  }, []);
  useEffect(() => {
    if (!guildsQuery.isSuccess || !expandedGuildId) return;
    const target = document.getElementById(`guild-${expandedGuildId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [guildsQuery.isSuccess, guildsQuery.data, expandedGuildId]);
  const join = useServerFn(requestJoinGuild);
  const reviewApplication = useServerFn(reviewGuildApplication);
  const leave = useServerFn(requestLeaveGuild);
  const charter = useServerFn(charterGuild);
  const upgrade = useServerFn(upgradeMyGuild);
  const updateSettings = useServerFn(updateGuildSettings);
  const removeGuild = useServerFn(adminRemoveGuild);
  const balanceGuildMembers = useServerFn(adminBalanceGuildMembers);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["aidoru", "guilds"] });

  const joinMutation = useMutation({
    mutationFn: (guildId: string) => join({ data: { guildId } }),
    onMutate: async (guildId) => {
      await queryClient.cancelQueries({ queryKey: ["aidoru", "guilds"] });
      const previousGuilds = queryClient.getQueryData<typeof guildsQuery.data>(["aidoru", "guilds"]);
      queryClient.setQueryData<typeof guildsQuery.data>(["aidoru", "guilds"], (current) =>
        current?.map((guild) => guild.id === guildId ? { ...guild, applicationStatus: "pending" } : guild),
      );
      return { previousGuilds };
    },
    onSuccess: () => {
      void refresh();
      toast.success("Application sent. The guild leader must approve it before you join.");
    },
    onError: (error: Error, _guildId, context) => {
      if (context?.previousGuilds) queryClient.setQueryData(["aidoru", "guilds"], context.previousGuilds);
      toast.error(error.message);
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (input: { applicationId: string; action: "approve" | "reject" }) =>
      reviewApplication({ data: input }),
    onSuccess: (result) => {
      void refresh();
      toast.success(result.status === "approved" ? "Trainer approved and added to the roster." : "Application declined.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const leaveMutation = useMutation({
    mutationFn: () => leave(),
    onSuccess: (nextUser) => {
      writeSession(nextUser);
      void refresh();
      toast.success("You left the guild");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: () => charter({
      data: {
        ...form,
        bannerUrl: form.bannerUrl.trim() || undefined,
      },
    }),
    onSuccess: (nextUser) => {
      writeSession(nextUser);
      void refresh();
      setCreating(false);
      setForm({ name: "", tag: "", description: "", bannerUrl: "" });
      toast.success("Guild chartered");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const upgradeMutation = useMutation({
    mutationFn: () => upgrade(),
    onSuccess: (nextUser) => {
      writeSession(nextUser);
      void refresh();
      toast.success("Guild upgraded!");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateSettings({
        data: {
          description: editForm.description,
          ...(editForm.iconUrl.trim() ? { iconUrl: editForm.iconUrl.trim() } : {}),
          ...(editForm.bannerUrl.trim() ? { bannerUrl: editForm.bannerUrl.trim() } : {}),
        },
      }),
    onSuccess: (nextUser) => {
      writeSession(nextUser);
      void refresh();
      setEditing(null);
      toast.success("Guild settings updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeGuildMutation = useMutation({
    mutationFn: (guildId: string) => removeGuild({ data: { guildId } }),
    onSuccess: (result) => {
      writeSession(result.user);
      void refresh();
      toast.success(`${result.guildName} was removed`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const balanceGuildMembersMutation = useMutation({
    mutationFn: () => balanceGuildMembers(),
    onSuccess: (result) => {
      writeSession(result.user);
      void refresh();
      toast.success(
        `Balanced ${result.memberCount} members across ${result.guildCount} guilds; ${result.movedMemberCount} moved.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user) return null;
  const guilds = guildsQuery.data ?? [];
  const canManageGuilds = user.staffLevel >= 3;
  if (showGuildWars) {
    return <GuildWars guilds={guilds} guildsLoading={guildsQuery.isLoading} onBack={() => setShowGuildWars(false)} />;
  }
  const currentGuild = guilds.find((guild) => guild.isMember);
  const confirmBalanceGuilds = () => {
    const accepted = window.confirm(
      `Balance regular members across all ${guilds.length} guilds? Members will be randomly reassigned to make guild sizes as even as capacity allows. Guild leaders stay in place. Membership is shared with the WhatsApp bot, so this changes guild membership there too; player accounts and other data stay unchanged. If there is not enough guild capacity, nothing will change.`,
    );
    if (accepted) balanceGuildMembersMutation.mutate();
  };
  const confirmRemoveGuild = (guild: (typeof guilds)[number]) => {
    const accepted = window.confirm(
      `Remove ${guild.name}? This deletes its shared guild record, members, level, XP, and treasury from the website and WhatsApp bot. Members' player accounts and items stay intact. A guild in an active war cannot be removed.`,
    );
    if (accepted) removeGuildMutation.mutate(guild.id);
  };

  return (
    <div className="guild-screen space-y-6">
      <div className="guild-hero relative overflow-hidden rounded-[2rem] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-14 -top-20 size-64 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
           <span className="guild-icon grid size-14 place-items-center overflow-hidden rounded-2xl">
             <img
               src={currentGuild?.bannerUrl || currentGuild?.iconUrl || heroArt}
               alt=""
               className="size-full object-cover"
             />
          </span>
          <div className="min-w-52 flex-1">
            <p className="font-mono-ui text-muted-foreground text-[10px] tracking-[0.24em] uppercase">Your guild standing</p>
            <p className="font-display text-2xl font-bold">{currentGuild?.name ?? "Unaffiliated"}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {currentGuild
                ? `Level ${currentGuild.level} · ${currentGuild.memberCount}/${currentGuild.memberCapacity} members · ${(currentGuild.taxRate * 100).toFixed(0)}% guild tax`
                : "Find a guild or charter a new anime crew."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowGuildWars(true)}
              className="glass glass-hover flex items-center gap-2 rounded-full px-4 py-2.5 text-[11px] font-semibold tracking-[0.14em] uppercase"
            >
              <Swords className="size-3.5" /> Guild wars
            </button>
            {currentGuild ? (
              <a
                href={GUILD_WEBSITE_URL}
                target="_blank"
                rel="noreferrer"
                className="glass glass-hover flex items-center gap-2 rounded-full px-4 py-2.5 text-[11px] font-semibold tracking-[0.14em] uppercase"
              >
                <ExternalLink className="size-3.5" /> Public guild
              </a>
            ) : null}
            {currentGuild ? (
              <button
                onClick={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}
                className="glass glass-hover hover:text-destructive flex items-center gap-2 rounded-full px-4 py-2.5 text-[11px] font-semibold tracking-[0.14em] uppercase disabled:opacity-50"
              >
                <LogOut className="size-3.5" /> Leave
              </button>
            ) : null}
            <button
              onClick={() => setCreating((value) => !value)}
              className="guild-action flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-bold tracking-[0.14em] uppercase transition-transform active:scale-[0.97]"
            >
              <Plus className="size-3.5" /> Charter guild
            </button>
          </div>
        </div>
      </div>

      {creating ? (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass overflow-hidden rounded-[2rem] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="guild-create-preview">
              <img src={form.bannerUrl.trim() || heroArt} alt="" />
            </span>
            <div>
              <h2 className="font-display text-xl font-bold">Charter an anime guild</h2>
               <p className="text-muted-foreground mt-1 text-sm">Costs {formatCoins(GUILD_CREATION_COST)}. Grow its XP and treasury through work on the bot.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Guild name" className="glass rounded-2xl px-4 py-3 text-sm outline-none" />
            <input value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value.toUpperCase() })} placeholder="TAG" maxLength={5} className="glass font-mono-ui rounded-2xl px-4 py-3 text-sm tracking-[0.2em] outline-none" />
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What is this guild about?" rows={3} className="glass resize-none rounded-2xl px-4 py-3 text-sm outline-none md:col-span-2" />
            <input value={form.bannerUrl} onChange={(event) => setForm({ ...form, bannerUrl: event.target.value })} placeholder="Guild background image URL (optional)" className="glass rounded-2xl px-4 py-3 text-sm outline-none md:col-span-2" />
          </div>
          <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="bg-gradient-brand text-foreground glow-pink mt-5 rounded-full px-8 py-3 text-[11px] font-bold tracking-[0.2em] uppercase transition-transform active:scale-[0.97] disabled:opacity-50">
            {createMutation.isPending ? "Chartering…" : "Create guild"}
          </button>
        </motion.div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono-ui text-muted-foreground text-[10px] tracking-[0.24em] uppercase">Guild hall</p>
          <h2 className="font-display mt-1 text-2xl font-bold">Find your constellation</h2>
        </div>
        <div className="flex items-center gap-2">
          {canManageGuilds && guilds.length > 1 ? (
            <button
              onClick={confirmBalanceGuilds}
              disabled={balanceGuildMembersMutation.isPending}
              className="glass glass-hover flex items-center gap-2 rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-wide disabled:opacity-50"
            >
              <Shuffle className="size-3.5" />
              {balanceGuildMembersMutation.isPending ? "Balancing…" : "Balance members"}
            </button>
          ) : null}
          <a href={GUILD_WEBSITE_URL} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground hidden items-center gap-2 text-xs sm:flex">
            <ExternalLink className="size-3.5" /> View guild portal
          </a>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {guildsQuery.isError && (
          <div className="glass col-span-full p-8 text-center">
            <p className="text-neon-pink text-sm font-bold">Failed to load guilds</p>
            <p className="text-muted-foreground mt-1 text-xs">{(guildsQuery.error as Error)?.message || "Internal server error"}</p>
            <button onClick={() => void guildsQuery.refetch()} className="mt-4 text-xs underline">Try again</button>
          </div>
        )}
        {guildsQuery.isLoading && (
          <div className="col-span-full py-12 text-center">
            <div className="border-brand-primary/30 border-t-brand-primary mx-auto size-8 animate-spin rounded-full border-4" />
            <p className="text-muted-foreground mt-4 text-xs">Scanning constellations...</p>
          </div>
        )}
        {!guildsQuery.isLoading && !guildsQuery.isError && (guildsQuery.data ?? []).length === 0 && (
          <div className="glass col-span-full p-12 text-center">
            <p className="text-muted-foreground text-sm">No guilds found. Be the first to charter one!</p>
          </div>
        )}
        {(guildsQuery.data ?? []).map((guild, index) => {
          const xpProgress = guild.guildXpRequired > 0 ? (guild.guildXp / guild.guildXpRequired) * 100 : 100;
          const treasuryProgress = guild.upgradeTreasuryRequired > 0 ? (guild.bank / guild.upgradeTreasuryRequired) * 100 : 100;
          const ready = guild.guildXp >= guild.guildXpRequired && guild.bank >= guild.upgradeTreasuryRequired && guild.memberCount >= guild.upgradeMembersRequired;
          const bannerUrl = guild.bannerUrl || guild.iconUrl;
          const expanded = expandedGuildId === guild.id;
          return (
            <motion.article
              key={guild.id}
              id={`guild-${guild.id}`}
              data-guild-id={guild.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.05 }}
              className={`guild-card relative flex flex-col overflow-hidden rounded-[2rem] ${guild.isMember ? "guild-card-member" : ""}`}
            >
                <button
                  type="button"
                  className="guild-card-summary"
                  aria-expanded={expanded}
                  onClick={() => setExpandedGuildId(expanded ? null : guild.id)}
                >
                <div className="guild-card-cover relative h-40 overflow-hidden">
                {bannerUrl ? (
                  <img
                    src={bannerUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-slate-950/5" />
                <div className="absolute inset-x-5 bottom-4 flex items-end justify-between gap-3">
                  <div className="flex min-w-0 items-end gap-3">
                    <span className="guild-tag-image">
                      {guild.iconUrl || bannerUrl
                        ? <img src={guild.iconUrl || bannerUrl || ""} alt="" loading="lazy" />
                        : <span>{guild.tag}</span>}
                    </span>
                    <div className="guild-card-summary-copy">
                      <div className="flex items-center gap-2">
                        <p className="guild-card-summary-name truncate">{guild.name}</p>
                        {guild.isOwner ? <Crown className="text-rarity-legend size-4 shrink-0" /> : null}
                      </div>
                      <p className="guild-card-summary-meta font-mono-ui uppercase tracking-[0.12em]">
                        Level {guild.level} · {guild.memberCount}/{guild.memberCapacity} members
                      </p>
                    </div>
                  </div>
                  <span className="guild-card-toggle" data-open={expanded} aria-hidden="true">
                    <ChevronDown className="size-4" />
                  </span>
                </div>
              </div>
              </button>

              <div className="guild-card-details relative flex flex-1 flex-col p-5" hidden={!expanded}>
                <div className="guild-ledger mb-4 grid grid-cols-2 gap-x-4 rounded-2xl px-4 py-2">
                  <span>Global rank</span><strong className="text-cyan-200">#{guild.globalRank || "—"}</strong>
                  <span>Leader</span><strong>{guild.members.find((member) => member.isOwner)?.name ?? "Guild leader"}</strong>
                  <span>Members</span><strong>{guild.memberCount}/{guild.memberCapacity}</strong>
                  <span>Total guild XP</span><strong>{guild.guildXp.toLocaleString()}</strong>
                  <span>Wars fought</span><strong>{guild.warsFought}</strong>
                  <span>Wars won</span><strong>{guild.warsWon}</strong>
                  <span>Founded</span><strong>{guild.foundedAt ? new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(guild.foundedAt)) : "—"}</strong>
                </div>
                <p className="min-h-10 flex-1 text-sm text-muted-foreground">
                  {guild.description || "A new constellation waiting for its first story."}
                </p>

                <div className="mt-5 space-y-3 rounded-2xl bg-background/20 p-4">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[11px]"><span className="flex items-center gap-1.5"><Star className="text-neon-pink size-3.5" /> Guild XP</span><span className="font-mono-ui text-muted-foreground">{guild.guildXp.toLocaleString()} / {guild.guildXpRequired.toLocaleString()}</span></div>
                    <ProgressBar value={xpProgress} />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[11px]"><span className="flex items-center gap-1.5"><Coins className="text-neon-pink size-3.5" /> Treasury</span><span className="font-mono-ui text-muted-foreground">{formatCoins(guild.bank)} / {formatCoins(guild.upgradeTreasuryRequired)}</span></div>
                    <ProgressBar value={treasuryProgress} tone="cyan" />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                  <span className="glass rounded-xl px-3 py-2">Next level <strong className="ml-1">{guild.level + 1}</strong></span>
                  <span className="glass rounded-xl px-3 py-2">Crew goal <strong className="ml-1">{guild.upgradeMembersRequired}</strong></span>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5 text-[11px] font-semibold"><Users className="size-3.5 text-cyan-300" /> Active roster</span><span className="text-muted-foreground text-[10px]">{guild.memberCount} members</span></div>
                  <div className="flex flex-wrap gap-2">
                    {guild.members.map((member) => (
                      <div key={member.id} className="guild-roster-row" title={member.name}>
                        <UserAvatar name={member.name} src={member.avatarUrl} videoSrc={member.avatarVideoUrl} className="size-9 border border-white/15" />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{member.name}</span>
                        <span className={`guild-role-badge ${member.isOwner ? "is-leader" : ""}`}>{member.isOwner ? "LEADER" : "MEMBER"}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {guild.isOwner && guild.pendingApplications.length > 0 ? (
                  <section className="guild-applications mt-5 space-y-2" aria-label="Guild applications">
                    <h3 className="text-xs font-bold text-cyan-200">Join applications · {guild.pendingApplications.length}</h3>
                    {guild.pendingApplications.map((application) => (
                      <div key={application.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2">
                        <span className="truncate text-xs">{application.applicantName}</span>
                        <div className="flex shrink-0 gap-2">
                          <button
                            onClick={() => reviewMutation.mutate({ applicationId: application.id, action: "approve" })}
                            disabled={reviewMutation.isPending}
                            className="guild-small-action"
                          >Approve</button>
                          <button
                            onClick={() => reviewMutation.mutate({ applicationId: application.id, action: "reject" })}
                            disabled={reviewMutation.isPending}
                            className="guild-small-action guild-small-muted"
                          >Decline</button>
                        </div>
                      </div>
                    ))}
                  </section>
                ) : null}

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="glass font-mono-ui flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px]"><Coins className="text-neon-pink size-3.5" /> {formatCoins(guild.bank)}</span>
                  {ready && guild.isOwner ? (
                    <button onClick={() => upgradeMutation.mutate()} disabled={upgradeMutation.isPending} className="text-emerald-200 hover:text-emerald-100 flex items-center gap-1 text-[10px] font-semibold transition-colors">
                      <ArrowUpCircle className="size-3.5" /> Upgrade
                    </button>
                  ) : ready ? (
                    <span className="text-emerald-200 flex items-center gap-1 text-[10px] font-semibold"><ArrowUpCircle className="size-3.5" /> Upgrade ready</span>
                  ) : (
                    <span className="text-muted-foreground text-[10px]">Reqs not met</span>
                  )}

                  {guild.isOwner && (
                    <button
                      onClick={() => {
                        setEditing(guild.id);
                        setEditForm({
                          description: guild.description,
                          iconUrl: guild.iconUrl || "",
                          bannerUrl: guild.bannerUrl || "",
                        });
                      }}
                      className="glass glass-hover rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase"
                    >
                      Settings
                    </button>
                  )}
                  {canManageGuilds ? (
                    <button
                      onClick={() => confirmRemoveGuild(guild)}
                      disabled={removeGuildMutation.isPending || balanceGuildMembersMutation.isPending}
                      className="glass glass-hover flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" /> Remove
                    </button>
                  ) : null}
                  <button
                    onClick={() => joinMutation.mutate(guild.id)}
                    disabled={guild.isMember || guild.applicationStatus === "pending" || joinMutation.isPending}
                    className="guild-action ml-auto rounded-full px-5 py-2 text-[11px] font-bold tracking-[0.14em] uppercase transition-transform active:scale-[0.97] disabled:opacity-45"
                  >
                    {joinMutation.isPending && joinMutation.variables === guild.id ? (
                      <span className="inline-flex items-center gap-2"><LoaderCircle className="size-3.5 animate-spin" /> Applying…</span>
                    ) : guild.isMember
                      ? "Member"
                      : guild.applicationStatus === "pending"
                        ? "Application pending"
                        : guild.applicationStatus === "rejected"
                          ? "Apply again"
                          : "Apply to join"}
                  </button>
                </div>

                {editing === guild.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="relative mt-4 space-y-3 border-t border-white/10 pt-4">
                    <input value={editForm.iconUrl} onChange={(e) => setEditForm({...editForm, iconUrl: e.target.value})} placeholder="Guild icon URL" className="glass w-full rounded-xl px-3 py-2 text-xs outline-none" />
                    <input value={editForm.bannerUrl} onChange={(e) => setEditForm({...editForm, bannerUrl: e.target.value})} placeholder="Guild banner image URL" className="glass w-full rounded-xl px-3 py-2 text-xs outline-none" />
                    <textarea value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} placeholder="Description" rows={2} className="glass w-full resize-none rounded-xl px-3 py-2 text-xs outline-none" />
                    <div className="flex gap-2">
                      <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 flex-1 rounded-xl py-2 text-[10px] font-bold uppercase transition-colors">Save</button>
                      <button onClick={() => setEditing(null)} className="glass flex-1 rounded-xl py-2 text-[10px] font-bold uppercase">Cancel</button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}
