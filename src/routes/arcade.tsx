import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import { Coins, Dice5, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import { flipCoin, placeBet, spinSlots } from "@/lib/aidoru.functions";
import { formatCoins } from "@/lib/game";

export const Route = createFileRoute("/arcade")({
  head: () => ({
    meta: [
      { title: "Arcade — AIDORU" },
      {
        name: "description",
        content: "Play the same virtual-coin arcade games as the AIDORU bot.",
      },
    ],
  }),
  component: ArcadePage,
});

function ArcadePage() {
  return (
    <AppShell
      title="Arcade & Odds"
      subtitle="The same virtual-coin games, wager limits, and cooldowns as your bot account."
    >
      <ArcadeBody />
    </AppShell>
  );
}

function ArcadeBody() {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const [wager, setWager] = useState(250);
  const [reels, setReels] = useState<string[]>(["🍒", "🍋", "💎"]);
  const [spinning, setSpinning] = useState(false);
  const [flip, setFlip] = useState<"heads" | "tails">("heads");
  const [flipResult, setFlipResult] = useState<string | null>(null);

  const doSpin = useServerFn(spinSlots);
  const doFlip = useServerFn(flipCoin);
  const doBet = useServerFn(placeBet);

  const spin = useMutation({
    mutationFn: () => doSpin({ data: { wager: Math.max(50, wager) } }),
    onMutate: () => setSpinning(true),
    onSuccess: (result) => {
      setTimeout(() => {
        setReels(result.reels);
        setSpinning(false);
        writeSession(result.user);
        if (result.delta > 0) {
          void confetti({ particleCount: 100, spread: 70, colors: ["#18e0e7", "#f8c84e"] });
          toast.success(`x${result.multiplier} payout · +${formatCoins(result.delta)} coins`);
        } else toast.error(`Slots result · ${formatCoins(Math.abs(result.delta))} coins`);
      }, 650);
    },
    onError: (error: Error) => {
      setSpinning(false);
      toast.error(error.message);
    },
  });

  const coinFlip = useMutation({
    mutationFn: () => doFlip({ data: { wager: Math.max(10, wager), pick: flip } }),
    onSuccess: (result) => {
      setFlipResult(result.result);
      writeSession(result.user);
      if (result.won) {
        void confetti({ particleCount: 80, spread: 60, colors: ["#18e0e7", "#d8f7ff"] });
        toast.success(`${result.result} · +${formatCoins(result.delta)} coins`);
      } else toast.error(`${result.result} · ${formatCoins(Math.abs(result.delta))} coins`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bet = useMutation({
    mutationFn: () => doBet({ data: { wager: Math.max(10, wager) } }),
    onSuccess: (result) => {
      writeSession(result.user);
      result.won
        ? toast.success(`Lucky bet · +${formatCoins(result.delta)} coins`)
        : toast.error(`Bet lost · ${formatCoins(Math.abs(result.delta))} coins`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!user) return null;
  const maxWager = Math.max(50, Math.min(50_000, user.coins || 50));
  const safeWager = Math.min(wager, maxWager);

  return (
    <div className="space-y-6 pb-10">
      <div className="hof-panel flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <div className="min-w-52 flex-1">
          <p className="hof-kicker">Virtual coin wager</p>
          <p className="hof-heading mt-1 text-3xl">{formatCoins(safeWager)} coins</p>
        </div>
        <input
          type="range"
          min={10}
          max={maxWager}
          step={10}
          value={safeWager}
          onChange={(event) => setWager(Number(event.target.value))}
          className="w-full accent-cyan-300 sm:max-w-md"
        />
        <div className="flex gap-2">
          {[250, 1000, 5000].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setWager(Math.min(value, maxWager))}
              className="hof-tab px-3 py-2 font-mono-ui text-[10px]"
            >
              {formatCoins(Math.min(value, maxWager))}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="hof-panel p-6">
          <p className="hof-kicker">Bot-matched game</p>
          <h2 className="hof-heading mt-1 text-3xl">Slots</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Weighted reels with the same payout table as the bot.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {reels.map((symbol, index) => (
              <motion.div
                key={`${symbol}-${index}`}
                animate={
                  spinning ? { y: [0, -14, 0], opacity: [1, 0.35, 1] } : { y: 0, opacity: 1 }
                }
                transition={{ duration: 0.3, repeat: spinning ? Infinity : 0 }}
                className="hof-image grid aspect-square place-items-center rounded-2xl text-4xl"
              >
                {symbol}
              </motion.div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => spin.mutate()}
            disabled={spin.isPending || spinning}
            className="hof-button mt-6 w-full"
          >
            {spinning ? "Spinning…" : "Spin slots"}
          </button>
        </div>

        <div className="hof-panel p-6">
          <p className="hof-kicker">Bot-matched game</p>
          <h2 className="hof-heading mt-1 text-3xl">Coinflip</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a side, then risk your wallet coins.
          </p>
          <div className="mt-8 flex justify-center">
            <motion.div
              key={flipResult ?? "idle"}
              animate={{ rotateY: flipResult ? 720 : 0 }}
              transition={{ duration: 0.8 }}
              className="grid size-28 place-items-center rounded-full border border-cyan-300/50 bg-cyan-300/10 text-cyan-200"
            >
              <Coins className="size-12" />
            </motion.div>
          </div>
          <p className="mt-4 text-center font-mono-ui text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
            {flipResult ? `Landed ${flipResult}` : "Awaiting toss"}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {(["heads", "tails"] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setFlip(side)}
                className={`hof-tab px-3 py-3 font-display text-lg ${flip === side ? "is-active" : ""}`}
              >
                {side}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => coinFlip.mutate()}
            disabled={coinFlip.isPending}
            className="hof-button mt-4 w-full"
          >
            {coinFlip.isPending ? "Tossing…" : "Toss coin"}
          </button>
        </div>

        <div className="hof-panel p-6">
          <p className="hof-kicker">Risk / reward</p>
          <h2 className="hof-heading mt-1 text-3xl">Lucky bet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A short-cooldown wager using your live bot wallet.
          </p>
          <div className="mt-8 grid place-items-center">
            <div className="grid size-28 place-items-center rounded-full border border-amber-300/50 bg-amber-300/10 text-amber-200">
              <Dice5 className="size-12" />
            </div>
          </div>
          <p className="mt-5 text-center font-mono-ui text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            53% virtual-coin chance
          </p>
          <button
            type="button"
            onClick={() => bet.mutate()}
            disabled={bet.isPending}
            className="hof-button mt-10 w-full"
          >
            {bet.isPending ? "Rolling…" : "Place bet"}
          </button>
        </div>
      </div>

      <div className="hof-panel flex gap-3 p-5 text-sm text-muted-foreground">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-cyan-300" />
        <p>
          These are in-game coins only. There is no cash deposit, cash-out, or real-money wagering.
          Your balance is the same wallet used by AIDORU in WhatsApp.
        </p>
      </div>
    </div>
  );
}
