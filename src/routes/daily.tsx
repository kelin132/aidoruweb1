import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import confetti from "canvas-confetti";
import { Check, Clock3, Coins, Gift, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import { claimWebsiteDailyReward } from "@/lib/aidoru.functions";
import { formatCoins, WEBSITE_DAILY_REWARD } from "@/lib/game";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const Route = createFileRoute("/daily")({
  head: () => ({
    meta: [
      { title: "Daily Bonus — AIDORU" },
      {
        name: "description",
        content: "Claim an extra daily coin reward on the AIDORU website.",
      },
    ],
  }),
  component: DailyBonusPage,
});

function DailyBonusPage() {
  return (
    <AppShell
      title="Daily Bonus"
      subtitle="You can collect more daily reward here, separate from your bot daily claim."
    >
      <DailyBonusBody />
    </AppShell>
  );
}

function DailyBonusBody() {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const claim = useServerFn(claimWebsiteDailyReward);
  const claimMutation = useMutation({
    mutationFn: () => claim(),
    onSuccess: (result) => {
      writeSession(result.user);
      void confetti({
        particleCount: 120,
        spread: 78,
        colors: ["#18e0e7", "#f8c84e", "#ff77d8"],
      });
      toast.success(`+${formatCoins(result.reward)} coins added to your wallet.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user) return null;

  const claimedAt = user.websiteDailyClaimedAt ? Date.parse(user.websiteDailyClaimedAt) : 0;
  const remainingMs = claimedAt ? Math.max(0, claimedAt + COOLDOWN_MS - Date.now()) : 0;
  const available = remainingMs === 0;
  const remainingHours = Math.floor(remainingMs / 3_600_000);
  const remainingMinutes = Math.ceil((remainingMs % 3_600_000) / 60_000);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_85%_10%,rgba(24,224,231,0.2),transparent_34%),radial-gradient(circle_at_5%_90%,rgba(255,119,216,0.16),transparent_38%),rgba(255,255,255,0.035)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.22)] sm:p-10">
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-3 text-cyan-200">
            <span className="grid size-12 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10">
              <Gift className="size-6" />
            </span>
            <span className="hof-kicker">AIDORU web reward</span>
          </div>
          <h2 className="hof-heading mt-6 text-4xl leading-none sm:text-6xl">
            More coins for your next adventure.
          </h2>
          <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
            Your bot daily and this website bonus have separate cooldowns. Come back every
            24 hours to keep your wallet moving.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => claimMutation.mutate()}
              disabled={!available || claimMutation.isPending}
              className="hof-button inline-flex items-center gap-2 px-6 py-3 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Coins className="size-4" />
              {claimMutation.isPending
                ? "Claiming…"
                : available
                  ? `Claim +${formatCoins(WEBSITE_DAILY_REWARD)}`
                  : "Already claimed"}
            </button>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-3 text-xs text-muted-foreground">
              {available ? (
                <>
                  <Sparkles className="size-4 text-amber-200" />
                  Ready for today
                </>
              ) : (
                <>
                  <Clock3 className="size-4 text-cyan-200" />
                  Next claim in {remainingHours}h {remainingMinutes}m
                </>
              )}
            </span>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-10 -top-16 size-64 rounded-full border border-cyan-200/15 bg-cyan-200/5 blur-[2px]" />
        <div className="pointer-events-none absolute -bottom-24 right-24 size-48 rounded-full border border-pink-200/10 bg-pink-200/5" />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <RewardCard icon={<Coins className="size-5" />} label="Extra reward" value={`+${formatCoins(WEBSITE_DAILY_REWARD)}`} />
        <RewardCard icon={<Clock3 className="size-5" />} label="Cooldown" value="24 hours" />
        <RewardCard icon={<Check className="size-5" />} label="Shared wallet" value={formatCoins(user.coins)} />
      </section>
    </div>
  );
}

function RewardCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-center gap-2 text-cyan-200">{icon}<span className="hof-label">{label}</span></div>
      <p className="hof-value mt-4 text-2xl">{value}</p>
    </div>
  );
}