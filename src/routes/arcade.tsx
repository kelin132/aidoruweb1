import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Coins,
  Dices,
  Gamepad2,
  LoaderCircle,
  RotateCw,
  Sparkles,
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

const GAMES = [
  { id: "slots", title: "Lucky slots", caption: "Line up a little luck.", image: "/arcade/slots.gif", icon: Sparkles, accent: "pink", minimum: 50 },
  { id: "bet", title: "High stakes", caption: "Take the house bet.", image: "/arcade/potion.jpg", icon: Target, accent: "gold", minimum: 10 },
  { id: "coin", title: "Coin flip", caption: "Heads or tails. Call it.", image: "/arcade/card-coin.jpg", icon: Coins, accent: "cyan", minimum: 50 },
  { id: "roulette", title: "Roulette", caption: "Pick a color. Spin.", image: "/arcade/cash.jpg", icon: RotateCw, accent: "rose", minimum: 100 },
  { id: "dice", title: "Lucky dice", caption: "Choose your number.", image: "/arcade/dice.jpg", icon: Dices, accent: "violet", minimum: 50 },
] as const;

type GameId = (typeof GAMES)[number]["id"];
type GameResult = { user: PublicUser; delta: number; won: boolean; detail: string };

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
  const game = GAMES.find((entry) => entry.id === selected) ?? GAMES[0];
  const wager = Number(wagerText);

  const play = useMutation({
    mutationFn: async (): Promise<GameResult> => {
      const common = { wager: Math.floor(wager) };
      if (selected === "coin") {
        const response = await callFlipCoin({ data: { ...common, pick: coinPick } });
        return { user: response.user, delta: response.delta, won: response.won, detail: `The coin landed ${response.result}. You called ${coinPick}.` };
      }
      if (selected === "slots") {
        const response = await callSlots({ data: common });
        return { user: response.user, delta: response.delta, won: response.delta > 0, detail: `Reels: ${response.reels.join(" · ")}${response.multiplier ? ` · ${response.multiplier}× payout` : ""}` };
      }
      if (selected === "bet") {
        const response = await callBet({ data: common });
        return { user: response.user, delta: response.delta, won: response.won, detail: response.won ? "The house bet went your way." : "The house takes this round." };
      }
      if (selected === "dice") {
        const response = await callDice({ data: { ...common, guess: diceGuess } });
        return { user: response.user, delta: response.delta, won: response.won, detail: `Your number: ${diceGuess} · The die rolled ${response.roll}.` };
      }
      const response = await callRoulette({ data: { ...common, color: rouletteColor } });
      return { user: response.user, delta: response.delta, won: response.won, detail: `The wheel landed ${response.rollColor} · ${response.roll}. You picked ${rouletteColor}.` };
    },
    onSuccess: async (gameResult) => {
      writeSession(gameResult.user);
      setResult(gameResult);
      await new Promise((resolve) => window.setTimeout(resolve, 520));
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
    play.mutate();
  };

  const changeGame = (id: GameId) => {
    if (play.isPending) return;
    setSelected(id);
    setResult(null);
    setValidation("");
  };

  return (
    <AppShell title="Arcade" hidePageHeading>
      <div className="arcade-page pb-12">
        <style>{`
          .arcade-page { --arcade-ink: #f4f1f7; --arcade-muted: #a7a1b4; --arcade-line: rgba(236,224,255,.12); color: var(--arcade-ink); }
          .arcade-hero { position:relative; isolation:isolate; overflow:hidden; min-height:310px; display:grid; grid-template-columns:minmax(0,1.1fr) minmax(260px,.9fr); align-items:center; border:1px solid rgba(242,116,187,.22); border-radius:26px; background:radial-gradient(ellipse at 72% 48%,rgba(214,71,142,.19),transparent 36%),linear-gradient(120deg,#18101f 0%,#111521 60%,#171522 100%); box-shadow:0 24px 70px rgba(0,0,0,.28); }
          .arcade-hero:before { content:""; position:absolute; inset:0; z-index:-1; opacity:.17; background-image:linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px); background-size:34px 34px; mask-image:linear-gradient(90deg,black,transparent 92%); }
          .arcade-hero-copy { padding:clamp(24px,5vw,52px); }
          .arcade-eyebrow { display:inline-flex; align-items:center; gap:9px; color:#f6a9d0; font:700 10px/1.2 var(--font-mono); letter-spacing:.2em; text-transform:uppercase; }
          .arcade-hero h1 { margin:18px 0 0; font:900 clamp(42px,7vw,82px)/.9 var(--font-display); letter-spacing:-.065em; text-transform:uppercase; }
          .arcade-hero h1 span { color:#fa8bbd; }
          .arcade-hero-copy p { max-width:440px; margin:18px 0 0; color:#c0b9c9; font-size:14px; line-height:1.7; }
          .arcade-hero-image { position:absolute; z-index:-1; inset:0 0 0 auto; width:48%; opacity:.77; mask-image:linear-gradient(90deg,transparent 0%,black 42%); }
          .arcade-hero-image img { width:100%; height:100%; object-fit:cover; object-position:center; }
          .arcade-led { display:inline-block; width:7px; height:7px; border-radius:50%; background:#89f5cc; box-shadow:0 0 14px rgba(137,245,204,.75); }
          .arcade-wallet { position:absolute; right:clamp(18px,3vw,32px); top:22px; display:flex; align-items:center; gap:10px; border:1px solid rgba(255,255,255,.14); border-radius:999px; background:rgba(12,13,21,.74); padding:10px 15px; backdrop-filter:blur(12px); }
          .arcade-wallet strong { color:#ffd478; font:700 12px var(--font-mono); }
          .arcade-label { margin:30px 0 13px; display:flex; align-items:end; justify-content:space-between; gap:12px; }
          .arcade-label h2 { margin:0; font:800 19px var(--font-display); letter-spacing:-.03em; }
          .arcade-label p { margin:0; color:var(--arcade-muted); font-size:12px; }
          .arcade-game-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:11px; }
          .arcade-game { position:relative; min-width:0; overflow:hidden; border:1px solid var(--arcade-line); border-radius:17px; background:#15141e; color:inherit; text-align:left; cursor:pointer; padding:0; }
          .arcade-game[aria-pressed="true"] { border-color:rgba(255,139,190,.73); box-shadow:inset 0 0 0 1px rgba(255,139,190,.18),0 8px 28px rgba(197,69,132,.1); }
          .arcade-game:hover { transform:translateY(-3px); border-color:rgba(255,139,190,.45); }
          .arcade-game-art { position:relative; height:96px; overflow:hidden; background:#211a2b; }
          .arcade-game-art:after { content:""; position:absolute; inset:35% 0 0; background:linear-gradient(transparent,rgba(15,14,22,.93)); }
          .arcade-game-art img { width:100%; height:100%; object-fit:cover; transition:transform 240ms ease; }
          .arcade-game:hover .arcade-game-art img { transform:scale(1.06); }
          .arcade-game-icon { position:absolute; z-index:1; right:9px; top:9px; display:grid; place-items:center; width:28px; height:28px; border:1px solid rgba(255,255,255,.17); border-radius:9px; background:rgba(16,14,23,.6); color:#ffd7e8; }
          .arcade-game-copy { padding:10px 12px 12px; }
          .arcade-game-copy strong { display:block; font:750 12px var(--font-display); }
          .arcade-game-copy span { display:block; overflow:hidden; margin-top:4px; color:var(--arcade-muted); font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
          .arcade-layout { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(270px,.85fr); gap:14px; margin-top:18px; }
          .arcade-panel { border:1px solid var(--arcade-line); border-radius:20px; background:linear-gradient(145deg,rgba(31,27,40,.94),rgba(17,19,29,.96)); }
          .arcade-play-panel { overflow:hidden; }
          .arcade-stage { position:relative; min-height:258px; display:grid; place-items:center; overflow:hidden; background:radial-gradient(ellipse at 50% 70%,rgba(198,72,139,.16),transparent 52%),linear-gradient(140deg,rgba(34,25,41,.8),rgba(15,19,30,.92)); }
          .arcade-stage:before { content:""; position:absolute; inset:0; opacity:.13; background:radial-gradient(circle,rgba(255,255,255,.52) 1px,transparent 1.5px); background-size:19px 19px; mask-image:linear-gradient(to bottom,transparent,black); }
          .arcade-machine { position:relative; width:min(76%,410px); height:198px; overflow:hidden; border:1px solid rgba(255,170,209,.32); border-radius:17px; background:#16131d; box-shadow:0 18px 52px rgba(0,0,0,.4),inset 0 0 40px rgba(196,72,139,.08); }
          .arcade-machine img { width:100%; height:100%; object-fit:cover; opacity:.75; }
          .arcade-machine-shade { position:absolute; inset:0; display:grid; place-items:center; background:linear-gradient(90deg,rgba(15,12,20,.48),rgba(15,12,20,.14),rgba(15,12,20,.55)); }
          .arcade-reel-readout { display:flex; align-items:center; gap:9px; }
          .arcade-reel { display:grid; place-items:center; width:clamp(48px,6vw,68px); aspect-ratio:1; border:1px solid rgba(255,218,237,.38); border-radius:13px; background:rgba(20,15,25,.84); color:#ffe6f0; font:800 24px var(--font-display); box-shadow:inset 0 0 16px rgba(245,131,183,.1); }
          .arcade-running .arcade-reel { animation:arcade-roll .32s ease-in-out infinite alternate; }
          @keyframes arcade-roll { from { transform:translateY(-5px); opacity:.67; } to { transform:translateY(5px); opacity:1; } }
          .arcade-stage-tag { position:absolute; left:20px; top:18px; z-index:1; color:#e7a7c6; font:700 9px var(--font-mono); letter-spacing:.18em; text-transform:uppercase; }
          .arcade-controls { padding:20px; }
          .arcade-controls-heading { display:flex; align-items:center; gap:11px; }
          .arcade-controls-heading > span { display:grid; width:42px; height:42px; place-items:center; border:1px solid rgba(246,142,192,.25); border-radius:13px; background:rgba(223,96,157,.11); color:#f6a9d0; }
          .arcade-controls-heading h2 { margin:0; font:800 19px var(--font-display); }
          .arcade-controls-heading p { margin:3px 0 0; color:var(--arcade-muted); font-size:11px; }
          .arcade-field { display:block; margin-top:18px; color:#bfb8c9; font-size:11px; font-weight:650; }
          .arcade-input-wrap { display:flex; align-items:center; gap:10px; margin-top:8px; border:1px solid rgba(255,255,255,.14); border-radius:13px; background:rgba(8,10,16,.58); padding:0 13px; }
          .arcade-input-wrap > span { color:#f4ca70; font:700 14px var(--font-mono); }
          .arcade-input-wrap input { width:100%; min-width:0; height:46px; border:0; outline:none; background:transparent; color:white; font:700 15px var(--font-mono); }
          .arcade-input-wrap input:focus-visible { outline:none; }
          .arcade-helper { margin:7px 0 0; color:#857f91; font-size:10px; }
          .arcade-choice-row { display:flex; gap:8px; margin-top:12px; }
          .arcade-choice { flex:1; min-height:39px; border:1px solid rgba(255,255,255,.13); border-radius:11px; background:rgba(255,255,255,.035); color:#c8c1d0; font-size:11px; font-weight:700; }
          .arcade-choice[aria-pressed="true"] { border-color:rgba(247,153,196,.65); background:rgba(225,94,157,.14); color:#ffd2e6; }
          .arcade-play-button { display:flex; width:100%; min-height:48px; align-items:center; justify-content:center; gap:9px; margin-top:17px; border:1px solid rgba(255,179,212,.7); border-radius:13px; background:linear-gradient(105deg,#f69ac4,#e773a9); color:#24111e; font:850 12px var(--font-display); letter-spacing:.1em; text-transform:uppercase; box-shadow:0 8px 22px rgba(215,94,151,.17); }
          .arcade-play-button:hover:not(:disabled) { filter:brightness(1.07); transform:translateY(-1px); }
          .arcade-play-button:disabled { opacity:.5; }
          .arcade-alert { margin:10px 0 0; color:#ff9db0; font-size:11px; line-height:1.5; }
          .arcade-result { margin-top:14px; padding:15px 16px; border:1px solid rgba(137,245,204,.2); border-radius:16px; background:rgba(23,62,53,.2); animation:arcade-result-in .28s ease-out both; }
          .arcade-result[data-won="false"] { border-color:rgba(255,146,170,.2); background:rgba(69,31,44,.22); }
          @keyframes arcade-result-in { from { opacity:0; transform:translateY(7px); } to { opacity:1; transform:translateY(0); } }
          .arcade-result-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
          .arcade-result-top strong { font:800 12px var(--font-display); }
          .arcade-result-top span { display:inline-flex; align-items:center; gap:4px; font:700 12px var(--font-mono); }
          .arcade-result[data-won="true"] .arcade-result-top span { color:#9cf1cb; }
          .arcade-result[data-won="false"] .arcade-result-top span { color:#ff9daf; }
          .arcade-result p { margin:8px 0 0; color:#bdb7c5; font-size:11px; line-height:1.55; }
          .arcade-side { padding:20px; }
          .arcade-side h3 { margin:0; font:800 14px var(--font-display); }
          .arcade-side-intro { margin:6px 0 16px; color:var(--arcade-muted); font-size:11px; line-height:1.6; }
          .arcade-rule { display:flex; gap:11px; padding:12px 0; border-top:1px solid rgba(255,255,255,.075); }
          .arcade-rule-icon { flex:none; color:#ed9ec4; }
          .arcade-rule strong { display:block; font-size:11px; }
          .arcade-rule span { display:block; margin-top:3px; color:#938c9d; font-size:10px; line-height:1.5; }
          .arcade-footnote { display:flex; gap:9px; margin-top:14px; padding:12px; border:1px solid rgba(255,212,120,.16); border-radius:12px; background:rgba(157,116,42,.08); color:#c9bc9e; font-size:10px; line-height:1.5; }
          @media (max-width:860px) { .arcade-game-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } .arcade-layout { grid-template-columns:1fr; } .arcade-side { display:grid; grid-template-columns:1fr 1fr; gap:0 20px; } .arcade-side h3,.arcade-side-intro,.arcade-footnote { grid-column:1/-1; } }
          @media (max-width:560px) { .arcade-hero { min-height:285px; grid-template-columns:1fr; } .arcade-hero-copy { padding:74px 22px 26px; } .arcade-hero-image { width:78%; opacity:.44; } .arcade-wallet { top:14px; right:14px; } .arcade-hero h1 { font-size:54px; } .arcade-label { align-items:start; flex-direction:column; } .arcade-game-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; } .arcade-game-art { height:86px; } .arcade-stage { min-height:220px; } .arcade-machine { width:84%; height:165px; } .arcade-controls { padding:17px; } .arcade-side { display:block; } }
          @media (prefers-reduced-motion:reduce) { .arcade-running .arcade-reel { animation:none; } }
        `}</style>

        <header className="arcade-hero">
          <div className="arcade-hero-image" aria-hidden="true"><img src="/arcade/slot-machine.jpg" alt="" /></div>
          <div className="arcade-wallet" aria-label="Wallet balance">
            <CircleDollarSign className="size-4 text-amber-300" aria-hidden="true" />
            <strong>{formatCoins(user?.coins ?? 0)}</strong>
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
                <img src={game.image} alt="" />
                <div className="arcade-machine-shade">
                  {selected === "slots" ? (
                    <div className="arcade-reel-readout" aria-hidden="true">
                      {(result?.detail.match(/Reels: (.*?)(?: ·|$)/)?.[1]?.split(" · ") ?? ["✦", "7", "✦"]).slice(0, 3).map((symbol, index) => <span className="arcade-reel" key={`${symbol}-${index}`}>{play.isPending ? ["✦", "7", "✧"][(index + 1) % 3] : symbol}</span>)}
                    </div>
                  ) : (
                    <div className="arcade-reel-readout" aria-hidden="true"><span className="arcade-reel">{play.isPending ? "…" : selected === "coin" ? (result?.detail.includes("tails") ? "T" : "H") : selected === "dice" ? (result?.detail.match(/rolled (\d)/)?.[1] ?? "⚄") : selected === "roulette" ? (result?.detail.match(/· (\d+)/)?.[1] ?? "0") : "GO"}</span></div>
                  )}
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
                <input id="arcade-wager" inputMode="numeric" type="number" min={game.minimum} max={MAX_WAGER} step="1" value={wagerText} onChange={(event) => { setWagerText(event.target.value); setValidation(""); }} aria-describedby="arcade-wager-help" aria-invalid={Boolean(validation)} />
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
