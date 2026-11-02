import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Coins,
  Dices,
  Gamepad2,
  LoaderCircle,
  RotateCw,
  Spade,
  Target,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/aidoru/AppShell";
import { useSession, useSessionWriter } from "@/components/aidoru/session";
import {
  flipCoin,
  placeBet,
  spinRoulette,
  spinSlots,
  throwDice,
} from "@/lib/aidoru.functions";
import { formatCoins } from "@/lib/game";
import type { PublicUser } from "@/lib/game";

const MAX_WAGER = 5_000_000;
const SLOT_SYMBOLS = ["7", "BAR", "♦", "CHERRY", "BELL", "WILD", "LEMON", "ORANGE", "GRAPE"];
const SLOT_SYMBOL_LABELS: Record<string, string> = {
  "\u{1F352}": "CHERRY",
  "\u{1F34B}": "LEMON",
  "\u{1F34A}": "ORANGE",
  "\u{1F347}": "GRAPE",
  "\u{1F514}": "BELL",
  "\u{1F48E}": "♦",
  "\u0037\uFE0F\u20E3": "7",
  "\u{1F0CF}": "WILD",
};
const slotSymbolLabel = (symbol: string) => SLOT_SYMBOL_LABELS[symbol] ?? symbol;
const DICE_FACES: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
const ROULETTE_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const ROULETTE_RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROULETTE_SECTOR_SIZE = 360 / ROULETTE_ORDER.length;
const ROULETTE_WHEEL_BACKGROUND = `conic-gradient(${ROULETTE_ORDER.map((number, index) => {
  const color = number === 0 ? "#4d774e" : ROULETTE_RED_NUMBERS.has(number) ? "#8e3140" : "#25262a";
  return `${color} ${index * ROULETTE_SECTOR_SIZE}deg ${(index + 1) * ROULETTE_SECTOR_SIZE}deg`;
}).join(",")})`;

const GAMES = [
  { id: "slots", title: "Lucky slots", caption: "Three reels. One real result.", image: "/arcade/slots.gif", icon: RotateCw, minimum: 50 },
  { id: "bet", title: "High stakes", caption: "Take the house bet.", image: "/arcade/potion.jpg", icon: Target, minimum: 10 },
  { id: "coin", title: "Coin flip", caption: "Heads or tails. Call it.", image: "/arcade/card-coin.jpg", icon: Coins, minimum: 50 },
  { id: "roulette", title: "Roulette", caption: "Pick a color. Spin.", image: "/arcade/cash.jpg", icon: RotateCw, minimum: 100 },
  { id: "dice", title: "Lucky dice", caption: "Choose your number.", image: "/arcade/dice.jpg", icon: Dices, minimum: 50 },
] as const;

type GameId = (typeof GAMES)[number]["id"];
type GameResult = {
  user: PublicUser;
  delta: number;
  won: boolean;
  detail: string;
  outcome: {
    game: GameId;
    coin?: string;
    reels?: string[];
    roll?: number;
    rollColor?: string;
  };
};

export const Route = createFileRoute("/arcade")({
  head: () => ({
    meta: [
      { title: "Arcade — AIDORU" },
      { name: "description", content: "Play the AIDORU Arcade: slots, coin flip, roulette, dice, and more." },
      { property: "og:title", content: "Arcade — AIDORU" },
      { property: "og:description", content: "Five games. One wallet. Your call." },
    ],
  }),
  component: ArcadePage,
});

function ArcadePage() {
  const { data: user } = useSession();
  const writeSession = useSessionWriter();
  const callFlipCoin = useServerFn(flipCoin);
  const callSlots = useServerFn(spinSlots);
  const callBet = useServerFn(placeBet);
  const callDice = useServerFn(throwDice);
  const callRoulette = useServerFn(spinRoulette);
  const [selected, setSelected] = useState<GameId>("slots");
  const [wagerText, setWagerText] = useState("500");
  const [coinPick, setCoinPick] = useState<"heads" | "tails">("heads");
  const [diceGuess, setDiceGuess] = useState(4);
  const [rouletteColor, setRouletteColor] = useState<"red" | "black" | "green">("red");
  const [result, setResult] = useState<GameResult | null>(null);
  const [validation, setValidation] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  soundOnRef.current = soundOn;
  const audioContextRef = useRef<AudioContext | null>(null);
  const game = GAMES.find((entry) => entry.id === selected) ?? GAMES[0];
  const wager = Number(wagerText);

  useEffect(() => () => {
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close();
  }, []);

  const playSound = (kind: "tap" | "spin" | "win" | "loss", force = false) => {
    if ((!soundOnRef.current && !force) || typeof window === "undefined") return;
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const context = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = context;
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    const notes = kind === "win" ? [660, 880, 1046] : kind === "loss" ? [330, 246] : kind === "spin" ? [440, 330, 550] : [520];
    notes.forEach((frequency, index) => {
      const start = now + index * (kind === "spin" ? 0.075 : 0.11);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === "loss" ? "triangle" : "square";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.1);
    });
  };

  const play = useMutation({
    mutationFn: async (): Promise<GameResult> => {
      const common = { wager: Math.floor(wager) };
      if (selected === "coin") {
        const response = await callFlipCoin({ data: { ...common, pick: coinPick } });
        return {
          user: response.user,
          delta: response.delta,
          won: response.won,
          detail: `The coin landed ${response.result}. You called ${coinPick}.`,
          outcome: { game: "coin", coin: response.result },
        };
      }
      if (selected === "slots") {
        const response = await callSlots({ data: common });
        return {
          user: response.user,
          delta: response.delta,
          won: response.delta > 0,
          detail: `Reels: ${response.reels.map(slotSymbolLabel).join(" · ")}${response.multiplier ? ` · ${response.multiplier}× payout` : ""}`,
          outcome: { game: "slots", reels: response.reels },
        };
      }
      if (selected === "bet") {
        const response = await callBet({ data: common });
        return {
          user: response.user,
          delta: response.delta,
          won: response.won,
          detail: response.won ? "The house bet went your way." : "The house takes this round.",
          outcome: { game: "bet" },
        };
      }
      if (selected === "dice") {
        const response = await callDice({ data: { ...common, guess: diceGuess } });
        return {
          user: response.user,
          delta: response.delta,
          won: response.won,
          detail: `Your number: ${diceGuess} · The die rolled ${response.roll}.`,
          outcome: { game: "dice", roll: response.roll },
        };
      }
      const response = await callRoulette({ data: { ...common, color: rouletteColor } });
      return {
        user: response.user,
        delta: response.delta,
        won: response.won,
        detail: `The wheel landed ${response.rollColor} · ${response.roll}. You picked ${rouletteColor}.`,
        outcome: { game: "roulette", roll: response.roll, rollColor: response.rollColor },
      };
    },
    onSuccess: (gameResult) => {
      writeSession(gameResult.user);
      setResult(gameResult);
      playSound(gameResult.won ? "win" : "loss");
    },
  });

  const submit = () => {
    const minimum = game.minimum;
    if (!Number.isFinite(wager) || !Number.isInteger(wager) || wager < minimum) {
      setValidation(`Enter a whole-number wager of at least ${formatCoins(minimum)}.`);
      return;
    }
    if (wager > MAX_WAGER) {
      setValidation("Maximum wager is $5,000,000.");
      return;
    }
    if (wager > (user?.coins ?? 0)) {
      setValidation("Your wallet does not have enough coins for that wager.");
      return;
    }
    setValidation("");
    setResult(null);
    playSound("spin");
    play.mutate();
  };

  const changeGame = (id: GameId) => {
    if (play.isPending) return;
    setSelected(id);
    setResult(null);
    setValidation("");
  };

  const revealedReels = result?.outcome.game === "slots" ? result.outcome.reels ?? [] : [];
  const rouletteIndex = result?.outcome.game === "roulette" && typeof result.outcome.roll === "number"
    ? ROULETTE_ORDER.indexOf(result.outcome.roll)
    : -1;
  const rouletteAngle = rouletteIndex >= 0
    ? `${1080 + ((360 - (rouletteIndex + 0.5) * ROULETTE_SECTOR_SIZE) % 360)}deg`
    : "1080deg";

  return (
    <AppShell title="Arcade" hidePageHeading>
      <div className="arcade-page pb-12">
        <style>{`
          .arcade-page { --ink:#f7f0dc; --muted:#b9b09d; --line:rgba(246,224,171,.16); --panel:#18191d; --rose:#ef7585; --gold:#f0c663; color:var(--ink); }
          .arcade-page button { font:inherit; }
          .arcade-hero { position:relative; isolation:isolate; overflow:hidden; min-height:290px; display:grid; align-items:center; border:1px solid rgba(239,117,133,.34); border-radius:7px; background:linear-gradient(112deg,#21171e 0%,#212025 55%,#13171a 100%); box-shadow:0 22px 54px rgba(7,8,12,.3); }
          .arcade-hero:before { content:""; position:absolute; inset:0; z-index:-1; opacity:.12; background:linear-gradient(rgba(249,232,188,.13) 1px,transparent 1px),linear-gradient(90deg,rgba(249,232,188,.13) 1px,transparent 1px); background-size:26px 26px; mask-image:linear-gradient(90deg,black,transparent 92%); }
          .arcade-hero-copy { position:relative; z-index:1; max-width:650px; padding:clamp(24px,5vw,52px); }
          .arcade-eyebrow { display:inline-flex; align-items:center; gap:9px; color:#f2a1a3; font:700 10px/1.2 var(--font-mono); letter-spacing:.2em; text-transform:uppercase; }
          .arcade-hero h1 { margin:18px 0 0; font:900 clamp(42px,7vw,82px)/.9 var(--font-display); letter-spacing:-.065em; text-transform:uppercase; }
          .arcade-hero h1 span { color:#f48b91; }
          .arcade-hero-copy p { max-width:450px; margin:18px 0 0; color:#d0c6b3; font-size:14px; line-height:1.7; }
          .arcade-hero-image { position:absolute; z-index:-1; inset:0 0 0 auto; width:47%; opacity:.72; mask-image:linear-gradient(90deg,transparent 0%,black 42%); }
          .arcade-hero-image img { width:100%; height:100%; object-fit:cover; object-position:center 40%; image-rendering:pixelated; }
          .arcade-led { display:inline-block; width:7px; height:7px; border-radius:1px; background:#89e3b4; box-shadow:0 0 10px rgba(137,227,180,.45); }
          .arcade-hero-actions { position:absolute; right:18px; top:17px; z-index:2; display:flex; align-items:center; gap:8px; }
          .arcade-wallet,.arcade-sound { display:flex; min-height:38px; align-items:center; gap:9px; border:1px solid rgba(255,255,255,.15); border-radius:5px; background:rgba(13,14,17,.82); padding:8px 12px; backdrop-filter:blur(10px); }
          .arcade-wallet strong { color:#ffd674; font:700 12px var(--font-mono); }
          .arcade-sound { color:#f4e9ce; cursor:pointer; font-size:10px; font-weight:750; }
          .arcade-sound:hover { border-color:rgba(246,224,171,.44); }
          .arcade-label { margin:30px 0 13px; display:flex; align-items:end; justify-content:space-between; gap:12px; }
          .arcade-label h2 { margin:0; font:800 19px var(--font-display); letter-spacing:-.03em; }
          .arcade-label p { margin:0; color:var(--muted); font-size:12px; }
          .arcade-game-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; }
          .arcade-game { position:relative; min-width:0; overflow:hidden; border:1px solid var(--line); border-radius:5px; background:#191a1f; color:inherit; text-align:left; cursor:pointer; padding:0; transition:transform .18s ease,border-color .18s ease; }
          .arcade-game[aria-pressed="true"] { border-color:rgba(244,139,145,.82); box-shadow:inset 0 -2px 0 #ef7585; }
          .arcade-game:hover:not(:disabled) { transform:translateY(-3px); border-color:rgba(244,139,145,.57); }
          .arcade-game:disabled { cursor:wait; }
          .arcade-game-art { position:relative; height:96px; overflow:hidden; background:#252126; }
          .arcade-game-art:after { content:""; position:absolute; inset:35% 0 0; background:linear-gradient(transparent,rgba(17,17,20,.94)); }
          .arcade-game-art img { width:100%; height:100%; object-fit:cover; transition:transform 240ms ease; image-rendering:pixelated; }
          .arcade-game:hover .arcade-game-art img { transform:scale(1.05); }
          .arcade-game-icon { position:absolute; z-index:1; right:9px; top:9px; display:grid; place-items:center; width:28px; height:28px; border:1px solid rgba(255,255,255,.2); border-radius:4px; background:rgba(16,14,17,.75); color:#ffe0a3; }
          .arcade-game-copy { padding:10px 12px 12px; }
          .arcade-game-copy strong { display:block; font:750 12px var(--font-display); }
          .arcade-game-copy span { display:block; overflow:hidden; margin-top:4px; color:var(--muted); font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
          .arcade-layout { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(270px,.85fr); gap:14px; margin-top:18px; }
          .arcade-panel { border:1px solid var(--line); border-radius:6px; background:linear-gradient(145deg,rgba(31,30,34,.97),rgba(18,20,23,.98)); }
          .arcade-play-panel { overflow:hidden; }
          .arcade-stage { position:relative; min-height:270px; display:grid; place-items:center; overflow:hidden; background:radial-gradient(ellipse at 50% 74%,rgba(202,119,76,.13),transparent 50%),linear-gradient(140deg,#282023,#17191c); }
          .arcade-stage-tag { position:absolute; left:20px; top:18px; z-index:1; color:#e6a799; font:700 9px var(--font-mono); letter-spacing:.18em; text-transform:uppercase; }
          .arcade-machine { position:relative; width:min(76%,410px); min-height:190px; display:grid; place-items:center; overflow:hidden; border:1px solid rgba(241,190,113,.3); border-radius:5px; background:#1d1b1c; box-shadow:0 18px 40px rgba(0,0,0,.35),inset 0 0 30px rgba(224,129,91,.07); }
          .arcade-machine-art { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.26; image-rendering:pixelated; }
          .arcade-machine-shade { position:relative; z-index:1; width:100%; min-height:190px; display:grid; place-items:center; padding:28px 14px 16px; background:linear-gradient(90deg,rgba(17,14,16,.44),rgba(17,14,16,.08),rgba(17,14,16,.46)); }
          .arcade-reel-readout { display:flex; align-items:center; justify-content:center; gap:9px; }
          .arcade-reel-window { width:clamp(58px,8vw,82px); height:74px; overflow:hidden; border:3px solid #c28e48; border-radius:3px; background:#f2e1ad; box-shadow:0 0 0 2px #261d20,inset 0 0 0 3px rgba(48,39,40,.18); }
          .arcade-reel-track { display:flex; flex-direction:column; align-items:stretch; }
          .arcade-reel-symbol { height:72px; flex:none; display:grid; place-items:center; color:#32272b; font:900 clamp(18px,3vw,26px)/1 var(--font-mono); letter-spacing:-.06em; }
          .arcade-running .arcade-reel-track { animation:reel-scroll .42s linear infinite; }
          .arcade-running .arcade-reel-window:nth-child(2) .arcade-reel-track { animation-duration:.34s; }
          .arcade-running .arcade-reel-window:nth-child(3) .arcade-reel-track { animation-duration:.28s; }
          .arcade-reel-track.is-settling { transform:translateY(-72px); animation:reel-settle .55s cubic-bezier(.18,.75,.17,1) both; }
          .arcade-reel-window:nth-child(2) .is-settling { animation-delay:.14s; }
          .arcade-reel-window:nth-child(3) .is-settling { animation-delay:.28s; }
          @keyframes reel-scroll { to { transform:translateY(-72px); } }
          @keyframes reel-settle { from { transform:translateY(-16px); } to { transform:translateY(-72px); } }
          .arcade-coin { width:128px; height:128px; display:grid; place-items:center; border:7px double #f4ce71; border-radius:50%; background:linear-gradient(145deg,#f9df8b,#bd7b36); color:#49301e; font:900 30px var(--font-display); box-shadow:0 12px 0 #72492b,0 22px 30px rgba(0,0,0,.35),inset 0 0 0 6px rgba(255,248,199,.32); transform-style:preserve-3d; }
          .arcade-coin[data-side="tails"] { background:linear-gradient(145deg,#d1d5cc,#7f8d91); color:#263237; }
          .arcade-coin.is-pending { animation:coin-flip .38s linear infinite; }
          .arcade-coin.is-settling { animation:coin-land .9s cubic-bezier(.16,.7,.16,1) both; }
          @keyframes coin-flip { to { transform:rotateY(360deg) rotateX(16deg); } }
          @keyframes coin-land { 0% { transform:rotateY(0) translateY(-18px); } 72% { transform:rotateY(720deg) translateY(4px); } 100% { transform:rotateY(720deg) translateY(0); } }
          .arcade-roulette { position:relative; width:180px; height:180px; display:grid; place-items:center; }
          .arcade-roulette-pointer { position:absolute; z-index:2; top:-5px; left:calc(50% - 9px); width:0; height:0; border-left:9px solid transparent; border-right:9px solid transparent; border-top:19px solid #f4d475; filter:drop-shadow(0 2px 1px #171316); }
          .arcade-wheel { width:168px; aspect-ratio:1; display:grid; place-items:center; border:5px solid #d7ae67; border-radius:50%; background:conic-gradient(#4d774e 0deg 10deg,#8e3140 10deg 20deg,#25262a 20deg 30deg,#8e3140 30deg 40deg,#25262a 40deg 50deg,#8e3140 50deg 60deg,#25262a 60deg 70deg,#8e3140 70deg 80deg,#25262a 80deg 90deg,#8e3140 90deg 100deg,#25262a 100deg 110deg,#8e3140 110deg 120deg,#25262a 120deg 130deg,#8e3140 130deg 140deg,#25262a 140deg 150deg,#8e3140 150deg 160deg,#25262a 160deg 170deg,#8e3140 170deg 180deg,#25262a 180deg 190deg,#8e3140 190deg 200deg,#25262a 200deg 210deg,#8e3140 210deg 220deg,#25262a 220deg 230deg,#8e3140 230deg 240deg,#25262a 240deg 250deg,#8e3140 250deg 260deg,#25262a 260deg 270deg,#8e3140 270deg 280deg,#25262a 280deg 290deg,#8e3140 290deg 300deg,#25262a 300deg 310deg,#8e3140 310deg 320deg,#25262a 320deg 330deg,#8e3140 330deg 340deg,#25262a 340deg 350deg,#4d774e 350deg 360deg); box-shadow:0 9px 18px rgba(0,0,0,.36),inset 0 0 0 3px rgba(255,235,178,.25); }
          .arcade-running .arcade-wheel { animation:wheel-spin .35s linear infinite; }
          .arcade-wheel.is-settling { animation:wheel-stop 1.65s cubic-bezier(.12,.74,.12,1) both; }
          @keyframes wheel-spin { to { transform:rotate(360deg); } }
          @keyframes wheel-stop { from { transform:rotate(0); } to { transform:rotate(var(--wheel-angle)); } }
          .arcade-wheel-center { width:64px; height:64px; display:grid; place-items:center; border:3px solid #e3c278; border-radius:50%; background:#211e21; color:#f7e8c1; font:900 23px var(--font-mono); }
          .arcade-roulette-ball-track { position:absolute; inset:0; border-radius:50%; }
          .arcade-roulette-ball { position:absolute; top:7px; left:calc(50% - 5px); width:10px; height:10px; border:2px solid #fff4d8; border-radius:50%; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.65); }
          .arcade-running .arcade-roulette-ball-track { animation:wheel-spin .28s linear infinite reverse; }
          .arcade-roulette-ball-track.is-settling { animation:wheel-stop 1.65s cubic-bezier(.12,.74,.12,1) both; }
          .arcade-wheel-label { position:absolute; bottom:-24px; color:#d6c9ae; font:700 10px var(--font-mono); text-transform:uppercase; }
          .arcade-die { width:126px; height:126px; display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(3,1fr); gap:8px; padding:17px; border:2px solid #f0d69a; border-radius:20px; background:linear-gradient(145deg,#f8ebc9,#d6bc8e); box-shadow:0 10px 0 #86704f,0 20px 28px rgba(0,0,0,.35); }
          .arcade-die.is-pending { animation:die-tumble .42s ease-in-out infinite alternate; }
          .arcade-die.is-settling { animation:die-land .8s cubic-bezier(.2,.75,.18,1) both; }
          .arcade-die-dot { align-self:center; justify-self:center; width:14px; height:14px; border-radius:50%; background:#332b2b; opacity:0; }
          .arcade-die-dot.is-visible { opacity:1; }
          @keyframes die-tumble { to { transform:rotate(24deg) translateY(-5px); } }
          @keyframes die-land { 0% { transform:rotate(-70deg) translateY(-28px); } 70% { transform:rotate(12deg) translateY(4px); } 100% { transform:rotate(0) translateY(0); } }
          .arcade-bet-display { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:14px; width:min(90%,360px); }
          .arcade-bet-rail { height:2px; background:linear-gradient(90deg,transparent,#c89455,transparent); }
          .arcade-bet-plunger { width:112px; height:112px; display:grid; place-items:center; border:7px solid #5f3436; border-radius:50%; background:linear-gradient(145deg,#ed7b81,#a73648); color:#fff0d9; font:900 14px var(--font-display); letter-spacing:.08em; box-shadow:0 9px 0 #572d35,0 19px 26px rgba(0,0,0,.35),inset 0 0 0 4px rgba(255,219,184,.3); }
          .arcade-running .arcade-bet-plunger { animation:plunger .36s ease-in-out infinite alternate; }
          .arcade-bet-plunger.is-settling { animation:plunger-land .65s cubic-bezier(.16,.75,.2,1) both; }
          @keyframes plunger { to { transform:translateY(8px); box-shadow:0 2px 0 #572d35,0 10px 16px rgba(0,0,0,.35); } }
          @keyframes plunger-land { 0% { transform:translateY(12px) scale(.94); } 65% { transform:translateY(-4px) scale(1.03); } 100% { transform:translateY(0) scale(1); } }
          .arcade-bet-caption { position:absolute; bottom:23px; color:#d3c3a8; font:700 10px var(--font-mono); letter-spacing:.1em; text-transform:uppercase; }
          .arcade-controls { padding:20px; }
          .arcade-controls-heading { display:flex; align-items:center; gap:11px; }
          .arcade-controls-heading > span { display:grid; width:42px; height:42px; place-items:center; border:1px solid rgba(240,198,99,.27); border-radius:5px; background:rgba(194,142,72,.12); color:#f0c663; }
          .arcade-controls-heading h2 { margin:0; font:800 19px var(--font-display); }
          .arcade-controls-heading p { margin:3px 0 0; color:var(--muted); font-size:11px; }
          .arcade-field { display:block; margin-top:18px; color:#c9beab; font-size:11px; font-weight:650; }
          .arcade-input-wrap { display:flex; align-items:center; gap:10px; margin-top:8px; border:1px solid rgba(255,255,255,.15); border-radius:5px; background:rgba(8,10,12,.58); padding:0 13px; }
          .arcade-input-wrap > span { color:#f4ca70; font:700 14px var(--font-mono); }
          .arcade-input-wrap input { width:100%; min-width:0; height:46px; border:0; outline:none; background:transparent; color:#fff0d3; font:700 15px var(--font-mono); }
          .arcade-input-wrap:focus-within { border-color:#e9b95d; box-shadow:0 0 0 2px rgba(233,185,93,.16); }
          .arcade-helper { margin:7px 0 0; color:#a19889; font-size:10px; }
          .arcade-choice-row { display:flex; gap:8px; margin-top:12px; }
          .arcade-choice { flex:1; min-height:39px; border:1px solid rgba(255,255,255,.14); border-radius:4px; background:rgba(255,255,255,.035); color:#d5cbb9; font-size:11px; font-weight:700; cursor:pointer; }
          .arcade-choice[aria-pressed="true"] { border-color:rgba(247,192,108,.7); background:rgba(218,156,74,.14); color:#ffe1a6; }
          .arcade-choice:disabled { cursor:wait; }
          .arcade-play-button { display:flex; width:100%; min-height:48px; align-items:center; justify-content:center; gap:9px; margin-top:17px; border:1px solid #f0ce80; border-radius:5px; background:linear-gradient(105deg,#f4c875,#dd9c56); color:#261c19; font:850 12px var(--font-display); letter-spacing:.1em; text-transform:uppercase; box-shadow:0 5px 0 #8f5c37,0 9px 18px rgba(0,0,0,.2); cursor:pointer; transition:transform .14s ease,filter .14s ease; }
          .arcade-play-button:hover:not(:disabled) { filter:brightness(1.06); transform:translateY(-2px); }
          .arcade-play-button:active:not(:disabled) { transform:translateY(3px); box-shadow:0 2px 0 #8f5c37,0 5px 12px rgba(0,0,0,.2); }
          .arcade-play-button:disabled { opacity:.55; cursor:wait; }
          .arcade-alert { margin:10px 0 0; color:#ff9daf; font-size:11px; line-height:1.5; }
          .arcade-result { position:relative; overflow:hidden; margin-top:14px; padding:16px; border:1px solid rgba(137,227,180,.31); border-left:4px solid #87d9ac; border-radius:4px; background:linear-gradient(110deg,rgba(34,78,60,.3),rgba(30,33,31,.5)); animation:result-in .42s cubic-bezier(.16,.72,.2,1) both; }
          .arcade-result[data-won="false"] { border-color:rgba(255,146,170,.27); border-left-color:#ed7b8c; background:linear-gradient(110deg,rgba(88,43,51,.27),rgba(31,29,31,.5)); }
          @keyframes result-in { from { opacity:0; transform:translateY(12px) scale(.985); } to { opacity:1; transform:translateY(0) scale(1); } }
          .arcade-result-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
          .arcade-result-top strong { font:800 12px var(--font-display); }
          .arcade-result-top span { display:inline-flex; align-items:center; gap:4px; font:700 12px var(--font-mono); }
          .arcade-result[data-won="true"] .arcade-result-top span { color:#9cf1cb; }
          .arcade-result[data-won="false"] .arcade-result-top span { color:#ff9daf; }
          .arcade-result p { margin:8px 0 0; color:#d0c7b7; font-size:11px; line-height:1.55; }
          .arcade-side { padding:20px; }
          .arcade-side h3 { margin:0; font:800 14px var(--font-display); }
          .arcade-side-intro { margin:6px 0 16px; color:var(--muted); font-size:11px; line-height:1.6; }
          .arcade-rule { display:flex; gap:11px; padding:12px 0; border-top:1px solid rgba(255,255,255,.075); }
          .arcade-rule-icon { flex:none; color:#e5ae6b; }
          .arcade-rule strong { display:block; font-size:11px; }
          .arcade-rule span { display:block; margin-top:3px; color:#a49a89; font-size:10px; line-height:1.5; }
          .arcade-footnote { display:flex; gap:9px; margin-top:14px; padding:12px; border:1px solid rgba(255,212,120,.17); border-radius:4px; background:rgba(157,116,42,.08); color:#d3c39d; font-size:10px; line-height:1.5; }
          @media (max-width:860px) { .arcade-game-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } .arcade-layout { grid-template-columns:1fr; } .arcade-side { display:grid; grid-template-columns:1fr 1fr; gap:0 20px; } .arcade-side h3,.arcade-side-intro,.arcade-footnote { grid-column:1/-1; } }
          @media (max-width:560px) { .arcade-hero { min-height:280px; } .arcade-hero-copy { padding:75px 20px 24px; } .arcade-hero-image { width:80%; opacity:.4; } .arcade-hero-actions { top:12px; right:12px; gap:5px; } .arcade-wallet,.arcade-sound { min-height:34px; padding:7px 9px; } .arcade-wallet strong { font-size:10px; } .arcade-sound { font-size:9px; } .arcade-hero h1 { font-size:52px; } .arcade-label { align-items:start; flex-direction:column; } .arcade-game-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; } .arcade-game-art { height:86px; } .arcade-stage { min-height:230px; } .arcade-machine { width:88%; min-height:174px; } .arcade-machine-shade { min-height:174px; } .arcade-controls { padding:17px; } .arcade-side { display:block; } .arcade-reel-window { width:clamp(52px,18vw,70px); } .arcade-roulette { transform:scale(.9); } }
          @media (prefers-reduced-motion:reduce) { .arcade-page *, .arcade-page *:before, .arcade-page *:after { scroll-behavior:auto !important; animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; } .arcade-wheel.is-settling { transform:rotate(var(--wheel-angle)); } }
        `}</style>

        <header className="arcade-hero">
          <div className="arcade-hero-image" aria-hidden="true"><img src="/arcade/slot-machine.jpg" alt="" /></div>
          <div className="arcade-hero-actions">
            <div className="arcade-wallet" aria-label="Wallet balance">
              <CircleDollarSign className="size-4 text-amber-300" aria-hidden="true" />
              <strong>{formatCoins(user?.coins ?? 0)}</strong>
            </div>
            <button type="button" className="arcade-sound" aria-pressed={soundOn} aria-label={soundOn ? "Turn sound off" : "Turn sound on"} onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              if (next) playSound("tap", true);
            }}>
              <span>Sound {soundOn ? "on" : "off"}</span>
            </button>
          </div>
          <div className="arcade-hero-copy">
            <span className="arcade-eyebrow"><span className="arcade-led" /> AIDORU / ARCADE ROOM</span>
            <h1>Play your <span>luck.</span></h1>
            <p>Five quick games, one real wallet. Set your stake, make the call, and see the server’s result—no pretend spins.</p>
          </div>
        </header>

        <section aria-labelledby="choose-game-heading">
          <div className="arcade-label">
            <h2 id="choose-game-heading">Choose your game</h2>
            <p>Each round resolves on the server.</p>
          </div>
          <div className="arcade-game-grid" role="group" aria-label="Arcade games">
            {GAMES.map(({ id, title, caption, image, icon: Icon }) => (
              <button key={id} type="button" className="arcade-game" aria-pressed={selected === id} onClick={() => changeGame(id)} disabled={play.isPending}>
                <div className="arcade-game-art"><img src={image} alt="" loading="lazy" /><span className="arcade-game-icon"><Icon className="size-4" aria-hidden="true" /></span></div>
                <div className="arcade-game-copy"><strong>{title}</strong><span>{caption}</span></div>
              </button>
            ))}
          </div>
        </section>

        <div className="arcade-layout">
          <section className="arcade-panel arcade-play-panel" aria-label={`${game.title} game controls`}>
            <div className={`arcade-stage ${play.isPending ? "arcade-running" : ""}`} aria-live="polite" aria-label={play.isPending ? `Playing ${game.title}` : "Game display"}>
              <span className="arcade-stage-tag">LIVE GAME / {selected.toUpperCase()}</span>
              <div className="arcade-machine">
                <img className="arcade-machine-art" src={game.image} alt="" />
                <div className="arcade-machine-shade">
                  {selected === "slots" && (
                    <div className="arcade-reel-readout" aria-label={play.isPending ? "Slot reels spinning" : result?.outcome.game === "slots" ? `Reels show ${revealedReels.map(slotSymbolLabel).join(", ")}` : "Three slot reels ready"}>
                      {[0, 1, 2].map((index) => {
                        const symbol = revealedReels[index] ?? SLOT_SYMBOLS[index];
                        const symbols = result?.outcome.game === "slots"
                          ? [SLOT_SYMBOLS[(index + 2) % SLOT_SYMBOLS.length], symbol, SLOT_SYMBOLS[(index + 1) % SLOT_SYMBOLS.length]]
                          : [...SLOT_SYMBOLS, ...SLOT_SYMBOLS];
                        return <div className="arcade-reel-window" key={index}>
                          <div className={`arcade-reel-track ${result?.outcome.game === "slots" && !play.isPending ? "is-settling" : ""}`}>
                            {symbols.map((face, faceIndex) => {
                              const label = slotSymbolLabel(face);
                              return <span className="arcade-reel-symbol" data-symbol={label === "♦" ? "DIAMOND" : label} key={`${index}-${faceIndex}`}>{label}</span>;
                            })}
                          </div>
                        </div>;
                      })}
                    </div>
                  )}
                  {selected === "coin" && (() => {
                    const side = result?.outcome.game === "coin" ? result.outcome.coin : undefined;
                    return <div className={`arcade-coin ${play.isPending ? "is-pending" : side ? "is-settling" : ""}`} data-side={side} aria-label={side ? `Coin landed ${side}` : "Coin ready"}>{side ? side.toUpperCase() : "?"}</div>;
                  })()}
                  {selected === "roulette" && (() => {
                    const rouletteResult = result?.outcome.game === "roulette" ? result.outcome : null;
                    return <div className="arcade-roulette" aria-label={rouletteResult ? `Roulette landed ${rouletteResult.rollColor} ${rouletteResult.roll}` : "Roulette wheel ready"}>
                      <span className="arcade-roulette-pointer" />
                      <div className={`arcade-wheel ${play.isPending ? "" : rouletteResult ? "is-settling" : ""}`} style={{ "--wheel-angle": rouletteAngle, background: ROULETTE_WHEEL_BACKGROUND } as CSSProperties}>
                        <div className="arcade-wheel-center">{typeof rouletteResult?.roll === "number" ? rouletteResult.roll : "GO"}</div>
                        <div className={`arcade-roulette-ball-track ${!play.isPending && rouletteResult ? "is-settling" : ""}`} style={{ "--wheel-angle": rouletteAngle } as CSSProperties}><span className="arcade-roulette-ball" /></div>
                      </div>
                      <span className="arcade-wheel-label">{rouletteResult?.rollColor ?? "Place your bet"}</span>
                    </div>;
                  })()}
                  {selected === "dice" && (() => {
                    const roll = result?.outcome.game === "dice" ? result.outcome.roll : undefined;
                    return <div className={`arcade-die ${play.isPending ? "is-pending" : roll ? "is-settling" : ""}`} aria-label={roll ? `Die rolled ${roll}` : "Die ready"}>
                      {Array.from({ length: 9 }, (_, index) => <span key={index} className={`arcade-die-dot ${roll && DICE_FACES[roll]?.includes(index) ? "is-visible" : ""}`} />)}
                    </div>;
                  })()}
                  {selected === "bet" && <div className="arcade-bet-display" aria-label={result?.outcome.game === "bet" ? result.won ? "House bet won" : "House bet lost" : "House bet ready"}>
                    <span className="arcade-bet-rail" />
                    <div className={`arcade-bet-plunger ${play.isPending ? "" : result?.outcome.game === "bet" ? "is-settling" : ""}`}>{play.isPending ? "LIVE" : result?.outcome.game === "bet" ? result.won ? "WIN" : "MISS" : "HOUSE"}</div>
                    <span className="arcade-bet-rail" />
                    <span className="arcade-bet-caption">{play.isPending ? "House round in play" : result?.outcome.game === "bet" ? result.detail : "Stake set · awaiting round"}</span>
                  </div>}
                </div>
              </div>
            </div>
            <div className="arcade-controls">
              <div className="arcade-controls-heading">
                <span><game.icon className="size-5" aria-hidden="true" /></span>
                <div><h2>{game.title}</h2><p>{game.caption}</p></div>
              </div>
              <label className="arcade-field" htmlFor="arcade-wager">Wager</label>
              <div className="arcade-input-wrap">
                <span>$</span>
                <input id="arcade-wager" inputMode="numeric" type="number" min={game.minimum} max={MAX_WAGER} step="1" value={wagerText} onChange={(event) => { setWagerText(event.target.value); setValidation(""); }} aria-describedby="arcade-wager-help" aria-invalid={Boolean(validation)} disabled={play.isPending} />
              </div>
              <p className="arcade-helper" id="arcade-wager-help">Min {formatCoins(game.minimum)} · Max {formatCoins(MAX_WAGER)} · Wallet {formatCoins(user?.coins ?? 0)}</p>
              {selected === "coin" && <div className="arcade-choice-row" role="group" aria-label="Choose coin side">{(["heads", "tails"] as const).map((pick) => <button key={pick} type="button" className="arcade-choice" aria-pressed={coinPick === pick} onClick={() => setCoinPick(pick)} disabled={play.isPending}>{pick === "heads" ? "Heads" : "Tails"}</button>)}</div>}
              {selected === "dice" && <div className="arcade-choice-row" role="group" aria-label="Choose dice number">{[1, 2, 3, 4, 5, 6].map((number) => <button key={number} type="button" className="arcade-choice" aria-pressed={diceGuess === number} onClick={() => setDiceGuess(number)} disabled={play.isPending}>{number}</button>)}</div>}
              {selected === "roulette" && <div className="arcade-choice-row" role="group" aria-label="Choose roulette color">{(["red", "black", "green"] as const).map((color) => <button key={color} type="button" className="arcade-choice" aria-pressed={rouletteColor === color} onClick={() => setRouletteColor(color)} disabled={play.isPending}>{color[0].toUpperCase() + color.slice(1)}</button>)}</div>}
              <button type="button" className="arcade-play-button" onClick={submit} disabled={play.isPending || !user}>
                {play.isPending ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Settling round…</> : <><Zap className="size-4" aria-hidden="true" /> Play for {formatCoins(Number.isFinite(wager) ? wager : 0)}</>}
              </button>
              {validation && <p className="arcade-alert" role="alert">{validation}</p>}
              {play.isError && <p className="arcade-alert" role="alert">The round could not be completed: {play.error instanceof Error ? play.error.message : "Please try again."}</p>}
              {!user && <p className="arcade-alert" role="status">Loading your signed-in wallet…</p>}
              {result && !play.isPending && <div className="arcade-result" data-won={result.won} role="status" aria-live="polite">
                <div className="arcade-result-top"><strong>{result.won ? "Round won" : "Round complete"}</strong><span>{result.delta >= 0 ? <ArrowUpRight className="size-4" aria-hidden="true" /> : <ArrowDownRight className="size-4" aria-hidden="true" />}{formatCoins(Math.abs(result.delta))}</span></div>
                <p>{result.detail} · Wallet now {formatCoins(result.user.coins)}.</p>
              </div>}
            </div>
          </section>

          <aside className="arcade-panel arcade-side" aria-label="How arcade games work">
            <h3>Play fair. Play sharp.</h3>
            <p className="arcade-side-intro">Every wager is sent to AIDORU and every outcome comes back from the game server.</p>
            <div className="arcade-rule"><Gamepad2 className="arcade-rule-icon size-4" aria-hidden="true" /><div><strong>One active round</strong><span>Controls lock while a game is resolving, so a double tap cannot submit twice.</span></div></div>
            <div className="arcade-rule"><Coins className="arcade-rule-icon size-4" aria-hidden="true" /><div><strong>Honest wallet updates</strong><span>Your balance changes only after a successful server result.</span></div></div>
            <div className="arcade-rule"><Spade className="arcade-rule-icon size-4" aria-hidden="true" /><div><strong>Your choice, your stake</strong><span>Pick a side, number, or color where the game offers one.</span></div></div>
            <div className="arcade-footnote"><Zap className="size-4 shrink-0 text-amber-300" aria-hidden="true" /><span>Wagers are whole numbers up to $5,000,000. Only play with coins you’re comfortable risking.</span></div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
