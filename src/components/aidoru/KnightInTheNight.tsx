import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "./session";
import {
  claimHalloweenReward,
  fetchHalloweenWorld,
  heartbeatHalloweenWorld,
  startHalloweenIsland,
} from "@/lib/aidoru.functions";
import {
  HALLOWEEN_ISLANDS,
  HALLOWEEN_REWARD_MAX,
  HALLOWEEN_REWARD_MIN,
  type OwnedCard,
} from "@/lib/game";

const WIDTH = 960;
const HEIGHT = 540;
const WORLD_WIDTH = 2_400;
const WORLD_HEIGHT = 1_400;
const MAX_HEALTH = 6;
const INTRO_DURATION_MS = 2_800;
function formatHalloweenAmount(amount: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, Number(amount) || 0));
}

function formatHalloweenCoins(amount: number) {
  return formatHalloweenAmount(amount) + " coins";
}

const MAP_POSITIONS = [
  { x: 12, y: 69 },
  { x: 31, y: 40 },
  { x: 51, y: 68 },
  { x: 72, y: 37 },
  { x: 89, y: 64 },
] as const;

type Screen = "loading" | "start" | "map" | "playing" | "won" | "lost";
type DirectionControl = "up" | "down" | "left" | "right";
type Control = DirectionControl | "attack" | "roll";
type HalloweenRewardCard = Pick<
  OwnedCard,
  "cardId" | "name" | "tier" | "series" | "media" | "mediaType" | "spawnId"
>;

interface Player {
  x: number;
  y: number;
  hp: number;
  directionX: number;
  directionY: number;
  invulnerableUntil: number;
  rollUntil: number;
  rollCooldownUntil: number;
  attackCooldownUntil: number;
  swingUntil: number;
}

interface Enemy {
  x: number;
  y: number;
  hp: number;
  phase: number;
  kind: "ghost" | "bat";
}

interface Candy {
  x: number;
  y: number;
  phase: number;
}

interface GameState {
  player: Player;
  enemies: Enemy[];
  candies: Candy[];
  islandId: string;
  candyGoal: number;
  totalEnemies: number;
  candyCollected: number;
  kills: number;
}

interface InputState {
  held: Set<DirectionControl>;
  attackQueued: boolean;
  rollQueued: boolean;
}

interface WorldPlayer {
  name: string;
  avatarUrl: string | null;
  islandId: string;
  x: number;
  y: number;
}

function createGame(islandId: string): GameState {
  const islandIndex = Math.max(
    0,
    HALLOWEEN_ISLANDS.findIndex((island) => island.id === islandId),
  );
  const island = HALLOWEEN_ISLANDS[islandIndex]!;
  return {
    islandId: island.id,
    candyGoal: island.candyGoal,
    totalEnemies: island.enemyCount,
    player: {
      x: 180,
      y: WORLD_HEIGHT - 170,
      hp: MAX_HEALTH,
      directionX: 0,
      directionY: -1,
      invulnerableUntil: 0,
      rollUntil: 0,
      rollCooldownUntil: 0,
      attackCooldownUntil: 0,
      swingUntil: 0,
    },
    enemies: Array.from({ length: island.enemyCount }, (_, index) => {
      const column = index % 6;
      const row = Math.floor(index / 6);
      return {
        x: 150 + column * 390 + ((row + islandIndex) % 2) * 80,
        y: 145 + row * 270 + ((column + islandIndex) % 2) * 38,
        hp: islandIndex > 1 && index % 6 === 0 ? 2 : 1,
        phase: index * 0.8,
        kind: (index + islandIndex) % 3 === 0 ? "bat" : "ghost",
      };
    }),
    candies: [],
    candyCollected: 0,
    kills: 0,
  };
}

export default function KnightInTheNight() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data: user } = useSession();
  const playerName = user?.name?.trim().slice(0, 24) || "Knight";
  const firstIslandId: string = HALLOWEEN_ISLANDS[0].id;
  const gameRef = useRef<GameState>(createGame(firstIslandId));
  const inputRef = useRef<InputState>({
    held: new Set<DirectionControl>(),
    attackQueued: false,
    rollQueued: false,
  });
  const selectedIslandRef = useRef<string>(firstIslandId);
  const rewardRequestRef = useRef(false);
  const startRequestRef = useRef(false);
  const worldCall = useServerFn(fetchHalloweenWorld);
  const presenceCall = useServerFn(heartbeatHalloweenWorld);
  const startIslandCall = useServerFn(startHalloweenIsland);
  const claimRewardCall = useServerFn(claimHalloweenReward);
  const worldCallRef = useRef(worldCall);
  const presenceCallRef = useRef(presenceCall);
  const startIslandCallRef = useRef(startIslandCall);
  const claimRewardCallRef = useRef(claimRewardCall);
  worldCallRef.current = worldCall;
  presenceCallRef.current = presenceCall;
  startIslandCallRef.current = startIslandCall;
  claimRewardCallRef.current = claimRewardCall;
  const screenRef = useRef<Screen>("loading");
  const [screen, setScreenState] = useState<Screen>("loading");
  const [health, setHealth] = useState(MAX_HEALTH);
  const [candies, setCandies] = useState(0);
  const [kills, setKills] = useState(0);
  const [selectedIslandId, setSelectedIslandId] = useState<string>(firstIslandId);
  const [completedIslandIds, setCompletedIslandIds] = useState<string[]>([]);
  const [unlockedIslandIds, setUnlockedIslandIds] = useState<string[]>([firstIslandId]);
  const [onlinePlayers, setOnlinePlayers] = useState<WorldPlayer[]>([]);
  const onlinePlayersRef = useRef<WorldPlayer[]>([]);
  onlinePlayersRef.current = onlinePlayers;
  const [walletCoins, setWalletCoins] = useState<number | null>(null);
  const [worldMessage, setWorldMessage] = useState("");
  const [rewardMessage, setRewardMessage] = useState("");
  const [rewardCards, setRewardCards] = useState<HalloweenRewardCard[]>([]);
  const [rewardCanRetry, setRewardCanRetry] = useState(false);
  const [rewardClaiming, setRewardClaiming] = useState(false);
  const [starting, setStarting] = useState(false);

  const setScreen = (next: Screen) => {
    screenRef.current = next;
    setScreenState(next);
  };

  const selectedIsland =
    HALLOWEEN_ISLANDS.find((island) => island.id === selectedIslandId) ?? HALLOWEEN_ISLANDS[0];
  const selectedIslandIndex = Math.max(
    0,
    HALLOWEEN_ISLANDS.findIndex((island) => island.id === selectedIsland.id),
  );
  const levelProgressPercent = Math.min(
    100,
    Math.round((candies / Math.max(1, selectedIsland.candyGoal)) * 100),
  );
  const playersOnSelectedIsland = onlinePlayers.filter(
    (player) => player.islandId === selectedIsland.id,
  );
  const hasGameCanvas = screen === "playing" || screen === "won" || screen === "lost";

  const claimIslandRewardNow = useCallback(async (islandId: string) => {
    if (rewardRequestRef.current) return;
    rewardRequestRef.current = true;
    setRewardClaiming(true);
    setRewardMessage("Checking your island clear…");
    setRewardCanRetry(false);
    try {
      const result = await claimRewardCallRef.current({ data: { islandId } });
      setWalletCoins(result.coins);
      setCompletedIslandIds(result.completedIslandIds);
      setUnlockedIslandIds(result.unlockedIslandIds);
      setRewardCards(result.cardRewards);
      setRewardMessage(
        result.reward > 0
          ? `Island cleared — ${formatHalloweenCoins(result.reward)} and ${result.cardRewards.length} Halloween event card${result.cardRewards.length === 1 ? "" : "s"} added to your Card Vault.`
          : result.cardRewards.length > 0
            ? `${result.cardRewards.length} Halloween event card${result.cardRewards.length === 1 ? "" : "s"} added to your Card Vault. The first-clear coin bonus was already claimed.`
            : "This island's first-clear coin bonus and Halloween card pack are already claimed.",
      );
    } catch (error) {
      rewardRequestRef.current = false;
      setRewardCards([]);
      setRewardCanRetry(true);
      setRewardMessage(
        error instanceof Error ? error.message : "The island reward could not be checked.",
      );
    } finally {
      setRewardClaiming(false);
    }
  }, []);

  const startGame = async (islandId: string = selectedIslandId) => {
    if (startRequestRef.current || !unlockedIslandIds.includes(islandId)) return;
    startRequestRef.current = true;
    setStarting(true);
    selectedIslandRef.current = islandId;
    setSelectedIslandId(islandId);
    setWorldMessage("");
    try {
      await startIslandCallRef.current({ data: { islandId } });
    } catch (error) {
      setWorldMessage(
        error instanceof Error ? error.message : "The island could not be started right now.",
      );
      startRequestRef.current = false;
      setStarting(false);
      return;
    }
    startRequestRef.current = false;
    setStarting(false);
    rewardRequestRef.current = false;
    setRewardMessage("");
    setRewardCards([]);
    setRewardCanRetry(false);
    gameRef.current = createGame(islandId);
    inputRef.current = {
      held: new Set<DirectionControl>(),
      attackQueued: false,
      rollQueued: false,
    };
    setHealth(MAX_HEALTH);
    setCandies(0);
    setKills(0);
    setScreen("playing");
  };

  useEffect(() => {
    if (screen !== "loading") return;
    const timeout = window.setTimeout(() => {
      screenRef.current = "start";
      setScreenState("start");
    }, INTRO_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [screen]);

  useEffect(() => {
    let disposed = false;
    const syncWorld = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const [world] = await Promise.all([
          worldCallRef.current(),
          presenceCallRef.current({
            data: {
              islandId: selectedIslandRef.current,
              x: clamp(gameRef.current.player.x / WORLD_WIDTH, 0, 1),
              y: clamp(gameRef.current.player.y / WORLD_HEIGHT, 0, 1),
            },
          }),
        ]);
        if (disposed) return;
        setWalletCoins(world.coins);
        setCompletedIslandIds(world.completedIslandIds);
        setUnlockedIslandIds(world.unlockedIslandIds);
        setOnlinePlayers(world.players);
      } catch (error) {
        if (!disposed) {
          setWorldMessage(
            error instanceof Error
              ? error.message
              : "Online island data is temporarily unavailable.",
          );
        }
      }
    };
    void syncWorld();
    const interval = window.setInterval(() => void syncWorld(), 12_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (screen === "won") void claimIslandRewardNow(gameRef.current.islandId);
  }, [screen, claimIslandRewardNow]);

  useEffect(() => {
    if (!hasGameCanvas) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let frame = 0;
    let previousTime = 0;
    let lastHudKey = "";

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(bounds.width * pixelRatio));
      canvas.height = Math.max(1, Math.round(bounds.height * pixelRatio));
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    resizeCanvas();

    const animationFrame = (timestamp: number) => {
      const delta = previousTime ? Math.min((timestamp - previousTime) / 1000, 0.04) : 0;
      previousTime = timestamp;
      const game = gameRef.current;

      if (screenRef.current === "playing") {
        updateGame(game, inputRef.current, delta, timestamp, (next) => setScreen(next));
        const hudKey = `${game.player.hp}:${game.candyCollected}:${game.kills}`;
        if (hudKey !== lastHudKey) {
          lastHudKey = hudKey;
          setHealth(game.player.hp);
          setCandies(game.candyCollected);
          setKills(game.kills);
        }
      }

      const scale = canvas.width / WIDTH;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      drawGame(
        context,
        game,
        timestamp,
        canvas.height / scale,
        playerName,
        onlinePlayersRef.current.filter((player) => player.islandId === game.islandId),
      );
      frame = window.requestAnimationFrame(animationFrame);
    };

    frame = window.requestAnimationFrame(animationFrame);

    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const direction = keyToDirection(key);
      if (direction) {
        event.preventDefault();
        inputRef.current.held.add(direction);
      } else if ((key === " " || key === "j" || key === "x") && !event.repeat) {
        event.preventDefault();
        inputRef.current.attackQueued = true;
      } else if (key === "k" && !event.repeat) {
        event.preventDefault();
        inputRef.current.rollQueued = true;
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      const direction = keyToDirection(event.key.toLowerCase());
      if (direction) inputRef.current.held.delete(direction);
    };
    const clearKeys = () => {
      inputRef.current.held.clear();
    };

    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", clearKeys);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", clearKeys);
    };
  }, [hasGameCanvas, playerName]);

  const pressControl = (control: Control, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (control === "attack") inputRef.current.attackQueued = true;
    else if (control === "roll") inputRef.current.rollQueued = true;
    else inputRef.current.held.add(control);
  };

  const releaseControl = (control: Control) => {
    if (control !== "attack" && control !== "roll") inputRef.current.held.delete(control);
  };

  const controlButton = (control: Control, label: string, className: string) => (
    <button
      key={control}
      type="button"
      className={className}
      aria-label={label}
      onPointerDown={(event) => pressControl(control, event)}
      onPointerUp={() => releaseControl(control)}
      onPointerCancel={() => releaseControl(control)}
      onLostPointerCapture={() => releaseControl(control)}
    >
      {control === "attack" ? (
        <>
          <span className="knight-action-glyph" aria-hidden="true">
            ⚔
          </span>
          <span className="knight-action-label">SLASH</span>
        </>
      ) : control === "roll" ? (
        <>
          <span className="knight-action-glyph" aria-hidden="true">
            ✦
          </span>
          <span className="knight-action-label">DODGE</span>
        </>
      ) : (
        directionGlyph(control)
      )}
    </button>
  );

  const isPlaying = screen === "playing";
  const resultTitle =
    screen === "won"
      ? `${selectedIsland.name} cleared!`
      : screen === "lost"
        ? "The ghosts got you."
        : "";

  return (
    <main className="knight-page">
      {screen === "loading" && (
        <section className="knight-splash" aria-label="Loading Halloween adventure">
          <div className="knight-loading-stage">
            <span className="knight-loading-moon" aria-hidden="true">
              ☾
            </span>
            <div className="knight-pokeball" aria-hidden="true">
              <span className="knight-pokeball-band" />
              <span className="knight-pokeball-button" />
            </div>
            <p className="knight-eyebrow">THE HAUNTED ARCHIPELAGO</p>
            <h1 className="knight-loading-title">A little spooky magic…</h1>
            <p className="knight-loading-copy">Getting your Halloween adventure ready</p>
            <div
              className="knight-loading-track"
              role="progressbar"
              aria-label="Loading adventure"
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span />
            </div>
            <span className="knight-loading-hint">Opening the lantern path</span>
          </div>
        </section>
      )}

      {screen === "start" && (
        <section className="knight-start-screen" aria-label="Start Halloween adventure">
          <p className="knight-eyebrow">THE HAUNTED ARCHIPELAGO</p>
          <h1 className="knight-title">Knight in the Night</h1>
          <p className="knight-welcome">Ready, {playerName}?</p>
          <div className="knight-start-summary">
            <span>5 islands</span>
            <span>
              {formatHalloweenAmount(HALLOWEEN_REWARD_MIN)}–{formatHalloweenAmount(HALLOWEEN_REWARD_MAX)}{" "}
              first-clear coins
            </span>
            <span>1–8 Halloween event cards · once per island</span>
          </div>
          <button type="button" className="knight-start-button" onClick={() => setScreen("map")}>
            START
            <span aria-hidden="true">→</span>
          </button>
        </section>
      )}

      {screen === "map" && (
        <section className="knight-explorer" aria-label="Choose a Halloween island">
          <div className="knight-explorer-heading">
            <div>
              <p className="knight-eyebrow">THE HAUNTED ARCHIPELAGO</p>
              <h2 className="knight-section-title">Choose your island</h2>
              <p className="knight-map-instruction">Tap an unlocked island to start.</p>
            </div>
            <div className="knight-world-summary">
              <div className="knight-wallet-card">
                <span>COIN WALLET</span>
                <strong>{walletCoins === null ? "—" : formatHalloweenCoins(walletCoins)}</strong>
              </div>
              <div className="knight-online-card" aria-live="polite">
                <span className="knight-online-dot" aria-hidden="true" />
                <strong>{onlinePlayers.length}</strong>
                <span>other explorers online</span>
              </div>
            </div>
          </div>

          <div className="knight-map-scroller">
            <div className="knight-world-map">
              <svg
                className="knight-map-route"
                viewBox="0 0 1000 320"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d="M120 220 C190 202 245 128 310 128 S445 214 510 218 S655 122 720 118 S833 198 890 205" />
              </svg>
              {HALLOWEEN_ISLANDS.map((island, index) => {
                const position = MAP_POSITIONS[index]!;
                const unlocked = unlockedIslandIds.includes(island.id);
                const cleared = completedIslandIds.includes(island.id);
                const islandPlayers = onlinePlayers.filter(
                  (player) => player.islandId === island.id,
                );
                return (
                  <div className="knight-island-group" key={island.id}>
                    {islandPlayers.map((player, playerIndex) => (
                      <span
                        key={`${island.id}-${player.name}-${playerIndex}`}
                        className="knight-player-marker"
                        style={{
                          left: `calc(${position.x}% + ${(player.x - 0.5) * 62}px)`,
                          top: `calc(${position.y}% - 64px + ${(player.y - 0.5) * 48}px)`,
                        }}
                        title={`${player.name} · ${island.name}`}
                        aria-label={`${player.name} is exploring ${island.name}`}
                      >
                        {player.avatarUrl ? (
                          <img src={player.avatarUrl} alt="" loading="lazy" />
                        ) : (
                          player.name.slice(0, 1).toUpperCase()
                        )}
                      </span>
                    ))}
                    <button
                      type="button"
                      className={`knight-island-pin${cleared ? " is-cleared" : ""}${unlocked ? "" : " is-locked"}`}
                      style={{ left: `${position.x}%`, top: `${position.y}%` }}
                      onClick={() => void startGame(island.id)}
                      disabled={!unlocked || starting}
                      aria-label={`${island.name}, ${cleared ? "cleared" : unlocked ? "unlocked, tap to start" : "locked"}. ${islandPlayers.length} players here.`}
                    >
                      <span className="knight-island-emoji" aria-hidden="true">
                        {unlocked ? island.emoji : "🔒"}
                      </span>
                      <strong>{island.name}</strong>
                      <span className="knight-island-status">
                        {starting && selectedIslandId === island.id
                          ? "SETTING SAIL"
                          : cleared
                            ? "CLEARED"
                            : unlocked
                              ? "TAP TO START"
                              : "LOCKED"}
                      </span>
                    </button>
                  </div>
                );
              })}
              <span className="knight-map-spark knight-map-spark-one" aria-hidden="true">
                ✦
              </span>
              <span className="knight-map-spark knight-map-spark-two" aria-hidden="true">
                ✧
              </span>
              <span className="knight-map-compass" aria-hidden="true">
                N ↑
              </span>
            </div>
          </div>
          <div className="knight-map-reward">
            <strong>
              {formatHalloweenAmount(HALLOWEEN_REWARD_MIN)}–{formatHalloweenAmount(HALLOWEEN_REWARD_MAX)}{" "}
              COINS
            </strong>
            <span>Plus 1–8 Halloween event cards · once per island</span>
            <span className="knight-map-live">LIVE MAP · updates every 12 seconds</span>
          </div>
          {worldMessage && (
            <p className="knight-world-message" role="status">
              {worldMessage}
            </p>
          )}
        </section>
      )}

      <section
        className="knight-frame"
        aria-label="Knight in the Night game"
        hidden={!hasGameCanvas}
      >
        <div className="knight-game-header">
          <div>
            <p className="knight-eyebrow">AIDORU · HALLOWEEN QUEST · {selectedIsland.region}</p>
            <h1 className="knight-title">Knight in the Night</h1>
            <p className="knight-current-island">
              {selectedIsland.emoji} {selectedIsland.name}
            </p>
          </div>
          <div className="knight-stats" aria-live="polite">
            <span className="knight-stat" aria-label={`Health ${health} out of ${MAX_HEALTH}`}>
              <span aria-hidden="true">♥</span> {health}/{MAX_HEALTH}
            </span>
            <span
              className="knight-stat"
              aria-label={`Candy ${candies} of ${selectedIsland.candyGoal}`}
            >
              <span aria-hidden="true">🍬</span> {candies}/{selectedIsland.candyGoal}
            </span>
            <span className="knight-stat" aria-label={`${kills} spirits defeated`}>
              <span aria-hidden="true">☠</span> {kills}/{selectedIsland.enemyCount}
            </span>
            <span
              className="knight-stat"
              aria-label={playersOnSelectedIsland.length + " other players on this island"}
            >
              <span aria-hidden="true">✧</span> {playersOnSelectedIsland.length} here
            </span>
          </div>
          <div className="knight-level-progress">
            <div className="knight-level-meta">
              <strong>LEVEL {selectedIslandIndex + 1} / {HALLOWEEN_ISLANDS.length}</strong>
              <span>{candies} / {selectedIsland.candyGoal} treats</span>
            </div>
            <div
              className="knight-level-track"
              role="progressbar"
              aria-label={"Level " + (selectedIslandIndex + 1) + " island progress"}
              aria-valuemin={0}
              aria-valuemax={selectedIsland.candyGoal}
              aria-valuenow={candies}
              aria-valuetext={candies + " of " + selectedIsland.candyGoal + " treats collected"}
            >
              <span style={{ width: levelProgressPercent + "%" }} />
            </div>
          </div>
        </div>

        <div className="knight-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="knight-canvas"
            width={WIDTH}
            height={HEIGHT}
            role="img"
            aria-label={`Large scrolling haunted world on ${selectedIsland.name}. Move the knight, defeat spirits, and collect ${selectedIsland.candyGoal} sweets.`}
          />
          {isPlaying && (
            <section className="knight-touch-controls" aria-label="Touch controls">
              <div className="knight-dpad" aria-label="Movement pad">
                {controlButton("up", "Move up", "knight-pad-button knight-pad-up")}
                {controlButton("left", "Move left", "knight-pad-button knight-pad-left")}
                <span className="knight-pad-center" aria-hidden="true">
                  ✦
                </span>
                {controlButton("right", "Move right", "knight-pad-button knight-pad-right")}
                {controlButton("down", "Move down", "knight-pad-button knight-pad-down")}
              </div>
              <div className="knight-action-controls">
                {controlButton("roll", "Roll to dodge", "knight-action-button knight-roll-button")}
                {controlButton(
                  "attack",
                  "Slash with sword",
                  "knight-action-button knight-slash-button",
                )}
              </div>
            </section>
          )}
          {(screen === "won" || screen === "lost") && (
            <div className="knight-overlay">
              <div className="knight-overlay-card" role="status">
                <p className="knight-eyebrow">
                  {screen === "won" ? "ISLAND CLEARED" : "THE NIGHT IS OVER"}
                </p>
                <h2>{resultTitle}</h2>
                <div className="knight-overlay-facts">
                  {screen === "won" ? (
                    <>
                      <span>
                        <strong>ISLAND CLEARED</strong>
                      </span>
                      <span role="status">
                        <strong>COIN REWARD</strong> ·{" "}
                        {rewardMessage || "Your first-clear bonus is being checked."}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>
                        <strong>DODGE</strong> the spirits
                      </span>
                      <span>
                        <strong>
                          {candies}/{selectedIsland.candyGoal} SWEETS
                        </strong>{" "}
                        collected
                      </span>
                    </>
                  )}
                </div>
                {screen === "won" && rewardCards.length > 0 && (
                  <section
                    className="knight-card-drops"
                    aria-label={`${rewardCards.length} Halloween event cards added to your collection`}
                  >
                    <p className="knight-card-drops-heading">
                      <strong>HALLOWEEN CARD DROP</strong>
                      <span>{rewardCards.length} added to your collection</span>
                    </p>
                    <div className="knight-card-drop-grid">
                      {rewardCards.map((card, index) => (
                        <HalloweenCardThumb
                          key={`${card.spawnId ?? card.cardId}-${index}`}
                          card={card}
                        />
                      ))}
                    </div>
                    <a className="knight-card-vault-link" href="/cards">
                      Open Card Vault <span aria-hidden="true">→</span>
                    </a>
                  </section>
                )}
                {screen === "won" && rewardCanRetry && (
                  <button
                    type="button"
                    className="knight-start-button knight-retry-reward"
                    onClick={() => void claimIslandRewardNow(gameRef.current.islandId)}
                    disabled={rewardClaiming}
                  >
                    {rewardClaiming ? "Checking…" : "Retry reward"}
                  </button>
                )}
                <button
                  type="button"
                  className="knight-start-button"
                  onClick={
                    screen === "won" ? () => setScreen("map") : () => void startGame(selectedIslandId)
                  }
                  disabled={starting || !unlockedIslandIds.includes(selectedIslandId)}
                >
                  {screen === "won" ? "Return to the map" : "Try this island again"}
                  <span aria-hidden="true">→</span>
                </button>
                {screen === "lost" && (
                  <button
                    type="button"
                    className="knight-map-back"
                    onClick={() => setScreen("map")}
                  >
                    Choose another island
                  </button>
                )}
                <small>
                  {kills} spirits defeated · {candies} sweets found
                </small>
              </div>
            </div>
          )}
        </div>

        <div className="knight-game-footer">
          <div className="knight-objective">
            <span className="knight-objective-dot" aria-hidden="true" />
            <span className="knight-objective-copy">
              <strong>{isPlaying ? "OBJECTIVE" : "QUEST GUIDE"}</strong>
              <span>
                {isPlaying
                  ? `${gameRef.current.candyGoal} sweets · ${gameRef.current.totalEnemies} spirits`
                  : "Clear islands in order · visit the map for your next island"}
              </span>
            </span>
          </div>
          <div className="knight-controls-hint">
            WASD / arrows · J or Space to slash · K to roll
          </div>
        </div>
      </section>
    </main>
  );
}

function HalloweenCardThumb({ card }: { card: HalloweenRewardCard }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article className="knight-card-drop">
      <div className="knight-card-drop-art">
        {card.media && !imageFailed ? (
          <img
            src={card.media}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span aria-hidden="true">✧</span>
        )}
      </div>
      <p title={card.name}>{card.name}</p>
      <small>{card.tier}</small>
    </article>
  );
}

function keyToDirection(key: string): DirectionControl | null {
  if (key === "arrowup" || key === "w") return "up";
  if (key === "arrowdown" || key === "s") return "down";
  if (key === "arrowleft" || key === "a") return "left";
  if (key === "arrowright" || key === "d") return "right";
  return null;
}

function directionGlyph(direction: DirectionControl) {
  return direction === "up" ? "↑" : direction === "down" ? "↓" : direction === "left" ? "←" : "→";
}

function updateGame(
  game: GameState,
  input: InputState,
  delta: number,
  now: number,
  finish: (screen: Screen) => void,
) {
  const player = game.player;
  let x = Number(input.held.has("right")) - Number(input.held.has("left"));
  let y = Number(input.held.has("down")) - Number(input.held.has("up"));
  const magnitude = Math.hypot(x, y);
  if (magnitude > 0) {
    x /= magnitude;
    y /= magnitude;
    player.directionX = x;
    player.directionY = y;
  }

  if (input.rollQueued && now >= player.rollCooldownUntil) {
    if (!magnitude) {
      x = player.directionX;
      y = player.directionY;
    }
    player.directionX = x;
    player.directionY = y;
    player.rollUntil = now + 240;
    player.rollCooldownUntil = now + 1100;
    player.invulnerableUntil = player.rollUntil + 140;
  }
  input.rollQueued = false;

  const rolling = now < player.rollUntil;
  const speed = rolling ? 350 : 165;
  if (rolling || magnitude > 0) {
    player.x += (rolling ? player.directionX : x) * speed * delta;
    player.y += (rolling ? player.directionY : y) * speed * delta;
  }
  player.x = clamp(player.x, 38, WORLD_WIDTH - 38);
  player.y = clamp(player.y, 80, WORLD_HEIGHT - 38);

  if (input.attackQueued && now >= player.attackCooldownUntil) {
    player.attackCooldownUntil = now + 390;
    player.swingUntil = now + 230;
    for (const enemy of game.enemies) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distance = Math.hypot(dx, dy);
      const facingDot = (dx * player.directionX + dy * player.directionY) / Math.max(distance, 1);
      if (distance < 100 && facingDot > 0.47) {
        enemy.hp -= 1;
        if (enemy.hp <= 0) {
          game.candies.push({ x: enemy.x, y: enemy.y, phase: enemy.phase });
          game.kills += 1;
        }
      }
    }
    game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
  }
  input.attackQueued = false;

  for (const enemy of game.enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const approach = enemy.kind === "bat" ? 42 : 31;
    if (distance > approach) {
      enemy.x += (dx / distance) * (enemy.kind === "bat" ? 46 : 34) * delta;
      enemy.y += (dy / distance) * (enemy.kind === "bat" ? 46 : 34) * delta;
    }
    enemy.phase += delta * (enemy.kind === "bat" ? 8 : 3);

    if (distance < 34 && now >= player.invulnerableUntil) {
      player.hp -= 1;
      player.invulnerableUntil = now + 900;
      if (player.hp <= 0) finish("lost");
    }
  }

  game.candies = game.candies.filter((candy) => {
    candy.phase += delta * 3;
    if (Math.hypot(candy.x - player.x, candy.y - player.y) < 31) {
      game.candyCollected += 1;
      return false;
    }
    return true;
  });

  if (game.candyCollected >= game.candyGoal) finish("won");
}

function drawGame(
  ctx: CanvasRenderingContext2D,
  game: GameState,
  now: number,
  viewHeight: number,
  playerName: string,
  otherPlayers: WorldPlayer[],
) {
  ctx.clearRect(0, 0, WIDTH, viewHeight);
  const cameraX = clamp(game.player.x - WIDTH / 2, 0, WORLD_WIDTH - WIDTH);
  const cameraY = clamp(game.player.y - viewHeight / 2, 0, WORLD_HEIGHT - viewHeight);
  ctx.save();
  ctx.translate(-cameraX, -cameraY);
  drawCourtyard(ctx, now, game.islandId);
  for (const candy of game.candies) drawCandy(ctx, candy);
  for (const enemy of game.enemies) drawEnemy(ctx, enemy);
  for (const player of otherPlayers) {
    drawOtherPlayer(
      ctx,
      player,
      clamp(player.x * WORLD_WIDTH, 38, WORLD_WIDTH - 38),
      clamp(player.y * WORLD_HEIGHT, 80, WORLD_HEIGHT - 38),
      now,
    );
  }
  drawKnight(ctx, game.player, now);
  drawPlayerName(ctx, playerName, game.player.x, game.player.y - 50);
  ctx.restore();
}

function drawOtherPlayer(
  ctx: CanvasRenderingContext2D,
  player: WorldPlayer,
  x: number,
  y: number,
  now: number,
) {
  ctx.save();
  ctx.translate(x, y + Math.sin(now / 220 + x) * 2);
  ctx.fillStyle = "rgba(142, 219, 195, 0.22)";
  ctx.beginPath();
  ctx.arc(0, 0, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8fd8c1";
  ctx.beginPath();
  ctx.arc(0, -8, 10, Math.PI, 0);
  ctx.lineTo(9, 10);
  ctx.quadraticCurveTo(0, 18, -9, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#263248";
  ctx.fillRect(-6, -7, 12, 3);
  ctx.restore();
  drawPlayerName(ctx, player.name, x, y - 40);
}

function drawPlayerName(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
) {
  ctx.save();
  ctx.font = "700 14px Poppins, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const labelWidth = Math.max(64, Math.min(210, ctx.measureText(name).width + 22));
  ctx.fillStyle = "rgba(10, 17, 26, 0.88)";
  ctx.fillRect(x - labelWidth / 2, y - 12, labelWidth, 24);
  ctx.strokeStyle = "rgba(238, 204, 145, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - labelWidth / 2, y - 12, labelWidth, 24);
  ctx.fillStyle = "#fff4dc";
  ctx.fillText(name, x, y, labelWidth - 14);
  ctx.restore();
}

function drawCourtyard(ctx: CanvasRenderingContext2D, now: number, islandId: string) {
  const island = HALLOWEEN_ISLANDS.find((entry) => entry.id === islandId) ?? HALLOWEEN_ISLANDS[0];
  const ground = ctx.createLinearGradient(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ground.addColorStop(0, island.palette[0]);
  ground.addColorStop(0.5, island.palette[1]);
  ground.addColorStop(1, island.palette[2]);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  ctx.fillStyle = "rgba(176, 211, 186, 0.12)";
  for (let i = 0; i < 520; i += 1) {
    const px = (i * 137 + 19) % WORLD_WIDTH;
    const py = (i * 83 + 47) % WORLD_HEIGHT;
    ctx.fillRect(px, py, 2 + (i % 3), 1);
  }

  ctx.fillStyle = "#0d131a";
  ctx.beginPath();
  ctx.moveTo(980, 0);
  ctx.lineTo(995, 58);
  ctx.lineTo(1_040, 102);
  ctx.lineTo(1_360, 102);
  ctx.lineTo(1_405, 58);
  ctx.lineTo(1_420, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#242329";
  ctx.fillRect(1_060, 36, 274, 80);
  ctx.fillStyle = "#362725";
  ctx.fillRect(1_137, 40, 120, 76);
  ctx.fillStyle = "#101116";
  ctx.fillRect(1_168, 58, 58, 58);
  ctx.fillStyle = "rgba(255, 160, 66, 0.2)";
  ctx.fillRect(1_175, 64, 44, 52);
  ctx.fillStyle = "#b85c36";
  ctx.fillRect(1_053, 31, 288, 9);

  ctx.strokeStyle = "rgba(199, 193, 149, 0.13)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(100, 1_300);
  ctx.lineTo(590, 1_085);
  ctx.lineTo(825, 965);
  ctx.lineTo(1_190, 740);
  ctx.lineTo(1_540, 570);
  ctx.lineTo(1_820, 355);
  ctx.lineTo(2_320, 100);
  ctx.stroke();

  for (let i = 0; i < 34; i += 1) {
    const x = 70 + ((i * 173 + 53) % (WORLD_WIDTH - 140));
    const y = 70 + ((i * 229 + 91) % (WORLD_HEIGHT - 140));
    drawTree(ctx, x, y, now);
  }
  for (let i = 0; i < 8; i += 1) {
    const x = 170 + i * 290;
    const y = 210 + (i % 3) * 390;
    drawPumpkin(ctx, x, y, i % 2 === 0 ? 1.05 : 0.9, now + i * 170);
    drawLantern(ctx, x + 100, y - 100, now + i * 600);
  }

  const shade = ctx.createRadialGradient(1_200, 700, 300, 1_200, 700, 1_450);
  shade.addColorStop(0, "rgba(7, 10, 15, 0)");
  shade.addColorStop(1, "rgba(6, 8, 14, 0.64)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  ctx.fillStyle = "rgba(220, 230, 216, 0.16)";
  for (let i = 0; i < 8; i += 1) {
    const drift = ((now / 95 + i * 319) % (WORLD_WIDTH + 180)) - 90;
    ctx.beginPath();
    ctx.ellipse(drift, 167 + i * 149, 96, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#111719";
  ctx.fillRect(-6, 8, 12, 63);
  ctx.beginPath();
  ctx.moveTo(0, -47);
  ctx.lineTo(-35, 13);
  ctx.lineTo(-14, 6);
  ctx.lineTo(-43, 39);
  ctx.lineTo(-13, 34);
  ctx.lineTo(-25, 59);
  ctx.lineTo(25, 59);
  ctx.lineTo(13, 34);
  ctx.lineTo(43, 39);
  ctx.lineTo(14, 6);
  ctx.lineTo(35, 13);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(111, 174, 114, 0.17)";
  ctx.beginPath();
  ctx.arc(Math.sin(now / 900 + x) * 3, 7, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPumpkin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  now: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = `rgba(255, 131, 45, ${0.13 + Math.sin(now / 240 + x) * 0.035})`;
  ctx.beginPath();
  ctx.arc(0, 0, 31, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d56f2d";
  ctx.beginPath();
  ctx.ellipse(0, 0, 21, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#9c4b2b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 15, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ebaa52";
  ctx.fillRect(-2, -20, 4, 7);
  ctx.fillStyle = "#fff0ac";
  ctx.beginPath();
  ctx.moveTo(-10, -2);
  ctx.lineTo(-5, 3);
  ctx.lineTo(-1, -2);
  ctx.moveTo(2, -2);
  ctx.lineTo(6, 3);
  ctx.lineTo(11, -2);
  ctx.fill();
  ctx.restore();
}

function drawLantern(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  const glow = ctx.createRadialGradient(x, y, 2, x, y, 62);
  glow.addColorStop(0, "rgba(255, 169, 75, 0.3)");
  glow.addColorStop(1, "rgba(255, 169, 75, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - 62, y - 62, 124, 124);
  ctx.fillStyle = "#241917";
  ctx.fillRect(x - 11, y - 23, 22, 30);
  ctx.fillStyle = `rgba(255, 193, 102, ${0.76 + Math.sin(now / 115) * 0.1})`;
  ctx.fillRect(x - 6, y - 18, 12, 19);
  ctx.strokeStyle = "#524032";
  ctx.lineWidth = 3;
  ctx.strokeRect(x - 11, y - 23, 22, 30);
}

function drawKnight(ctx: CanvasRenderingContext2D, player: Player, now: number) {
  const flicker = now < player.invulnerableUntil && Math.floor(now / 90) % 2 === 0;
  if (flicker) return;
  ctx.save();
  ctx.translate(player.x, player.y + Math.sin(now / 160) * 1.4);
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  ctx.ellipse(0, 11, 17, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#713e31";
  ctx.fillRect(-10, -2, 20, 17);
  ctx.fillStyle = "#d9d4c5";
  ctx.beginPath();
  ctx.arc(0, -7, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f1c56e";
  ctx.beginPath();
  ctx.moveTo(-11, -10);
  ctx.lineTo(-7, -23);
  ctx.lineTo(-2, -14);
  ctx.lineTo(3, -25);
  ctx.lineTo(8, -14);
  ctx.lineTo(12, -9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#151720";
  ctx.fillRect(-6, -7, 12, 3);
  ctx.strokeStyle = "#dfe1dc";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  const swordX = player.directionX * 24;
  const swordY = player.directionY * 24;
  if (now < player.swingUntil) {
    ctx.strokeStyle = "rgba(255, 223, 142, 0.85)";
    ctx.lineWidth = 15;
    ctx.rotate(Math.atan2(player.directionY, player.directionX));
    ctx.beginPath();
    ctx.arc(0, -2, 40, -0.78, 0.78);
    ctx.stroke();
    ctx.strokeStyle = "#fff1c1";
    ctx.lineWidth = 3;
    ctx.rotate(-Math.atan2(player.directionY, player.directionX));
  }
  ctx.beginPath();
  ctx.moveTo(player.directionX * 8, player.directionY * 8);
  ctx.lineTo(swordX, swordY);
  ctx.stroke();
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y + Math.sin(enemy.phase) * 4);
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 13, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (enemy.kind === "bat") {
    const flap = Math.sin(enemy.phase * 2) * 9;
    ctx.fillStyle = "#49364f";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-18, -19 - flap, -26, -3);
    ctx.quadraticCurveTo(-14, -3, -8, 7);
    ctx.quadraticCurveTo(0, 3, 8, 7);
    ctx.quadraticCurveTo(14, -3, 26, -3);
    ctx.quadraticCurveTo(18, -19 + flap, 0, 0);
    ctx.fill();
    ctx.fillStyle = "#fa7c69";
    ctx.fillRect(-5, -3, 3, 3);
    ctx.fillRect(2, -3, 3, 3);
  } else {
    ctx.fillStyle = "rgba(193, 207, 232, 0.84)";
    ctx.beginPath();
    ctx.moveTo(-15, 7);
    ctx.quadraticCurveTo(-23, -11, -11, -20);
    ctx.quadraticCurveTo(0, -31, 11, -20);
    ctx.quadraticCurveTo(23, -11, 15, 7);
    ctx.lineTo(7, 1);
    ctx.lineTo(0, 8);
    ctx.lineTo(-7, 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#373c53";
    ctx.fillRect(-8, -12, 4, 5);
    ctx.fillRect(4, -12, 4, 5);
    ctx.fillStyle = "rgba(202, 226, 255, 0.45)";
    ctx.beginPath();
    ctx.arc(-6, -7, 2, 0, Math.PI * 2);
    ctx.arc(6, -7, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCandy(ctx: CanvasRenderingContext2D, candy: Candy) {
  ctx.save();
  ctx.translate(candy.x, candy.y + Math.sin(candy.phase) * 4);
  ctx.rotate(Math.sin(candy.phase) * 0.16);
  ctx.fillStyle = "rgba(255, 190, 93, 0.18)";
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2aa4b";
  ctx.beginPath();
  ctx.moveTo(-13, -5);
  ctx.lineTo(-20, -10);
  ctx.lineTo(-20, 1);
  ctx.lineTo(-13, 5);
  ctx.closePath();
  ctx.moveTo(13, -5);
  ctx.lineTo(20, -10);
  ctx.lineTo(20, 1);
  ctx.lineTo(13, 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff0ba";
  ctx.fillRect(-13, -7, 26, 14);
  ctx.fillStyle = "#e68b3b";
  ctx.fillRect(-5, -7, 4, 14);
  ctx.fillRect(3, -7, 4, 14);
  ctx.restore();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
