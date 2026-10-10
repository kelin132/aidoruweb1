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
  cancelHalloweenDuo,
  claimHalloweenCrate,
  claimHalloweenReward,
  fetchHalloweenDuoQueue,
  fetchHalloweenWorld,
  heartbeatHalloweenDuoMatch,
  heartbeatHalloweenWorld,
  joinHalloweenDuo,
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

type GunId = "moonshot" | "spirit-burst" | "foxfire";
type OutfitId = "night-guard" | "oni-hunter" | "starlight";
const HALLOWEEN_GUNS: Array<{ id: GunId; name: string; detail: string; damage: number; cooldown: number; speed: number; range: number; color: string }> = [
  { id: "moonshot", name: "Moonshot", detail: "Balanced spirit pistol", damage: 2, cooldown: 390, speed: 520, range: 500, color: "#91e8ff" },
  { id: "spirit-burst", name: "Spirit Burst", detail: "Heavy, hard-hitting shot", damage: 4, cooldown: 760, speed: 410, range: 420, color: "#ff9c7a" },
  { id: "foxfire", name: "Foxfire", detail: "Fast shots, shorter reach", damage: 1, cooldown: 145, speed: 590, range: 310, color: "#ffc873" },
];
const HALLOWEEN_OUTFITS: Array<{ id: OutfitId; name: string; detail: string; color: string; trim: string }> = [
  { id: "night-guard", name: "Night Guard", detail: "Lantern-keeper cloak", color: "#6a4150", trim: "#efbd78" },
  { id: "oni-hunter", name: "Oni Hunter", detail: "Moonlit hunter armor", color: "#31546a", trim: "#9ae5dd" },
  { id: "starlight", name: "Starlight", detail: "Violet festival robe", color: "#634b8e", trim: "#e2baff" },
];
type DuoPlayer = {
  id: string; name: string; avatarUrl: string | null; weaponId: GunId; outfitId: OutfitId;
  x: number; y: number; directionX: number; directionY: number; isMoving: boolean; updatedAt: number;
};
type DuoQueueState = {
  status: "idle" | "waiting" | "matched" | "active" | "cancelled";
  islandId: string; countdown: number; players: DuoPlayer[]; you: string;
};
const EMPTY_DUO: DuoQueueState = { status: "idle", islandId: "pumpkin-harbor", countdown: 0, players: [], you: "" };

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
type Control = DirectionControl | "attack" | "roll" | "fire" | "interact";
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
  walking: boolean;
  walkPhase: number;
  weaponId: GunId;
  outfitId: OutfitId;
  nextShotAt: number;
}

interface Enemy {
  x: number;
  y: number;
  hp: number;
  phase: number;
  kind: "ghost" | "bat" | "brute";
  maxHp: number;
}

interface Candy {
  x: number;
  y: number;
  phase: number;
}

interface Projectile { x: number; y: number; directionX: number; directionY: number; speed: number; damage: number; rangeLeft: number; color: string; }
interface LootCrate { id: string; x: number; y: number; opened: boolean; loading?: boolean; }

interface GameState {
  player: Player;
  enemies: Enemy[];
  candies: Candy[];
  islandId: string;
  candyGoal: number;
  totalEnemies: number;
  candyCollected: number;
  kills: number;
  crates: LootCrate[];
  projectiles: Projectile[];
  sessionXp: number;
  sessionCoins: number;
}

interface InputState {
  held: Set<DirectionControl>;
  attackQueued: boolean;
  rollQueued: boolean;
  fireQueued: boolean;
  interactQueued: boolean;
}

interface WorldPlayer {
  id?: string;
  name: string;
  avatarUrl: string | null;
  islandId: string;
  x: number;
  y: number;
  outfitId?: OutfitId;
  weaponId?: GunId;
  directionX?: number;
  directionY?: number;
  isMoving?: boolean;
}

function createGame(islandId: string, weaponId: GunId = "moonshot", outfitId: OutfitId = "night-guard"): GameState {
  const islandIndex = Math.max(0, HALLOWEEN_ISLANDS.findIndex((island) => island.id === islandId));
  const island = HALLOWEEN_ISLANDS[islandIndex]!;
  const crateSpots = [[360, 1110], [690, 875], [930, 1190], [1190, 570], [1510, 1000], [1730, 390], [2070, 890], [2180, 250]] as const;
  return {
    islandId: island.id,
    candyGoal: island.candyGoal,
    totalEnemies: island.enemyCount,
    player: {
      x: 180, y: WORLD_HEIGHT - 170, hp: MAX_HEALTH,
      directionX: 0, directionY: -1, invulnerableUntil: 0,
      rollUntil: 0, rollCooldownUntil: 0, attackCooldownUntil: 0, swingUntil: 0,
      walking: false, walkPhase: 0, weaponId, outfitId, nextShotAt: 0,
    },
    enemies: Array.from({ length: island.enemyCount }, (_, index) => {
      const column = index % 6;
      const row = Math.floor(index / 6);
      const kind = index % 8 === 0 ? "brute" : (index + islandIndex) % 3 === 0 ? "bat" : "ghost";
      const hp = kind === "brute" ? 3 + Math.floor(islandIndex / 2) : islandIndex > 1 && index % 6 === 0 ? 2 : 1;
      return {
        x: 150 + column * 390 + ((row + islandIndex) % 2) * 80,
        y: 145 + row * 270 + ((column + islandIndex) % 2) * 38,
        hp, maxHp: hp, phase: index * 0.8, kind,
      };
    }),
    candies: [],
    crates: crateSpots.map(([x, y], index) => ({ id: "crate-" + (index + 1), x, y, opened: false })),
    projectiles: [],
    sessionXp: 0,
    sessionCoins: 0,
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
    fireQueued: false,
    interactQueued: false,
  });
  const selectedIslandRef = useRef<string>(firstIslandId);
  const rewardRequestRef = useRef(false);
  const startRequestRef = useRef(false);
  const worldCall = useServerFn(fetchHalloweenWorld);
  const presenceCall = useServerFn(heartbeatHalloweenWorld);
  const startIslandCall = useServerFn(startHalloweenIsland);
  const claimRewardCall = useServerFn(claimHalloweenReward);
  const joinDuoCall = useServerFn(joinHalloweenDuo);
  const pollDuoCall = useServerFn(fetchHalloweenDuoQueue);
  const cancelDuoCall = useServerFn(cancelHalloweenDuo);
  const duoHeartbeatCall = useServerFn(heartbeatHalloweenDuoMatch);
  const crateClaimCall = useServerFn(claimHalloweenCrate);
  const worldCallRef = useRef(worldCall);
  const presenceCallRef = useRef(presenceCall);
  const startIslandCallRef = useRef(startIslandCall);
  const claimRewardCallRef = useRef(claimRewardCall);
  const joinDuoCallRef = useRef(joinDuoCall);
  const pollDuoCallRef = useRef(pollDuoCall);
  const cancelDuoCallRef = useRef(cancelDuoCall);
  const duoHeartbeatCallRef = useRef(duoHeartbeatCall);
  const crateClaimCallRef = useRef(crateClaimCall);
  worldCallRef.current = worldCall;
  presenceCallRef.current = presenceCall;
  startIslandCallRef.current = startIslandCall;
  claimRewardCallRef.current = claimRewardCall;
  joinDuoCallRef.current = joinDuoCall;
  pollDuoCallRef.current = pollDuoCall;
  cancelDuoCallRef.current = cancelDuoCall;
  duoHeartbeatCallRef.current = duoHeartbeatCall;
  crateClaimCallRef.current = crateClaimCall;
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
  const [weaponId, setWeaponId] = useState<GunId>("moonshot");
  const [outfitId, setOutfitId] = useState<OutfitId>("night-guard");
  const [duoState, setDuoState] = useState<DuoQueueState>(EMPTY_DUO);
  const [duoError, setDuoError] = useState("");
  const [runXp, setRunXp] = useState(0);
  const [runCoins, setRunCoins] = useState(0);
  const [crateMessage, setCrateMessage] = useState("");
  const [duoPlayers, setDuoPlayers] = useState<DuoPlayer[]>([]);
  const duoStateRef = useRef(duoState);
  const duoPlayersRef = useRef(duoPlayers);
  const duoStartedRef = useRef(false);
  const crateBusyRef = useRef(false);
  const openCrateRef = useRef<() => void>(() => undefined);
  const startGameRef = useRef<(islandId?: string, fromDuo?: boolean) => Promise<void>>(async () => undefined);
  duoStateRef.current = duoState;
  duoPlayersRef.current = duoPlayers;

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

  const startGame = async (islandId: string = selectedIslandId, fromDuo = false) => {
    if (!fromDuo && (duoStateRef.current.status === "waiting" || duoStateRef.current.status === "matched")) {
      void cancelDuoCallRef.current();
      setDuoState(EMPTY_DUO);
    }
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
    gameRef.current = createGame(islandId, weaponId, outfitId);
    setRunXp(0);
    setRunCoins(0);
    setCrateMessage("");
    inputRef.current = {
      held: new Set<DirectionControl>(),
      attackQueued: false,
      rollQueued: false,
      fireQueued: false,
      interactQueued: false,
    };
    setHealth(MAX_HEALTH);
    setCandies(0);
    setKills(0);
    setScreen("playing");
  };

  startGameRef.current = startGame;

  const searchForDuo = async () => {
    if (duoState.status === "waiting" || duoState.status === "matched" || duoState.status === "active") return;
    setDuoError("");
    duoStartedRef.current = false;
    try {
      const next = await joinDuoCallRef.current({ data: { islandId: selectedIslandId, weaponId, outfitId } });
      setDuoState(next as DuoQueueState);
      if (next.status === "active") {
        duoStartedRef.current = true;
        await startGameRef.current(next.islandId, true);
      }
    } catch (error) {
      setDuoError(error instanceof Error ? error.message : "Matchmaking is unavailable right now.");
    }
  };

  const leaveDuoQueue = async () => {
    try { await cancelDuoCallRef.current(); } catch { /* the queue can expire while leaving */ }
    duoStartedRef.current = false;
    setDuoState(EMPTY_DUO);
    setDuoPlayers([]);
  };

  openCrateRef.current = () => {
    const game = gameRef.current;
    if (crateBusyRef.current || screenRef.current !== "playing") return;
    const target = game.crates
      .filter((crate) => !crate.opened)
      .sort((a, b) => Math.hypot(a.x - game.player.x, a.y - game.player.y) - Math.hypot(b.x - game.player.x, b.y - game.player.y))[0];
    if (!target || Math.hypot(target.x - game.player.x, target.y - game.player.y) > 82) {
      setCrateMessage("Move next to a glowing crate and press E to search it.");
      return;
    }
    crateBusyRef.current = true;
    target.opened = true;
    target.loading = true;
    setCrateMessage("Searching the haunted crate…");
    void crateClaimCallRef.current({ data: { islandId: game.islandId, crateId: target.id } })
      .then((reward) => {
        target.loading = false;
        game.sessionXp += reward.xp;
        game.sessionCoins += reward.coins;
        setRunXp(game.sessionXp);
        setRunCoins(game.sessionCoins);
        setWalletCoins(reward.balance);
        if (reward.gunId) {
          game.player.weaponId = reward.gunId;
          setWeaponId(reward.gunId);
          setCrateMessage("Cache opened: +" + reward.xp + " XP · +" + formatHalloweenCoins(reward.coins) + " · new gun: " + (HALLOWEEN_GUNS.find((gun) => gun.id === reward.gunId)?.name ?? "Spirit gun") + "!");
        } else {
          setCrateMessage("Cache opened: +" + reward.xp + " XP · +" + formatHalloweenCoins(reward.coins) + ". Keep moving!");
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "The crate could not be opened. Try again.";
        target.opened = message.toLowerCase().includes("already claimed");
        target.loading = false;
        setCrateMessage(message);
      })
      .finally(() => { crateBusyRef.current = false; });
  };

  useEffect(() => {
    let disposed = false;
    let busy = false;
    const poll = async () => {
      if (busy || document.visibilityState === "hidden") return;
      const current = duoStateRef.current;
      if (current.status === "idle" || current.status === "cancelled") return;
      busy = true;
      try {
        const next = await pollDuoCallRef.current() as DuoQueueState;
        if (disposed) return;
        setDuoState(next);
        if (next.status === "active") setSelectedIslandId(next.islandId);
      } catch (error) {
        if (!disposed) setDuoError(error instanceof Error ? error.message : "Lost connection to matchmaking.");
      } finally { busy = false; }
    };
    void pollDuoCallRef.current().then((state) => {
      if (!disposed && state.status !== "idle") {
        setDuoState(state as DuoQueueState);
        if (state.status === "active") setSelectedIslandId(state.islandId);
      }
    }).catch(() => undefined);
    const timer = window.setInterval(() => void poll(), 700);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (duoState.status !== "active" || duoStartedRef.current || screen === "loading" || !unlockedIslandIds.includes(duoState.islandId)) return;
    duoStartedRef.current = true;
    setSelectedIslandId(duoState.islandId);
    void startGameRef.current(duoState.islandId, true);
  }, [duoState.status, duoState.islandId, screen, unlockedIslandIds]);

  useEffect(() => {
    if (screen !== "playing" || duoState.status !== "active") return;
    let disposed = false;
    let busy = false;
    const syncDuo = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      const player = gameRef.current.player;
      try {
        const next = await duoHeartbeatCallRef.current({ data: {
          x: clamp(player.x / WORLD_WIDTH, 0, 1), y: clamp(player.y / WORLD_HEIGHT, 0, 1),
          directionX: player.directionX, directionY: player.directionY, isMoving: player.walking,
        } });
        if (!disposed) {
          const state = next as DuoQueueState;
          setDuoPlayers(state.players.filter((peer) => peer.id !== state.you));
          setDuoState(state);
        }
      } catch (error) {
        if (!disposed) setDuoError(error instanceof Error ? error.message : "Your duo partner connection was lost.");
      } finally { busy = false; }
    };
    void syncDuo();
    const timer = window.setInterval(() => void syncDuo(), 700);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [screen, duoState.status]);

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
        if (inputRef.current.interactQueued) {
          inputRef.current.interactQueued = false;
          openCrateRef.current();
        }
        const hudKey = `${game.player.hp}:${game.candyCollected}:${game.kills}:${game.sessionXp}:${game.sessionCoins}:${game.player.weaponId}`;
        if (hudKey !== lastHudKey) {
          lastHudKey = hudKey;
          setHealth(game.player.hp);
          setCandies(game.candyCollected);
          setKills(game.kills);
          setRunXp(game.sessionXp);
          setRunCoins(game.sessionCoins);
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
        [
          ...onlinePlayersRef.current.filter((player) => player.islandId === game.islandId),
          ...duoPlayersRef.current.map((peer) => ({ ...peer, islandId: game.islandId })),
        ],
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
      } else if ((key === "g" || key === "f") && !event.repeat) {
        event.preventDefault();
        inputRef.current.fireQueued = true;
      } else if (key === "e" && !event.repeat) {
        event.preventDefault();
        inputRef.current.interactQueued = true;
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
    else if (control === "fire") inputRef.current.fireQueued = true;
    else if (control === "interact") inputRef.current.interactQueued = true;
    else inputRef.current.held.add(control);
  };

  const releaseControl = (control: Control) => {
    if (control !== "attack" && control !== "roll" && control !== "fire" && control !== "interact") inputRef.current.held.delete(control);
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
      ) : control === "fire" ? (
        <><span className="knight-action-glyph" aria-hidden="true">✧</span><span className="knight-action-label">FIRE</span></>
      ) : control === "interact" ? (
        <><span className="knight-action-glyph" aria-hidden="true">⌕</span><span className="knight-action-label">SEARCH</span></>
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
              <p className="knight-map-instruction">Pick an island, then queue for exactly one teammate—or launch solo.</p>
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

          <section className="knight-loadout" aria-label="Halloween duo loadout">
            <div className="knight-loadout-copy">
              <p className="knight-eyebrow">DRESS FOR THE DARK</p>
              <h3>Pick your gear</h3>
              <p>Find exactly one teammate. The island starts automatically after a five-second countdown.</p>
            </div>
            <div className="knight-loadout-group">
              <span className="knight-loadout-label">SPIRIT GUN</span>
              <div className="knight-loadout-options">
                {HALLOWEEN_GUNS.map((gun) => (
                  <button key={gun.id} type="button" className={"knight-gear-card" + (weaponId === gun.id ? " is-selected" : "")} disabled={duoState.status === "waiting" || duoState.status === "matched" || duoState.status === "active"} onClick={() => setWeaponId(gun.id)} aria-pressed={weaponId === gun.id}>
                    <span className="knight-gear-icon" style={{ color: gun.color }}>✦</span><strong>{gun.name}</strong><small>{gun.detail}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="knight-loadout-group">
              <span className="knight-loadout-label">OUTFIT</span>
              <div className="knight-loadout-options">
                {HALLOWEEN_OUTFITS.map((outfit) => (
                  <button key={outfit.id} type="button" className={"knight-gear-card knight-outfit-card" + (outfitId === outfit.id ? " is-selected" : "")} disabled={duoState.status === "waiting" || duoState.status === "matched" || duoState.status === "active"} onClick={() => setOutfitId(outfit.id)} aria-pressed={outfitId === outfit.id}>
                    <span className="knight-outfit-swatch" style={{ background: outfit.color, borderColor: outfit.trim }} /><strong>{outfit.name}</strong><small>{outfit.detail}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="knight-duo-bar">
              <div className="knight-duo-status" aria-live="polite">
                <strong>{duoState.status === "waiting" ? "Finding one teammate…" : duoState.status === "matched" ? "Duo found · starting in " + duoState.countdown + "s" : duoState.status === "active" ? "Your two-player team is in the island" : "Team up for the haunted run"}</strong>
                <span>{duoError || (duoState.players.length === 2 ? duoState.players.map((peer) => peer.name).join(" + ") : "Teams are always two. Both players enter when the five-second countdown ends.")}</span>
              </div>
              {duoState.status === "waiting" || duoState.status === "matched" ? (
                <button type="button" className="knight-duo-button is-cancel" onClick={() => void leaveDuoQueue()}>Leave queue</button>
              ) : duoState.status === "active" ? (
                <button type="button" className="knight-duo-button is-cancel" onClick={() => void leaveDuoQueue()}>Leave duo</button>
              ) : (
                <button type="button" className="knight-duo-button" onClick={() => void searchForDuo()} disabled={starting || !unlockedIslandIds.includes(selectedIslandId)}>Find 1 teammate</button>
              )}
            </div>
          </section>

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
            <p className="knight-how-to-play">WASD / arrows · G fire · E search crates · K dodge</p>
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
            <span className="knight-stat" aria-label={`${runXp} XP collected`}><span aria-hidden="true">✦</span> {runXp} XP</span>
            <span className="knight-stat" aria-label={`${runCoins} coins found`}><span aria-hidden="true">◉</span> {formatHalloweenCoins(runCoins)}</span>
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
            aria-label={`Large scrolling haunted world on ${selectedIsland.name}. Move, fire your selected spirit gun, search crates and collect ${selectedIsland.candyGoal} sweets.`}
          />
          {isPlaying && crateMessage && <div className="knight-loot-message" role="status">{crateMessage}</div>}
          {isPlaying && duoState.status === "active" && duoPlayers.length > 0 && <div className="knight-duo-game-badge">DUO · {duoPlayers[0]!.name}</div>}
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
                {controlButton("fire", "Fire selected spirit gun", "knight-action-button knight-fire-button")}
                {controlButton("interact", "Search the nearby crate", "knight-action-button knight-search-button")}
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

function halloweenTrees() {
  return Array.from({ length: 34 }, (_, i) => ({
    x: 70 + ((i * 173 + 53) % (WORLD_WIDTH - 140)),
    y: 70 + ((i * 229 + 91) % (WORLD_HEIGHT - 140)),
  }));
}

function canStandAt(x: number, y: number) {
  if (x < 38 || x > WORLD_WIDTH - 38 || y < 80 || y > WORLD_HEIGHT - 38) return false;
  return halloweenTrees().every((tree) => Math.hypot(x - tree.x, y - (tree.y + 48)) > 34);
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
    if (!magnitude) { x = player.directionX; y = player.directionY; }
    player.directionX = x;
    player.directionY = y;
    player.rollUntil = now + 240;
    player.rollCooldownUntil = now + 1_100;
    player.invulnerableUntil = player.rollUntil + 140;
  }
  input.rollQueued = false;

  const rolling = now < player.rollUntil;
  const speed = rolling ? 350 : 165;
  const moveX = rolling ? player.directionX : x;
  const moveY = rolling ? player.directionY : y;
  const previousX = player.x;
  const previousY = player.y;
  if (rolling || magnitude > 0) {
    const nextX = clamp(player.x + moveX * speed * delta, 38, WORLD_WIDTH - 38);
    const nextY = clamp(player.y + moveY * speed * delta, 80, WORLD_HEIGHT - 38);
    if (canStandAt(nextX, player.y)) player.x = nextX;
    if (canStandAt(player.x, nextY)) player.y = nextY;
  }
  player.walking = Math.hypot(player.x - previousX, player.y - previousY) > 0.15 && !rolling;
  if (player.walking || rolling) player.walkPhase += delta * (rolling ? 18 : 13);

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

  if (input.fireQueued && now >= player.nextShotAt) {
    const gun = HALLOWEEN_GUNS.find((item) => item.id === player.weaponId) ?? HALLOWEEN_GUNS[0]!;
    player.nextShotAt = now + gun.cooldown;
    game.projectiles.push({
      x: player.x + player.directionX * 19, y: player.y + player.directionY * 19,
      directionX: player.directionX, directionY: player.directionY,
      speed: gun.speed, damage: gun.damage, rangeLeft: gun.range, color: gun.color,
    });
  }
  input.fireQueued = false;

  for (const projectile of game.projectiles) {
    const step = projectile.speed * delta;
    projectile.x += projectile.directionX * step;
    projectile.y += projectile.directionY * step;
    projectile.rangeLeft -= step;
    for (const enemy of game.enemies) {
      if (enemy.hp > 0 && Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y) < (enemy.kind === "brute" ? 35 : 24)) {
        enemy.hp -= projectile.damage;
        projectile.rangeLeft = -1;
        if (enemy.hp <= 0) {
          game.candies.push({ x: enemy.x, y: enemy.y, phase: enemy.phase });
          game.kills += 1;
        }
        break;
      }
    }
  }
  game.projectiles = game.projectiles.filter((projectile) => projectile.rangeLeft > 0);
  game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);

  for (const enemy of game.enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const approach = enemy.kind === "brute" ? 46 : enemy.kind === "bat" ? 42 : 31;
    const enemySpeed = enemy.kind === "brute" ? 23 + Math.min(10, Math.floor(game.totalEnemies / 3)) : enemy.kind === "bat" ? 46 : 34;
    if (distance > approach) {
      enemy.x += (dx / distance) * enemySpeed * delta;
      enemy.y += (dy / distance) * enemySpeed * delta;
    }
    enemy.phase += delta * (enemy.kind === "bat" ? 8 : enemy.kind === "brute" ? 1.3 : 3);
    const contactDistance = enemy.kind === "brute" ? 43 : 34;
    if (distance < contactDistance && now >= player.invulnerableUntil) {
      player.hp -= enemy.kind === "brute" ? 2 : 1;
      player.invulnerableUntil = now + (enemy.kind === "brute" ? 1_150 : 900);
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
  for (const crate of game.crates) drawLootCrate(ctx, crate, game.player, now);
  for (const candy of game.candies) drawCandy(ctx, candy);
  for (const projectile of game.projectiles) {
    ctx.save();
    ctx.strokeStyle = projectile.color;
    ctx.lineWidth = 4;
    ctx.shadowBlur = 15;
    ctx.shadowColor = projectile.color;
    ctx.beginPath();
    ctx.moveTo(projectile.x - projectile.directionX * 8, projectile.y - projectile.directionY * 8);
    ctx.lineTo(projectile.x + projectile.directionX * 10, projectile.y + projectile.directionY * 10);
    ctx.stroke();
    ctx.restore();
  }
  for (const enemy of game.enemies) drawEnemy(ctx, enemy, now);
  for (const player of otherPlayers) {
    drawOtherPlayer(
      ctx, player,
      clamp(player.x * WORLD_WIDTH, 38, WORLD_WIDTH - 38),
      clamp(player.y * WORLD_HEIGHT, 80, WORLD_HEIGHT - 38),
      now,
    );
  }
  drawKnight(ctx, game.player, now);
  drawPlayerName(ctx, playerName, game.player.x, game.player.y - 50);
  ctx.restore();
}

function drawLootCrate(ctx: CanvasRenderingContext2D, crate: LootCrate, player: Player, now: number) {
  const distance = Math.hypot(crate.x - player.x, crate.y - player.y);
  ctx.save();
  ctx.translate(crate.x, crate.y);
  ctx.fillStyle = crate.opened ? "rgba(0,0,0,.35)" : "rgba(255,120,85,.2)";
  ctx.beginPath(); ctx.ellipse(0, 11, 24, 9, 0, 0, Math.PI * 2); ctx.fill();
  if (!crate.opened) {
    const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 34 + Math.sin(now / 260) * 3);
    glow.addColorStop(0, "rgba(255,177,108,.36)"); glow.addColorStop(1, "rgba(255,92,71,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = crate.opened ? "#48433f" : "#66452f";
  ctx.fillRect(-16, -10, 32, 23);
  ctx.fillStyle = crate.opened ? "#2d3231" : "#a97743";
  ctx.fillRect(-18, -13, 36, 9);
  ctx.fillStyle = "#d5b978"; ctx.fillRect(-3, -8, 6, 13);
  ctx.strokeStyle = "rgba(20,14,16,.75)"; ctx.lineWidth = 2; ctx.strokeRect(-16, -10, 32, 23);
  if (distance < 110 && !crate.opened) {
    ctx.font = "700 11px Poppins, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#ffe4ad";
    ctx.fillText(distance < 82 ? "E · SEARCH" : "CRATE", 0, -23);
  }
  if (crate.loading) {
    ctx.fillStyle = "#fff0b5"; ctx.font = "700 10px Poppins, sans-serif"; ctx.textAlign = "center"; ctx.fillText("SEARCHING…", 0, -27);
  }
  ctx.restore();
}

function drawOtherPlayer(ctx: CanvasRenderingContext2D, player: WorldPlayer, x: number, y: number, now: number) {
  const outfit = HALLOWEEN_OUTFITS.find((item) => item.id === player.outfitId) ?? HALLOWEEN_OUTFITS[0]!;
  const stride = player.isMoving ? Math.sin(now / 65) * 4 : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,.42)"; ctx.beginPath(); ctx.ellipse(0, 12, 17, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#24202b"; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-5, 4); ctx.lineTo(-6 + stride, 11); ctx.moveTo(5, 4); ctx.lineTo(6 - stride, 11); ctx.stroke();
  ctx.fillStyle = outfit.color; ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-13, 6); ctx.quadraticCurveTo(0, 12, 13, 6); ctx.lineTo(10, -4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#f2d5c1"; ctx.beginPath(); ctx.arc(0, -11, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = outfit.trim; ctx.beginPath(); ctx.moveTo(-9, -12); ctx.lineTo(-7, -22); ctx.lineTo(-1, -16); ctx.lineTo(4, -23); ctx.lineTo(10, -11); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#3b263f"; ctx.fillRect(-4, -11, 2, 2); ctx.fillRect(3, -11, 2, 2);
  ctx.restore();
  drawPlayerName(ctx, player.name, x, y - 34);
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

  for (const tree of halloweenTrees()) drawTree(ctx, tree.x, tree.y, now);
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
  ctx.fillStyle = "rgba(4,8,11,.5)"; ctx.beginPath(); ctx.ellipse(0, 61, 34, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#161b1d"; ctx.fillRect(-7, 4, 14, 65);
  ctx.strokeStyle = "#111619"; ctx.lineWidth = 7; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-2, 28); ctx.lineTo(-22, 13); ctx.lineTo(-34, 16); ctx.moveTo(2, 19); ctx.lineTo(22, 3); ctx.lineTo(34, 5); ctx.moveTo(-1, 43); ctx.lineTo(-25, 34); ctx.moveTo(2, 38); ctx.lineTo(26, 24); ctx.stroke();
  ctx.fillStyle = "#0d1417"; ctx.beginPath(); ctx.moveTo(0,-54); ctx.lineTo(-38,10); ctx.lineTo(-16,4); ctx.lineTo(-46,39); ctx.lineTo(-14,32); ctx.lineTo(-27,60); ctx.lineTo(27,60); ctx.lineTo(14,32); ctx.lineTo(46,39); ctx.lineTo(16,4); ctx.lineTo(38,10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(111,33,48,.28)"; ctx.beginPath(); ctx.moveTo(-15,14); ctx.lineTo(-35,34); ctx.lineTo(-17,28); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,91,78,.42)"; ctx.beginPath(); ctx.arc(Math.sin(now / 900 + x) * 3, 10, 2, 0, Math.PI * 2); ctx.fill();
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
  const outfit = HALLOWEEN_OUTFITS.find((item) => item.id === player.outfitId) ?? HALLOWEEN_OUTFITS[0]!;
  const gun = HALLOWEEN_GUNS.find((item) => item.id === player.weaponId) ?? HALLOWEEN_GUNS[0]!;
  const stride = player.walking ? Math.sin(player.walkPhase) * 5 : now < player.rollUntil ? Math.sin(now / 22) * 3 : 0;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = "rgba(0,0,0,.48)"; ctx.beginPath(); ctx.ellipse(0, 12, 18, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#241f2c"; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-5, 3); ctx.lineTo(-6 + stride, 12); ctx.moveTo(5, 3); ctx.lineTo(6 - stride, 12); ctx.stroke();
  ctx.fillStyle = outfit.color; ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(-14, 5); ctx.quadraticCurveTo(0, 13, 14, 5); ctx.lineTo(10, -6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = outfit.trim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(0, 8); ctx.lineTo(7, 0); ctx.stroke();
  ctx.fillStyle = "#f1d8c7"; ctx.beginPath(); ctx.arc(0, -11, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = outfit.trim; ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(-8, -24); ctx.lineTo(-2, -16); ctx.lineTo(4, -26); ctx.lineTo(9, -15); ctx.lineTo(11, -10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#271e32"; ctx.fillRect(-5, -11, 3, 3); ctx.fillRect(3, -11, 3, 3);
  ctx.fillStyle = "#ffced7"; ctx.fillRect(-4, -5, 8, 1);
  const angle = Math.atan2(player.directionY, player.directionX);
  if (now < player.swingUntil) {
    ctx.save(); ctx.rotate(angle); ctx.strokeStyle = "rgba(255,223,142,.82)"; ctx.lineWidth = 13; ctx.beginPath(); ctx.arc(9, 0, 34, -0.72, 0.72); ctx.stroke(); ctx.restore();
  }
  ctx.save(); ctx.translate(player.directionX * 9, player.directionY * 2 - 3); ctx.rotate(angle);
  ctx.fillStyle = gun.color; ctx.shadowBlur = 8; ctx.shadowColor = gun.color; ctx.fillRect(1, -2, 19, 5); ctx.shadowBlur = 0; ctx.fillStyle = "#392a3c"; ctx.fillRect(5, 2, 5, 6); ctx.restore();
  if (now < player.nextShotAt && now > player.nextShotAt - gun.cooldown + 80) {
    ctx.fillStyle = gun.color; ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(player.directionX * 25, player.directionY * 25, 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, now: number) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.fillStyle = "rgba(0,0,0,.42)";
  ctx.beginPath(); ctx.ellipse(0, 15, enemy.kind === "brute" ? 25 : 16, 7, 0, 0, Math.PI * 2); ctx.fill();
  if (enemy.kind === "brute") {
    const pulse = 1 + Math.sin(now / 240 + enemy.phase) * 0.05;
    ctx.scale(pulse, 1 / pulse);
    ctx.fillStyle = "#30212f"; ctx.beginPath(); ctx.moveTo(-22, 8); ctx.lineTo(-26, -12); ctx.lineTo(-18, -31); ctx.lineTo(-8, -38); ctx.lineTo(0, -33); ctx.lineTo(8, -38); ctx.lineTo(18, -31); ctx.lineTo(26, -12); ctx.lineTo(22, 8); ctx.quadraticCurveTo(0, 21, -22, 8); ctx.fill();
    ctx.fillStyle = "#9f354b"; ctx.beginPath(); ctx.moveTo(-15, -30); ctx.lineTo(-25, -47); ctx.lineTo(-7, -37); ctx.moveTo(15, -30); ctx.lineTo(25, -47); ctx.lineTo(7, -37); ctx.fill();
    ctx.fillStyle = "#ff644e"; ctx.shadowBlur = 12; ctx.shadowColor = "#ff392e"; ctx.fillRect(-12, -24, 7, 4); ctx.fillRect(5, -24, 7, 4); ctx.shadowBlur = 0;
    ctx.strokeStyle = "#e59b66"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, -9); ctx.lineTo(8, -9); ctx.stroke();
    ctx.fillStyle = "#9d3547"; ctx.fillRect(-18, 5, 36, 5);
    ctx.fillStyle = "#ffb269"; ctx.fillRect(-18, -48, 36, 4);
    ctx.fillStyle = "#6af0cb"; ctx.fillRect(-18, -48, 36 * Math.max(0, enemy.hp / enemy.maxHp), 4);
  } else if (enemy.kind === "bat") {
    const flap = Math.sin(enemy.phase * 2) * 9;
    ctx.fillStyle = "#49364f"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-18, -19 - flap, -26, -3); ctx.quadraticCurveTo(-14, -3, -8, 7); ctx.quadraticCurveTo(0, 3, 8, 7); ctx.quadraticCurveTo(14, -3, 26, -3); ctx.quadraticCurveTo(18, -19 + flap, 0, 0); ctx.fill();
    ctx.fillStyle = "#fa7c69"; ctx.fillRect(-5, -3, 3, 3); ctx.fillRect(2, -3, 3, 3);
  } else {
    ctx.fillStyle = "rgba(193,207,232,.9)"; ctx.beginPath(); ctx.moveTo(-15, 7); ctx.quadraticCurveTo(-23, -11, -11, -20); ctx.quadraticCurveTo(0, -31, 11, -20); ctx.quadraticCurveTo(23, -11, 15, 7); ctx.lineTo(7, 1); ctx.lineTo(0, 8); ctx.lineTo(-7, 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ff4f63"; ctx.fillRect(-8, -12, 4, 5); ctx.fillRect(4, -12, 4, 5);
    ctx.fillStyle = "rgba(202,226,255,.45)"; ctx.beginPath(); ctx.arc(-6, -7, 2, 0, Math.PI * 2); ctx.arc(6, -7, 2, 0, Math.PI * 2); ctx.fill();
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
