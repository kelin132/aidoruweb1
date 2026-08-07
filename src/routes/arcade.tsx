import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import { Coins, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/aidoru/AppShell";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import { flipCoin, spinSlots } from "@/lib/aidoru.functions";
import { SLOT_SYMBOLS, formatCoins } from "@/lib/game";

export const Route = createFileRoute("/arcade")({
  head: () => ({
    meta: [
      { title: "Arcade — Slots and coin flip | AIDORU" },
      {
        name: "description",
        content:
          "Wager your Kelin-MD2 coins on weighted neon slots or a fifty-fifty coin flip, with instant balance updates.",
      },
      { property: "og:title", content: "Arcade — Slots and coin flip | AIDORU" },
      {
        property: "og:description",
        content: "Neon slots and coin flip with instant coin balance updates.",
      },
    ],
  }),
  component: ArcadePage,
});

const GLYPH = Object.fromEntries(SLOT_SYMBOLS.map((s) => [s.id, s.glyph])) as Record<string, string>;

function ArcadePage() {
  return (
    <AppShell title="Gambling & Arcade" subtitle="Weighted odds, instant payouts. Wager wisely.">
      <ArcadeBody />
    </AppShell>
  );
}

function ArcadeBody() {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const [wager, setWager] = useState(250);
  const [reels, setReels] = useState<string[]>(["ball", "star", "heart"]);
  const [spinning, setSpinning] = useState(false);
  const [flip, setFlip] = useState<"heads" | "tails">("heads");
  const [flipResult, setFlipResult] = useState<string | null>(null);

  const doSpin = useServerFn(spinSlots);
  const doFlip = useServerFn(flipCoin);

  const spin = useMutation({
    mutationFn: () => doSpin({ data: { wager } }),
    onMutate: () => setSpinning(true),
    onSuccess: (r) => {
      setTimeout(() => {
        setReels(r.reels);
        setSpinning(false);
        writeSession(r.user);
        if (r.delta > 0) {
          void confetti({ particleCount: 120, spread: 70, colors: ["#ff5fa2", "#7de3ff"] });
          toast.success(`x${r.multiplier} — won ${formatCoins(r.delta)} coins`);
        } else {
          toast.error(`Lost ${formatCoins(Math.abs(r.delta))} coins`);
        }
      }, 700);
    },
    onError: (e: Error) => {
      setSpinning(false);
      toast.error(e.message);
    },
  });

  const coinFlip = useMutation({
    mutationFn: () => doFlip({ data: { wager, pick: flip } }),
    onSuccess: (r) => {
      setFlipResult(r.result);
      writeSession(r.user);
      if (r.won) {
        void confetti({ particleCount: 90, spread: 60, colors: ["#b98bff", "#c8ffe8"] });
        toast.success(`${r.result} — won ${formatCoins(r.delta)} coins`);
      } else {
        toast.error(`${r.result} — lost ${formatCoins(Math.abs(r.delta))} coins`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="glass-strong flex flex-wrap items-center gap-4 rounded-3xl p-6">
        <div className="min-w-52 flex-1">
          <p className="font-mono-ui text-muted-foreground text-[10px] tracking-[0.24em] uppercase">
            Wager
          </p>
          <p className="font-display text-2xl font-bold">{formatCoins(wager)} coins</p>
        </div>
        <input
          type="range"
          min={50}
          max={Math.max(50, Math.min(100000, user.coins || 50))}
          step={50}
          value={Math.min(wager, Math.max(50, user.coins || 50))}
          onChange={(e) => setWager(Number(e.target.value))}
          className="accent-neon-pink w-full max-w-md"
        />
        <div className="flex gap-2">
          {[250, 1000, 5000].map((v) => (
            <button
              key={v}
              onClick={() => setWager(v)}
              className="glass glass-hover font-mono-ui rounded-full px-4 py-2 text-[11px]"
            >
              {formatCoins(v)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Slots */}
        <div className="glass relative overflow-hidden rounded-3xl p-7">
          <div className="bg-neon-purple/20 pointer-events-none absolute -top-20 -left-16 size-56 rounded-full blur-3xl" />
          <h2 className="font-display relative text-xl font-bold">Neon Slots</h2>
          <p className="text-muted-foreground relative mt-1 text-sm">
            Three of a kind pays up to x120. Two of a kind pays x1.5.
          </p>

          <div className="relative mt-6 grid grid-cols-3 gap-3">
            {reels.map((id, i) => (
              <motion.div
                key={i}
                animate={spinning ? { y: [0, -18, 0], opacity: [1, 0.35, 1] } : { y: 0, opacity: 1 }}
                transition={{
                  duration: 0.32,
                  repeat: spinning ? Infinity : 0,
                  delay: i * 0.08,
                }}
                className="glass-strong grid aspect-square place-items-center rounded-2xl"
              >
                <span className="text-gradient-brand font-display text-5xl font-bold">
                  {GLYPH[id] ?? "◉"}
                </span>
              </motion.div>
            ))}
          </div>

          <button
            onClick={() => spin.mutate()}
            disabled={spin.isPending || spinning}
            className="bg-gradient-brand text-foreground glow-pink font-display relative mt-6 w-full overflow-hidden rounded-full py-3.5 text-xs font-bold tracking-[0.24em] uppercase disabled:opacity-50"
          >
            <span className="animate-sheen absolute inset-y-0 -left-1/2 w-1/2 bg-white/20 blur-md" />
            {spinning ? "Spinning…" : "Spin"}
          </button>
        </div>

        {/* Coin flip */}
        <div className="glass relative overflow-hidden rounded-3xl p-7">
          <div className="bg-neon-cyan/20 pointer-events-none absolute -right-16 -bottom-20 size-56 rounded-full blur-3xl" />
          <h2 className="font-display relative text-xl font-bold">Coin Flip</h2>
          <p className="text-muted-foreground relative mt-1 text-sm">
            Straight fifty-fifty. Win and you double your wager.
          </p>

          <div className="relative mt-6 flex justify-center">
            <motion.span
              key={flipResult ?? "idle"}
              initial={{ rotateY: 0 }}
              animate={{ rotateY: flipResult ? 720 : 0 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="bg-gradient-brand glow-pink grid size-32 place-items-center rounded-full"
            >
              <CircleDollarSign className="size-14" />
            </motion.span>
          </div>
          <p className="font-mono-ui text-muted-foreground relative mt-3 text-center text-[11px] tracking-[0.24em] uppercase">
            {flipResult ? `Landed ${flipResult}` : "Awaiting toss"}
          </p>

          <div className="relative mt-6 grid grid-cols-2 gap-2">
            {(["heads", "tails"] as const).map((side) => (
              <button
                key={side}
                onClick={() => setFlip(side)}
                className={`font-display rounded-full py-2.5 text-[11px] tracking-[0.2em] uppercase transition-all ${
                  flip === side
                    ? "bg-gradient-brand text-foreground glow-cyan"
                    : "glass text-muted-foreground hover:text-foreground"
                }`}
              >
                {side}
              </button>
            ))}
          </div>

          <button
            onClick={() => coinFlip.mutate()}
            disabled={coinFlip.isPending}
            className="bg-gradient-brand text-foreground font-display mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-xs font-bold tracking-[0.24em] uppercase disabled:opacity-50"
          >
            <Coins className="size-4" />
            {coinFlip.isPending ? "Tossing…" : "Toss coin"}
          </button>
        </div>
      </div>
    </div>
  );
}
