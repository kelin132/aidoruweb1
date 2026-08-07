import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import { Gift, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { Sprite } from "@/components/aidoru/Sprite";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import { claimDailyReward, pickStarter } from "@/lib/aidoru.functions";
import { DAILY_BASE_REWARD, STARTERS, formatCoins } from "@/lib/game";

export const Route = createFileRoute("/journey")({
  head: () => ({
    meta: [
      { title: "Start Journey — Pick your AIDORU starter" },
      {
        name: "description",
        content:
          "Choose Volt-Kitsune, Aqua-Lumi or Ember-Ryu as your starter partner and claim your daily streak reward.",
      },
      { property: "og:title", content: "Start Journey — Pick your AIDORU starter" },
      {
        property: "og:description",
        content: "Choose your starter partner and claim daily streak rewards in AIDORU.",
      },
    ],
  }),
  component: JourneyPage,
});

function burst() {
  void confetti({
    particleCount: 140,
    spread: 78,
    origin: { y: 0.62 },
    colors: ["#ff5fa2", "#7de3ff", "#b98bff", "#c8ffe8"],
  });
}

function JourneyPage() {
  return (
    <AppShell
      title="Start Journey"
      subtitle="Bond with a partner, then keep your streak burning every day."
    >
      <JourneyBody />
    </AppShell>
  );
}

function JourneyBody() {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const [selected, setSelected] = useState<string | null>(null);

  const choose = useServerFn(pickStarter);
  const claim = useServerFn(claimDailyReward);

  const chooseMutation = useMutation({
    mutationFn: (starterId: string) => choose({ data: { starterId } }),
    onSuccess: (updated) => {
      writeSession(updated);
      burst();
      toast.success("Partner bonded! +150 XP");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const claimMutation = useMutation({
    mutationFn: () => claim(),
    onSuccess: (result) => {
      writeSession(result.user);
      burst();
      toast.success(`+${formatCoins(result.reward)} coins · ${result.streak} day streak`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) return null;
  const locked = user.starterChosen;

  return (
    <div className="space-y-8">
      {/* Daily */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong relative flex flex-wrap items-center gap-6 overflow-hidden rounded-3xl p-7"
      >
        <div className="bg-neon-pink/20 pointer-events-none absolute -top-24 -right-16 size-64 rounded-full blur-3xl" />
        <span className="bg-gradient-brand glow-pink grid size-16 shrink-0 place-items-center rounded-full">
          <Gift className="size-7" />
        </span>
        <div className="relative min-w-56 flex-1">
          <h2 className="font-display text-2xl font-bold">Daily streak</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {formatCoins(DAILY_BASE_REWARD)} coins base, plus 75 per streak day (capped at 14).
            Current streak: <span className="text-neon-cyan font-semibold">{user.streak}</span>.
          </p>
        </div>
        <button
          onClick={() => claimMutation.mutate()}
          disabled={claimMutation.isPending}
          className="bg-gradient-brand text-foreground glow-pink font-display relative overflow-hidden rounded-full px-8 py-3.5 text-xs font-bold tracking-[0.2em] uppercase transition-transform hover:scale-105 disabled:opacity-60"
        >
          <span className="animate-sheen absolute inset-y-0 -left-1/2 w-1/2 bg-white/25 blur-md" />
          {claimMutation.isPending ? "Claiming…" : "Claim reward"}
        </button>
      </motion.div>

      {/* Starters */}
      <div>
        <h2 className="font-display flex items-center gap-2 text-xl font-bold">
          <Sparkles className="text-neon-cyan size-5" />
          {locked ? "Your partner" : "Choose your starter"}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {locked
            ? "This bond is permanent — your partner grows with every level you gain."
            : "One choice, one bond. Pick the partner that matches how you play."}
        </p>

        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {STARTERS.map((starter, i) => {
            const isMine = user.starter === starter.id;
            const dimmed = locked && !isMine;
            const active = selected === starter.id;

            return (
              <motion.button
                key={starter.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: dimmed ? 0.4 : 1, y: 0 }}
                transition={{ duration: 0.45, delay: i * 0.1 }}
                onClick={() => !locked && setSelected(starter.id)}
                disabled={locked}
                className={`glass glass-hover relative overflow-hidden rounded-3xl p-6 text-left ${
                  active || isMine ? "border-neon-pink/60 glow-pink" : ""
                } ${locked ? "cursor-default" : ""}`}
              >
                {isMine && (
                  <span className="bg-gradient-brand absolute top-4 right-4 grid size-7 place-items-center rounded-full">
                    <Check className="size-4" />
                  </span>
                )}
                <div className="relative flex justify-center">
                  <span className="bg-gradient-halo absolute top-4 size-28 rounded-full opacity-25 blur-2xl" />
                  <Sprite
                    name={starter.sprite}
                    alt={starter.name}
                    className="animate-float-soft relative size-36"
                  />
                </div>
                <p className="font-display mt-4 text-xl font-bold">{starter.name}</p>
                <p className="font-mono-ui text-neon-cyan mt-1 text-[10px] tracking-[0.22em] uppercase">
                  {starter.type} · {starter.focus}
                </p>
                <p className="text-muted-foreground mt-3 text-sm">{starter.blurb}</p>
              </motion.button>
            );
          })}
        </div>

        {!locked && (
          <button
            onClick={() => selected && chooseMutation.mutate(selected)}
            disabled={!selected || chooseMutation.isPending}
            className="bg-gradient-brand text-foreground font-display glow-pink mx-auto mt-8 block rounded-full px-12 py-4 text-xs font-bold tracking-[0.24em] uppercase transition-transform hover:scale-105 disabled:opacity-40"
          >
            {chooseMutation.isPending ? "Bonding…" : "Confirm partner"}
          </button>
        )}
      </div>
    </div>
  );
}
