import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "./session";
import { enableHalloweenAudio, playHalloweenSound, setHalloweenAudioScene } from "@/lib/halloween-audio";
import {
  cancelHalloweenDuo,
  claimHalloweenCrate,
  claimHalloweenReward,
  fetchHalloweenDuoQueue,
  fetchHalloweenWorld,
  heartbeatHalloweenDuoMatch,
  heartbeatHalloweenWorld,
  joinHalloweenDuo,
  sendHalloweenDuoInvitation,
  respondToHalloweenDuoInvitation,
  readyHalloweenDuo,
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
const WORLD_WIDTH = 3_200;
const WORLD_HEIGHT = 1_900;
const MAX_HEALTH = 6;
const READY_DURATION_MS = 1_350;
const INTRO_DURATION_MS = 2_800;

type GunId = "moonshot" | "spirit-burst" | "foxfire";
type OutfitId = "night-guard" | "oni-hunter" | "starlight";
const HALLOWEEN_GUNS: Array<{ id: GunId; name: string; detail: string; damage: number; cooldown: number; speed: number; range: number; color: string; ammoCapacity: number }> = [
  { id: "moonshot", name: "Moonshot", detail: "Balanced · 24 rounds", damage: 2, cooldown: 390, speed: 520, range: 500, color: "#91e8ff", ammoCapacity: 24 },
  { id: "spirit-burst", name: "Spirit Burst", detail: "Heavy · 10 rounds", damage: 4, cooldown: 760, speed: 410, range: 420, color: "#ff9c7a", ammoCapacity: 10 },
  { id: "foxfire", name: "Foxfire", detail: "Fast · 40 rounds", damage: 1, cooldown: 145, speed: 590, range: 310, color: "#ffc873", ammoCapacity: 40 },
];
const HALLOWEEN_OUTFITS: Array<{ id: OutfitId; name: string; detail: string; color: string; trim: string }> = [
  { id: "night-guard", name: "Night Guard", detail: "Lantern-keeper cloak", color: "#6a4150", trim: "#efbd78" },
  { id: "oni-hunter", name: "Oni Hunter", detail: "Moonlit hunter armor", color: "#31546a", trim: "#9ae5dd" },
  { id: "starlight", name: "Starlight", detail: "Violet festival robe", color: "#634b8e", trim: "#e2baff" },
];
type DuoPlayer = {
  id: string; name: string; avatarUrl: string | null; weaponId: GunId; outfitId: OutfitId; ready: boolean;
  x: number; y: number; directionX: number; directionY: number; isMoving: boolean; updatedAt: number;
};
type DuoInvite = { id: string; fromName: string; islandId: string; expiresAt: number };
type DuoQueueState = {
  status: "idle" | "waiting" | "matched" | "active" | "cancelled";
  islandId: string; countdown: number; players: DuoPlayer[]; you: string; incomingInvites?: DuoInvite[];
};
const EMPTY_DUO: DuoQueueState = { status: "idle", islandId: "pumpkin-harbor", countdown: 0, players: [], you: "", incomingInvites: [] };

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

type Screen = "loading" | "start" | "map" | "sailing" | "playing" | "won" | "lost";
type DirectionControl = "up" | "down" | "left" | "right";
type Control = DirectionControl | "attack" | "roll" | "fire" | "interact";
type HalloweenRewardCard = Pick<
  OwnedCard,
  "cardId" | "name" | "tier" | "series" | "media" | "mediaType" | "spawnId"
>;

interface WeaponInventoryItem { id: GunId; ammo: number; }

interface Player {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  directionX: number;
  directionY: number;
  invulnerableUntil: number;
  rollUntil: number;
  rollCooldownUntil: number;
  attackCooldownUntil: number;
  swingUntil: number;
  walking: boolean;
  swimming: boolean;
  walkPhase: number;
  weaponId: GunId;
  weapons: WeaponInventoryItem[];
  outfitId: OutfitId;
  ammo: number;
  maxAmmo: number;
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

interface Projectile { x: number; y: number; directionX: number; directionY: number; speed: number; damage: number; rangeLeft: number; color: string; weaponId: GunId; }
interface LootCrate { id: string; x: number; y: number; opened: boolean; weaponId: GunId; loading?: boolean; }
interface Explosion { x: number; y: number; radius: number; color: string; startedAt: number; }

interface House { id: string; name: string; x: number; y: number; width: number; height: number; doorX: number; doorY: number; }
interface IslandNpc { id: string; name: string; role: string; x: number; y: number; rescued: boolean; }

const HOUSE_LAYOUT: House[] = [
  { id: "lantern-inn", name: "Lantern Inn", x: 470, y: 500, width: 230, height: 154, doorX: 585, doorY: 680 },
  { id: "witch-cottage", name: "Witchlight Cottage", x: 1_460, y: 390, width: 250, height: 164, doorX: 1_585, doorY: 580 },
  { id: "harbor-house", name: "Harbor House", x: 2_520, y: 1_170, width: 250, height: 164, doorX: 2_645, doorY: 1_360 },
];

const ISLAND_RESCUES: Record<string, Array<{ name: string; role: string; x: number; y: number }>> = {
  "pumpkin-harbor": [{ name: "Mina", role: "Lantern keeper", x: 910, y: 760 }, { name: "Taro", role: "Lost sailor", x: 2_140, y: 510 }],
  "witchlight-woods": [{ name: "Nori", role: "Forest guide", x: 910, y: 760 }, { name: "Kiri", role: "Herb gatherer", x: 2_140, y: 510 }],
  "moonlit-marsh": [{ name: "Suzu", role: "Marsh watcher", x: 910, y: 760 }, { name: "Ren", role: "Missing courier", x: 2_140, y: 510 }],
  "haunted-citadel": [{ name: "Aki", role: "Castle cook", x: 910, y: 760 }, { name: "Yuna", role: "Runaway squire", x: 2_140, y: 510 }],
  "phantom-crown": [{ name: "Haru", role: "Crown islander", x: 910, y: 760 }, { name: "Emi", role: "Shipwright", x: 2_140, y: 510 }],
};

type TreeStyle = "windswept-pine" | "witchwood" | "willow" | "deadwood" | "crystal";
type LandmarkStyle = "pier" | "mushroom-ring" | "moonwell" | "bell-tower" | "star-crater";

interface IslandRiver { name: string; points: Array<[number, number]>; width: number; }
interface IslandFeatures {
  biome: string; landmark: string; landmarkStyle: LandmarkStyle; landmarkX: number; landmarkY: number;
  treeStyle: TreeStyle; treeCount: number; accent: string; trail: Array<[number, number]>; river?: IslandRiver;
}

const ISLAND_FEATURES: Record<string, IslandFeatures> = {
  "pumpkin-harbor": {
    biome: "Tideglass Coast", landmark: "Lantern Pier", landmarkStyle: "pier", landmarkX: 1_360, landmarkY: 260,
    treeStyle: "windswept-pine", treeCount: 42, accent: "#ffc273",
    trail: [[100, 1_300], [480, 1_150], [820, 1_000], [1_020, 730], [1_340, 590], [1_850, 470], [3_100, 270]],
    river: { name: "Tideglass Run", points: [[320, -80], [520, 170], [875, 330], [990, 580], [770, 860], [800, 1_100], [1_050, 1_360], [1_010, 1_630], [1_160, 1_980]], width: 104 },
  },
  "witchlight-woods": {
    biome: "Witchlight Canopy", landmark: "Mooncap Circle", landmarkStyle: "mushroom-ring", landmarkX: 2_260, landmarkY: 720,
    treeStyle: "witchwood", treeCount: 58, accent: "#d7a8ff",
    trail: [[100, 1_420], [430, 1_220], [760, 1_050], [1_100, 900], [1_430, 690], [1_860, 620], [2_260, 720], [3_080, 360]],
  },
  "moonlit-marsh": {
    biome: "Moonmoss Fen", landmark: "Moonmoss Pools", landmarkStyle: "moonwell", landmarkX: 2_270, landmarkY: 1_070,
    treeStyle: "willow", treeCount: 48, accent: "#a8e7e5",
    trail: [[100, 1_500], [420, 1_360], [780, 1_100], [1_120, 980], [1_560, 1_060], [1_940, 1_100], [2_270, 1_070], [3_080, 1_360]],
    river: { name: "Moonmoss Channel", points: [[460, -70], [680, 200], [890, 470], [760, 710], [1_020, 980], [1_280, 1_210], [1_180, 1_490], [1_430, 1_720], [1_530, 1_980]], width: 138 },
  },
  "haunted-citadel": {
    biome: "Cinderstone Ramparts", landmark: "Hollow Bell Tower", landmarkStyle: "bell-tower", landmarkX: 2_240, landmarkY: 600,
    treeStyle: "deadwood", treeCount: 30, accent: "#ffad86",
    trail: [[100, 1_330], [500, 1_180], [830, 980], [1_160, 810], [1_500, 620], [1_850, 610], [2_240, 600], [3_080, 960]],
  },
  "phantom-crown": {
    biome: "Starfall Expanse", landmark: "Fallen Star Crater", landmarkStyle: "star-crater", landmarkX: 2_080, landmarkY: 1_420,
    treeStyle: "crystal", treeCount: 26, accent: "#b6a6ff",
    trail: [[100, 1_500], [430, 1_300], [800, 1_160], [1_180, 1_200], [1_520, 1_340], [1_820, 1_520], [2_080, 1_420], [3_100, 1_020]],
  },
};

function getIslandFeatures(islandId: string): IslandFeatures {
  return ISLAND_FEATURES[islandId] ?? ISLAND_FEATURES[HALLOWEEN_ISLANDS[0].id]!;
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
  crates: LootCrate[];
  projectiles: Projectile[];
  explosions: Explosion[];
  sessionXp: number;
  sessionCoins: number;
  soloMode: boolean;
  duoMode: boolean;
  houses: House[];
  npcs: IslandNpc[];
  insideHouseId: string | null;
  nextHouseHealAt: number;
  rescuedNpcCount: number;
}

interface InputState {
  held: Set<DirectionControl>;
  attackQueued: boolean;
  rollQueued: boolean;
  fireQueued: boolean;
  interactQueued: boolean;
  switchQueued: boolean;
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

function createGame(islandId: string, weaponId: GunId = "moonshot", outfitId: OutfitId = "night-guard", soloMode = false, duoMode = false): GameState {
  const islandIndex = Math.max(0, HALLOWEEN_ISLANDS.findIndex((island) => island.id === islandId));
  const island = HALLOWEEN_ISLANDS[islandIndex]!;
  const gun = HALLOWEEN_GUNS.find((item) => item.id === weaponId) ?? HALLOWEEN_GUNS[0]!;
  const enemyCount = soloMode ? Math.min(36, Math.ceil(island.enemyCount * 1.25)) : duoMode ? Math.ceil(island.enemyCount * 1.5) : island.enemyCount;
  const candyGoal = duoMode ? island.candyGoal + Math.ceil(island.candyGoal * 0.5) : island.candyGoal;
  const crateSpots = [[430, 1560], [750, 1120], [1_250, 1_510], [1_610, 610], [2_170, 1_360], [2_690, 600], [2_950, 1_100], [1_050, 330]] as const;
  return {
    islandId: island.id,
    candyGoal,
    totalEnemies: enemyCount,
    soloMode,
    duoMode,
    houses: HOUSE_LAYOUT.map((house) => ({ ...house })),
    npcs: (ISLAND_RESCUES[island.id] ?? []).map((npc, index) => ({ ...npc, id: island.id + "-npc-" + (index + 1), rescued: false })),
    insideHouseId: null,
    nextHouseHealAt: 0,
    rescuedNpcCount: 0,
    player: {
      x: 180, y: WORLD_HEIGHT - 170, hp: soloMode ? 4 : MAX_HEALTH, maxHp: soloMode ? 4 : MAX_HEALTH,
      directionX: 0, directionY: -1, invulnerableUntil: 0,
      rollUntil: 0, rollCooldownUntil: 0, attackCooldownUntil: 0, swingUntil: 0,
      walking: false, swimming: false, walkPhase: 0, weaponId, weapons: [{ id: weaponId, ammo: gun.ammoCapacity }], outfitId, ammo: gun.ammoCapacity, maxAmmo: gun.ammoCapacity, nextShotAt: 0,
    },
    enemies: Array.from({ length: enemyCount }, (_, index) => {
      const column = index % 8;
      const row = Math.floor(index / 8);
      const kind = index % 8 === 0 ? "brute" : (index + islandIndex) % 3 === 0 ? "bat" : "ghost";
      const hp = kind === "brute" ? 3 + Math.floor(islandIndex / 2) : islandIndex > 1 && index % 6 === 0 ? 2 : 1;
      return {
        x: 170 + column * 400 + ((row + islandIndex) % 2) * 80,
        y: Math.min(WORLD_HEIGHT - 100, 150 + row * 330 + ((column + islandIndex) % 2) * 38),
        hp: soloMode ? Math.ceil(hp * 1.15) : hp,
        maxHp: soloMode ? Math.ceil(hp * 1.15) : hp,
        phase: index * 0.8,
        kind,
      };
    }),
    candies: [],
    crates: crateSpots.map(([x, y], index) => ({ id: "crate-" + (index + 1), x, y, opened: false, weaponId: HALLOWEEN_GUNS[(index + islandIndex + 1) % HALLOWEEN_GUNS.length]!.id })),
    projectiles: [],
    explosions: [],
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
    switchQueued: false,
  });
  const selectedIslandRef = useRef<string>(firstIslandId);
  const rewardRequestRef = useRef(false);
  const startRequestRef = useRef(false);
  const worldCall = useServerFn(fetchHalloweenWorld);
  const presenceCall = useServerFn(heartbeatHalloweenWorld);
  const startIslandCall = useServerFn(startHalloweenIsland);
  const claimRewardCall = useServerFn(claimHalloweenReward);
  const joinDuoCall = useServerFn(joinHalloweenDuo);
  const readyDuoCall = useServerFn(readyHalloweenDuo);
  const pollDuoCall = useServerFn(fetchHalloweenDuoQueue);
  const cancelDuoCall = useServerFn(cancelHalloweenDuo);
  const duoHeartbeatCall = useServerFn(heartbeatHalloweenDuoMatch);
  const crateClaimCall = useServerFn(claimHalloweenCrate);
  const sendDuoInviteCall = useServerFn(sendHalloweenDuoInvitation);
  const respondDuoInviteCall = useServerFn(respondToHalloweenDuoInvitation);
  const worldCallRef = useRef(worldCall);
  const presenceCallRef = useRef(presenceCall);
  const startIslandCallRef = useRef(startIslandCall);
  const claimRewardCallRef = useRef(claimRewardCall);
  const joinDuoCallRef = useRef(joinDuoCall);
  const readyDuoCallRef = useRef(readyDuoCall);
  const pollDuoCallRef = useRef(pollDuoCall);
  const cancelDuoCallRef = useRef(cancelDuoCall);
  const duoHeartbeatCallRef = useRef(duoHeartbeatCall);
  const crateClaimCallRef = useRef(crateClaimCall);
  const sendDuoInviteCallRef = useRef(sendDuoInviteCall);
  const respondDuoInviteCallRef = useRef(respondDuoInviteCall);
  worldCallRef.current = worldCall;
  presenceCallRef.current = presenceCall;
  startIslandCallRef.current = startIslandCall;
  claimRewardCallRef.current = claimRewardCall;
  joinDuoCallRef.current = joinDuoCall;
  readyDuoCallRef.current = readyDuoCall;
  pollDuoCallRef.current = pollDuoCall;
  cancelDuoCallRef.current = cancelDuoCall;
  duoHeartbeatCallRef.current = duoHeartbeatCall;
  crateClaimCallRef.current = crateClaimCall;
  sendDuoInviteCallRef.current = sendDuoInviteCall;
  respondDuoInviteCallRef.current = respondDuoInviteCall;
  const screenRef = useRef<Screen>("loading");
  const [screen, setScreenState] = useState<Screen>("loading");
  const [health, setHealth] = useState(MAX_HEALTH);
  const [ammo, setAmmo] = useState(24);
  const [maxAmmo, setMaxAmmo] = useState(24);
  const [candies, setCandies] = useState(0);
  const [kills, setKills] = useState(0);
  const [rescuedNpcCount, setRescuedNpcCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tiltEnabled, setTiltEnabled] = useState(false);
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
  const [readyOverlay, setReadyOverlay] = useState(false);
  const readyOverlayRef = useRef(false);
  const readyTimerRef = useRef<number | null>(null);
  const [weaponId, setWeaponId] = useState<GunId>("moonshot");
  const [outfitId, setOutfitId] = useState<OutfitId>("night-guard");
  const [duoState, setDuoState] = useState<DuoQueueState>(EMPTY_DUO);
  const [duoError, setDuoError] = useState("");
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [duoInviteMessage, setDuoInviteMessage] = useState("");
  const [duoInviteBusyId, setDuoInviteBusyId] = useState<string | null>(null);
  const [readying, setReadying] = useState(false);
  const [runXp, setRunXp] = useState(0);
  const [runCoins, setRunCoins] = useState(0);
  const [crateMessage, setCrateMessage] = useState("");
  const [duoPlayers, setDuoPlayers] = useState<DuoPlayer[]>([]);
  const duoStateRef = useRef(duoState);
  const duoPlayersRef = useRef(duoPlayers);
  const crateBusyRef = useRef(false);
  const interactRef = useRef<() => void>(() => undefined);
  const queueFireRef = useRef<() => void>(() => undefined);
  const startGameRef = useRef<(islandId: string, fromDuo?: boolean, soloMode?: boolean) => Promise<void>>(async () => undefined);

  useEffect(() => () => {
    if (readyTimerRef.current !== null) window.clearTimeout(readyTimerRef.current);
  }, []);

  useEffect(() => { setHalloweenAudioScene(screen); }, [screen]);
  useEffect(() => {
    let disposed = false;
    let unlocked = false;
    const tryStartAudio = async () => {
      if (disposed || unlocked) return;
      const started = await enableHalloweenAudio();
      if (!disposed && started) {
        unlocked = true;
        window.removeEventListener("pointerdown", tryStartAudio);
        window.removeEventListener("keydown", tryStartAudio);
        setHalloweenAudioScene(screenRef.current);
      }
    };

    void tryStartAudio();
    window.addEventListener("pointerdown", tryStartAudio, { passive: true });
    window.addEventListener("keydown", tryStartAudio);
    return () => {
      disposed = true;
      window.removeEventListener("pointerdown", tryStartAudio);
      window.removeEventListener("keydown", tryStartAudio);
    };
  }, []);
  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    syncFullscreen();
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  useEffect(() => () => setHalloweenAudioScene("silent"), []);
  duoStateRef.current = duoState;
  duoPlayersRef.current = duoPlayers;

  const setScreen = (next: Screen) => {
    if (next !== "playing" && readyOverlayRef.current) {
      readyOverlayRef.current = false;
      setReadyOverlay(false);
      if (readyTimerRef.current !== null) window.clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
    }
    screenRef.current = next;
    setScreenState(next);
  };

  const toggleFullscreen = async () => {
    const frame = canvasRef.current?.closest(".knight-frame") as HTMLElement | null;
    if (!frame) return;
    try {
      if (document.fullscreenElement === frame) await document.exitFullscreen();
      else await frame.requestFullscreen();
    } catch { setWorldMessage("Full screen is unavailable in this browser. You can keep playing in the game panel."); }
  };

  const toggleTiltMode = async () => {
    if (tiltEnabled) { setTiltEnabled(false); inputRef.current.held.clear(); setWorldMessage("Tilt controls turned off."); return; }
    const orientationApi = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (!orientationApi) { setWorldMessage("Tilt controls are not available on this device. Use the touch pad or keyboard instead."); return; }
    try {
      if (orientationApi.requestPermission && await orientationApi.requestPermission() !== "granted") { setWorldMessage("Motion permission was not granted. You can still use the touch pad or keyboard."); return; }
      setTiltEnabled(true);
      setWorldMessage("Tilt controls on · lean your device to move.");
    } catch { setWorldMessage("Motion permission could not be requested. Use the touch pad or keyboard instead."); }
  };

  const selectedIsland =
    HALLOWEEN_ISLANDS.find((island) => island.id === selectedIslandId) ?? HALLOWEEN_ISLANDS[0];
  const selectedIslandFeatures = getIslandFeatures(selectedIsland.id);
  const selectedGun = HALLOWEEN_GUNS.find((gun) => gun.id === weaponId) ?? HALLOWEEN_GUNS[0]!;
  const selectedOutfit = HALLOWEEN_OUTFITS.find((outfit) => outfit.id === outfitId) ?? HALLOWEEN_OUTFITS[0]!;
  const selectedIslandIndex = Math.max(
    0,
    HALLOWEEN_ISLANDS.findIndex((island) => island.id === selectedIsland.id),
  );
  const activeCandyGoal = screen === "playing" || screen === "won" || screen === "lost" ? gameRef.current.candyGoal : selectedIsland.candyGoal;
  const levelProgressPercent = Math.min(
    100,
    Math.round((candies / Math.max(1, activeCandyGoal)) * 100),
  );
  const playersOnSelectedIsland = onlinePlayers.filter(
    (player) => player.islandId === selectedIsland.id,
  );
  const searchTerm = playerSearchQuery.trim().toLowerCase();
  const duoSearchResults = searchTerm.length >= 2
    ? onlinePlayers.filter((player) => player.id && player.islandId === selectedIslandId && player.name.toLowerCase().includes(searchTerm)).slice(0, 6)
    : [];
  const myDuoPlayer = duoState.players.find((player) => player.id === duoState.you);
  const duoPartner = duoState.players.find((player) => player.id !== duoState.you);
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

  const startGame = async (islandId: string = selectedIslandId, fromDuo = false, soloMode = false) => {
    if (!fromDuo && duoStateRef.current.status !== "idle" && duoStateRef.current.status !== "cancelled") {
      void cancelDuoCallRef.current();
      setDuoState(EMPTY_DUO);
    }
    if (startRequestRef.current || !unlockedIslandIds.includes(islandId)) return;
    if (completedIslandIds.includes(islandId)) {
      setWorldMessage("You have already explored this island. Choose the next island along the route.");
      return;
    }
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
    if (HALLOWEEN_ISLANDS.findIndex((island) => island.id === islandId) > 0) {
      setScreen("sailing");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1_900));
    }
    startRequestRef.current = false;
    setStarting(false);
    rewardRequestRef.current = false;
    setRewardMessage("");
    setRewardCards([]);
    setRewardCanRetry(false);
    gameRef.current = createGame(islandId, weaponId, outfitId, soloMode, fromDuo && !soloMode);
    setRunXp(0);
    setRunCoins(0);
    setCrateMessage("");
    inputRef.current = {
      held: new Set<DirectionControl>(),
      attackQueued: false,
      rollQueued: false,
      fireQueued: false,
      interactQueued: false,
      switchQueued: false,
    };
    setHealth(gameRef.current.player.hp);
    setAmmo(gameRef.current.player.ammo);
    setMaxAmmo(gameRef.current.player.maxAmmo);
    setCandies(0);
    setKills(0);
    setRescuedNpcCount(0);
    if (readyTimerRef.current !== null) window.clearTimeout(readyTimerRef.current);
    readyOverlayRef.current = true;
    setReadyOverlay(true);
    setScreen("playing");
    readyTimerRef.current = window.setTimeout(() => {
      readyOverlayRef.current = false;
      readyTimerRef.current = null;
      inputRef.current.held.clear();
      inputRef.current.attackQueued = false;
      inputRef.current.rollQueued = false;
      inputRef.current.fireQueued = false;
      inputRef.current.interactQueued = false;
      inputRef.current.switchQueued = false;
      setReadyOverlay(false);
    }, READY_DURATION_MS);
  };

  startGameRef.current = startGame;

  const searchForDuo = async () => {
    if (duoState.status === "waiting" || duoState.status === "matched" || duoState.status === "active") return;
    setDuoError("");
    try {
      const next = await joinDuoCallRef.current({ data: { islandId: selectedIslandId, weaponId, outfitId } });
      setDuoState(next as DuoQueueState);
      if (next.status === "active") {
        setSelectedIslandId(next.islandId);
      }
    } catch (error) {
      setDuoError(error instanceof Error ? error.message : "Matchmaking is unavailable right now.");
    }
  };

  const invitePlayer = async (player: WorldPlayer) => {
    if (!player.id || duoInviteBusyId) return;
    setDuoError(""); setDuoInviteMessage(""); setDuoInviteBusyId(player.id);
    try {
      await sendDuoInviteCallRef.current({ data: { targetId: player.id, islandId: selectedIslandId, weaponId, outfitId } });
      setDuoInviteMessage("Invitation sent to " + player.name + ". They have 90 seconds to accept.");
    } catch (error) { setDuoError(error instanceof Error ? error.message : "Could not send the duo invitation."); }
    finally { setDuoInviteBusyId(null); }
  };

  const respondToDuoInvite = async (inviteId: string, accept: boolean) => {
    setDuoError("");
    try {
      const next = await respondDuoInviteCallRef.current({ data: { inviteId, accept, weaponId, outfitId } }) as DuoQueueState;
      setDuoState(next);
      if (accept) { setSelectedIslandId(next.islandId); setDuoInviteMessage("Invitation accepted. Ready up with your teammate to start."); }
    } catch (error) { setDuoError(error instanceof Error ? error.message : "Could not respond to the invitation."); }
  };

  const leaveDuoQueue = async () => {
    try { await cancelDuoCallRef.current(); } catch { /* the queue can expire while leaving */ }
    setDuoState(EMPTY_DUO);
    setDuoPlayers([]);
  };

  const readyUpForDuo = async () => {
    if (readying) return;
    setDuoError("");
    setReadying(true);
    try {
      const next = await readyDuoCallRef.current() as DuoQueueState;
      setDuoState(next);
    } catch (error) {
      setDuoError(error instanceof Error ? error.message : "Could not ready up.");
    } finally {
      setReadying(false);
    }
  };

  const enterSoloMap = async () => {
    if (duoStateRef.current.status !== "idle" && duoStateRef.current.status !== "cancelled") {
      await leaveDuoQueue();
    }
    setScreen("map");
  };

  const queueFire = () => {
    if (gameRef.current.player.ammo <= 0) {
      setCrateMessage("Out of ammo — search a glowing crate to refill.");
      return;
    }
    inputRef.current.fireQueued = true;
  };
  queueFireRef.current = queueFire;

  interactRef.current = () => {
    const game = gameRef.current;
    if (crateBusyRef.current || screenRef.current !== "playing") return;
    if (game.insideHouseId) {
      const house = game.houses.find((entry) => entry.id === game.insideHouseId);
      game.insideHouseId = null;
      if (house) { game.player.x = house.doorX; game.player.y = house.doorY + 18; }
      setCrateMessage("You stepped outside. The spirits cannot follow you into the house.");
      return;
    }
    const npc = game.npcs.filter((entry) => !entry.rescued).sort((a, b) => Math.hypot(a.x - game.player.x, a.y - game.player.y) - Math.hypot(b.x - game.player.x, b.y - game.player.y))[0];
    if (npc && Math.hypot(npc.x - game.player.x, npc.y - game.player.y) <= 82) {
      npc.rescued = true;
      game.rescuedNpcCount += 1;
      playHalloweenSound("rescue");
      setCrateMessage(npc.name + " the " + npc.role + " is safe! " + game.rescuedNpcCount + "/" + game.npcs.length + " islanders rescued.");
      return;
    }
    const house = game.houses.find((entry) => Math.hypot(entry.doorX - game.player.x, entry.doorY - game.player.y) <= 76);
    if (house) {
      game.insideHouseId = house.id;
      game.nextHouseHealAt = 0;
      game.player.x = house.x + house.width / 2;
      game.player.y = house.y + house.height / 2;
      setCrateMessage("Safe inside " + house.name + ". Move around to recover one heart at a time; press E to leave.");
      return;
    }
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
        playHalloweenSound("crate");
        game.sessionXp += reward.xp;
        game.sessionCoins += reward.coins;
        setRunXp(game.sessionXp);
        setRunCoins(game.sessionCoins);
        setWalletCoins(reward.balance);
        const serverGun = reward.gunId ? HALLOWEEN_GUNS.find((gun) => gun.id === reward.gunId) : undefined;
        const newGun = serverGun ?? HALLOWEEN_GUNS.find((gun) => gun.id === target.weaponId);
        if (newGun) {
          let ownedGun = game.player.weapons.find((gun) => gun.id === newGun.id);
          if (ownedGun) ownedGun.ammo = Math.min(newGun.ammoCapacity, ownedGun.ammo + reward.ammo);
          else {
            ownedGun = { id: newGun.id, ammo: Math.min(newGun.ammoCapacity, Math.max(reward.ammo, Math.ceil(newGun.ammoCapacity * 0.5))) };
            game.player.weapons.push(ownedGun);
          }
          game.player.weaponId = newGun.id;
          game.player.maxAmmo = newGun.ammoCapacity;
          game.player.ammo = ownedGun.ammo;
          game.player.nextShotAt = 0;
          setWeaponId(newGun.id);
        } else {
          game.player.ammo = Math.min(game.player.maxAmmo, game.player.ammo + reward.ammo);
        }
        setAmmo(game.player.ammo);
        setMaxAmmo(game.player.maxAmmo);
        setCrateMessage("Gun cache opened: " + (newGun?.name ?? "spirit gun") + " · " + reward.ammo + " ammo · +" + reward.xp + " XP · +" + formatHalloweenCoins(reward.coins) + " · press Q to switch guns.");
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
    let timer = 0;
    const schedulePoll = () => {
      const currentStatus = duoStateRef.current.status;
      const delay = currentStatus === "idle" || currentStatus === "cancelled" ? 5_000 : 700;
      timer = window.setTimeout(async () => {
        await poll();
        if (!disposed) schedulePoll();
      }, delay);
    };
    void poll();
    schedulePoll();
    return () => { disposed = true; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (duoState.status !== "active" || screen !== "start" || !unlockedIslandIds.includes(duoState.islandId)) return;
    setSelectedIslandId(duoState.islandId);
    void startGameRef.current(duoState.islandId, true, false);
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
        const nextIsland = HALLOWEEN_ISLANDS.find((island) => world.unlockedIslandIds.includes(island.id) && !world.completedIslandIds.includes(island.id));
        const currentStillPlayable = HALLOWEEN_ISLANDS.some((island) => island.id === selectedIslandRef.current && world.unlockedIslandIds.includes(island.id) && !world.completedIslandIds.includes(island.id));
        if (!currentStillPlayable && nextIsland) { selectedIslandRef.current = nextIsland.id; setSelectedIslandId(nextIsland.id); }
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

      if (screenRef.current === "playing" && !readyOverlayRef.current) {
        updateGame(game, inputRef.current, delta, timestamp, (next) => setScreen(next));
        if (inputRef.current.interactQueued) {
          inputRef.current.interactQueued = false;
          interactRef.current();
        }
        const hudKey = `${game.player.hp}:${game.player.ammo}:${game.player.maxAmmo}:${game.candyCollected}:${game.kills}:${game.rescuedNpcCount}:${game.sessionXp}:${game.sessionCoins}:${game.player.weaponId}:${game.player.swimming}`;
        if (hudKey !== lastHudKey) {
          lastHudKey = hudKey;
          setHealth(game.player.hp);
          setAmmo(game.player.ammo);
          setMaxAmmo(game.player.maxAmmo);
          setWeaponId(game.player.weaponId);
          setCandies(game.candyCollected);
          setKills(game.kills);
          setRescuedNpcCount(game.rescuedNpcCount);
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
      if (readyOverlayRef.current) return;
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
        queueFireRef.current();
      } else if (key === "e" && !event.repeat) {
        event.preventDefault();
        inputRef.current.interactQueued = true;
      } else if (key === "q" && !event.repeat) {
        event.preventDefault();
        inputRef.current.switchQueued = true;
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      const direction = keyToDirection(event.key.toLowerCase());
      if (direction) inputRef.current.held.delete(direction);
    };
    const onDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (!tiltEnabled) return;
      const held = inputRef.current.held;
      for (const direction of ["up", "down", "left", "right"] as DirectionControl[]) held.delete(direction);
      const gamma = event.gamma ?? 0; const beta = event.beta ?? 0;
      if (gamma < -12) held.add("left"); else if (gamma > 12) held.add("right");
      if (beta < -22) held.add("up"); else if (beta > 22) held.add("down");
    };
    const clearKeys = () => {
      inputRef.current.held.clear();
    };

    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    if (tiltEnabled) window.addEventListener("deviceorientation", onDeviceOrientation);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", clearKeys);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("deviceorientation", onDeviceOrientation);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", clearKeys);
    };
  }, [hasGameCanvas, playerName, tiltEnabled]);

  const pressControl = (control: Control, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (readyOverlayRef.current) { event.preventDefault(); return; }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (control === "attack") inputRef.current.attackQueued = true;
    else if (control === "roll") inputRef.current.rollQueued = true;
    else if (control === "fire") queueFireRef.current();
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
        <><span className="knight-action-glyph" aria-hidden="true">⌕</span><span className="knight-action-label">INTERACT</span></>
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
        <section className="knight-start-screen knight-lobby-screen" aria-label="Halloween game lobby">
          <header className="knight-lobby-heading">
            <p className="knight-eyebrow">THE HAUNTED ARCHIPELAGO · PARTY LOBBY</p>
            <h1 className="knight-title">Knight in the Night</h1>
            <p className="knight-welcome">Welcome, {playerName}. Set your gear, then ready up with a teammate.</p>
          </header>

          <div className="knight-lobby-grid">
            <section className="knight-character-card" aria-label="Character preview">
              <p className="knight-loadout-label">YOUR EXPLORER</p>
              <div className="knight-preview-stage" aria-hidden="true">
                <span className="knight-preview-glow" />
                <span className="knight-preview-shadow" />
                <span className="knight-preview-cloak" style={{ backgroundColor: selectedOutfit.color, borderColor: selectedOutfit.trim }} />
                <span className="knight-preview-face" />
                <span className="knight-preview-hair" style={{ backgroundColor: selectedOutfit.trim }} />
                <span className="knight-preview-eyes" />
                <span className="knight-preview-gun" style={{ backgroundColor: selectedGun.color }} />
              </div>
              <strong className="knight-preview-name">{playerName}</strong>
              <span className="knight-preview-gear">{selectedOutfit.name} · {selectedGun.name}</span>
              <span className="knight-preview-ammo">Starting ammo · {selectedGun.ammoCapacity} rounds</span>
            </section>

            <section className="knight-lobby-loadout" aria-label="Choose character gear">
              <div className="knight-lobby-island-select">
                <label htmlFor="knight-lobby-island">Queue for island</label>
                <select
                  id="knight-lobby-island"
                  value={selectedIslandId}
                  disabled={duoState.status === "waiting" || duoState.status === "matched" || duoState.status === "active"}
                  onChange={(event) => { selectedIslandRef.current = event.target.value; setSelectedIslandId(event.target.value); }}
                >
                  {HALLOWEEN_ISLANDS.filter((island) => unlockedIslandIds.includes(island.id) && !completedIslandIds.includes(island.id)).map((island) => (
                    <option key={island.id} value={island.id}>{island.emoji} {island.name}</option>
                  ))}
                </select>
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
            </section>
          </div>

          <section className="knight-duo-lobby" aria-label="Duo matchmaking">
            <div className="knight-duo-lobby-copy">
              <p className="knight-loadout-label">PARTY · TWO PLAYERS</p>
              <h2>{duoState.status === "waiting" ? "Looking for your duo" : duoState.status === "matched" ? "A teammate is here" : "Queue with a teammate"}</h2>
              <p>{duoError || (duoState.status === "waiting"
                ? `Waiting for a player on ${selectedIsland.name}. Both explorers must ready up before the island starts.`
                : duoState.status === "matched"
                  ? "Both explorers are shown below. Once both are ready, the island starts automatically after a five-second countdown."
                  : "Match with one player on the same island. Ready up together, then face a larger monster pack and collect extra treats.")}</p>
            </div>
            <div className="knight-player-search">
              <label htmlFor="knight-player-search">Find a player by name</label>
              <input id="knight-player-search" value={playerSearchQuery} onChange={(event) => { setPlayerSearchQuery(event.target.value); setDuoInviteMessage(""); }} placeholder="Search players on this island" maxLength={24} autoComplete="off" />
              {searchTerm.length > 0 && searchTerm.length < 2 && <small>Enter at least 2 letters.</small>}
              {searchTerm.length >= 2 && (duoSearchResults.length > 0 ? <div className="knight-player-search-results">
                {duoSearchResults.map((player) => <div className="knight-player-search-result" key={player.id}>
                  {player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : <span className="knight-party-avatar">{player.name.slice(0, 1).toUpperCase()}</span>}<span>{player.name}</span>
                  <button type="button" className="knight-duo-button" onClick={() => void invitePlayer(player)} disabled={Boolean(duoInviteBusyId) || duoState.status === "waiting" || duoState.status === "matched" || duoState.status === "active"}>{duoInviteBusyId === player.id ? "Sending…" : "Invite"}</button>
                </div>)}
              </div> : <small>No active players on this island match that name.</small>)}
              {duoInviteMessage && <small className="knight-player-search-message" role="status">{duoInviteMessage}</small>}
            </div>
            {(duoState.incomingInvites ?? []).length > 0 && <div className="knight-incoming-invites" aria-label="Duo invitations">
              {(duoState.incomingInvites ?? []).map((invite) => <div className="knight-incoming-invite" key={invite.id}>
                <span><strong>{invite.fromName}</strong> invited you to {HALLOWEEN_ISLANDS.find((island) => island.id === invite.islandId)?.name ?? "an island"}.</span>
                <button type="button" className="knight-duo-button" onClick={() => void respondToDuoInvite(invite.id, true)}>Accept</button>
                <button type="button" className="knight-duo-button is-cancel" onClick={() => void respondToDuoInvite(invite.id, false)}>Decline</button>
              </div>)}
            </div>}
            {duoState.status === "matched" || duoState.status === "active" ? (
              <div className="knight-party-roster" aria-live="polite">
                {[myDuoPlayer, duoPartner].filter((player): player is DuoPlayer => Boolean(player)).map((player) => (
                  <div className="knight-party-player" key={player.id}>
                    {player.avatarUrl ? <img src={player.avatarUrl} alt="" /> : <span className="knight-party-avatar">{player.name.slice(0, 1).toUpperCase()}</span>}
                    <span className="knight-party-name">{player.id === duoState.you ? "You" : player.name}</span>
                    <span className={"knight-party-ready" + (player.ready ? " is-ready" : "")}>{player.ready ? "READY" : "NOT READY"}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="knight-duo-lobby-actions">
              {duoState.status === "idle" || duoState.status === "cancelled" ? (
                <button type="button" className="knight-duo-button" onClick={() => void searchForDuo()} disabled={starting || !unlockedIslandIds.includes(selectedIslandId) || completedIslandIds.includes(selectedIslandId)}>Find a duo</button>
              ) : duoState.status === "waiting" ? (
                <button type="button" className="knight-duo-button is-cancel" onClick={() => void leaveDuoQueue()}>Leave queue</button>
              ) : duoState.status === "matched" ? (
                <button type="button" className="knight-duo-button" onClick={() => void readyUpForDuo()} disabled={Boolean(myDuoPlayer?.ready) || readying}>
                  {readying ? "Saving ready…" : myDuoPlayer?.ready ? "You’re ready" : "Ready up"}
                </button>
              ) : (
                <span className="knight-duo-live">BOTH READY · STARTING IN {duoState.countdown > 0 ? duoState.countdown + "s" : "…"}</span>
              )}
              {duoState.status === "matched" && duoState.countdown > 0 && <span className="knight-duo-live">STARTING IN {duoState.countdown}s</span>}
              {duoState.status === "matched" && myDuoPlayer?.ready && <span className="knight-party-waiting">{duoPartner?.ready ? "Both players ready." : `Waiting for ${duoPartner?.name ?? "your teammate"} to ready up.`}</span>}
            </div>
          </section>

          <footer className="knight-lobby-footer">
            <p>Solo is tougher: fewer hearts and more, stronger spirits.</p>
            <button type="button" className="knight-solo-button" onClick={() => void enterSoloMap()} disabled={starting}>
              Go solo · Hard mode <span aria-hidden="true">→</span>
            </button>
          </footer>
        </section>
      )}

      {screen === "sailing" && (
        <section className="knight-sailing-screen" aria-live="polite" aria-label={"Sailing to " + selectedIsland.name}>
          <div className="knight-sailing-moon" aria-hidden="true">☾</div>
          <div className="knight-sailing-stars" aria-hidden="true">✦　·　✧　·　✦</div>
          <div className="knight-sailing-boat" aria-hidden="true">⛵</div>
          <p className="knight-eyebrow">THE NEXT SHORE AWAITS</p>
          <h1>Sailing to {selectedIsland.name}</h1>
          <p>The lanterns guide your party across the dark water.</p>
          <div className="knight-sailing-route"><span /></div>
        </section>
      )}

      {screen === "map" && (
        <section className="knight-explorer" aria-label="Choose a Halloween island">
          <div className="knight-explorer-heading">
            <div>
              <p className="knight-eyebrow">THE HAUNTED ARCHIPELAGO</p>
              <h2 className="knight-section-title">Choose your island</h2>
              <p className="knight-map-instruction">Explore each island once, then sail onward to the next shore.</p>
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
                const cleared = completedIslandIds.includes(island.id);
                const unlocked = unlockedIslandIds.includes(island.id) && !cleared &&
                  (duoState.status !== "active" || island.id === duoState.islandId);
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
                      className={`knight-island-pin${cleared ? " is-cleared" : ""}${selectedIslandId === island.id ? " is-selected" : ""}${unlocked ? "" : " is-locked"}`}
                      style={{ left: `${position.x}%`, top: `${position.y}%` }}
                      onClick={() => { selectedIslandRef.current = island.id; setSelectedIslandId(island.id); }}
                      disabled={!unlocked || starting}
                      aria-label={`${island.name}, ${cleared ? "already explored" : unlocked ? "unlocked, select island" : "locked or unavailable for this duo"}. ${islandPlayers.length} players here.`}
                    >
                      <span className="knight-island-emoji" aria-hidden="true">
                        {unlocked ? island.emoji : "🔒"}
                      </span>
                      <strong>{island.name}</strong>
                       <span className="knight-island-feature">{getIslandFeatures(island.id).biome}</span>
                       <span className="knight-island-status">
                        {cleared
                          ? "ALREADY EXPLORED"
                          : selectedIslandId === island.id
                            ? "SELECTED"
                            : unlocked
                              ? "CHOOSE ISLAND"
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
          <div className="knight-map-launch">
            <button type="button" className="knight-map-back" onClick={() => { void leaveDuoQueue().then(() => setScreen("start")); }}>
              ← Back to lobby
            </button>
            <div className="knight-map-launch-copy">
              <strong>{selectedIsland.emoji} {selectedIsland.name}</strong>
              <span className="knight-map-feature-copy">{selectedIslandFeatures.biome} · {selectedIslandFeatures.landmark}{selectedIslandFeatures.river ? " · swimmable river" : ""}</span>
              <span>{duoState.status === "active" ? "Your duo is ready." : "Solo challenge · 4 hearts · 25% more, stronger spirits."}</span>
            </div>
            <button
              type="button"
              className="knight-start-button"
              onClick={() => void startGame(selectedIslandId, duoState.status === "active", duoState.status !== "active")}
              disabled={starting || !unlockedIslandIds.includes(selectedIslandId) || completedIslandIds.includes(selectedIslandId)}
            >
              {starting ? "OPENING BATTLE…" : duoState.status === "active" ? "LAUNCH DUO BATTLE" : "LAUNCH SOLO BATTLE"}
              <span aria-hidden="true">→</span>
            </button>
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
            <p className="knight-how-to-play">WASD / arrows · G fire · Q switch guns · E rescue, enter/leave houses, or search · K dodge · {gameRef.current.soloMode ? "SOLO HARD" : gameRef.current.duoMode ? "DUO CHALLENGE" : "SOLO RUN"}</p>
            <div className="knight-view-controls">
              <button type="button" className="knight-fullscreen-button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}>
                {isFullscreen ? "↙ Exit full screen" : "⛶ Full screen"}
              </button>
              <button type="button" className="knight-fullscreen-button" onClick={() => void toggleTiltMode()} aria-pressed={tiltEnabled} aria-label={tiltEnabled ? "Turn tilt controls off" : "Turn tilt controls on"}>{tiltEnabled ? "Tilt on" : "Tilt controls"}</button>
            </div>
          </div>
          <div className="knight-stats" aria-live="polite">
            <span className="knight-stat knight-ammo-stat" aria-label={selectedGun.name + ", " + ammo + " of " + maxAmmo + " ammo"}>
              <span aria-hidden="true">▰</span> {selectedGun.name} · {ammo}/{maxAmmo}
            </span>
            {isPlaying && (
              <button type="button" className="knight-weapon-switch" disabled={readyOverlay || gameRef.current.player.weapons.length < 2} onClick={() => { inputRef.current.switchQueued = true; }} aria-label={"Switch weapon, " + gameRef.current.player.weapons.length + " owned"}>
                ⇄ {gameRef.current.player.weapons.length > 1 ? "SWAP · Q" : "FIND GUNS"}
              </button>
            )}
            <span
              className="knight-stat"
              aria-label={`Candy ${candies} of ${selectedIsland.candyGoal}`}
            >
              <span aria-hidden="true">🍬</span> {candies}/{activeCandyGoal}
            </span>
            <span className="knight-stat" aria-label={`${kills} spirits defeated`}>
              <span aria-hidden="true">☠</span> {kills}/{gameRef.current.totalEnemies}
            </span>
            <span className="knight-stat" aria-label={`${rescuedNpcCount} islanders rescued`}>
              <span aria-hidden="true">🛟</span> {rescuedNpcCount}/{gameRef.current.npcs.length} rescued
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
              <span>{candies} / {activeCandyGoal} treats</span>
            </div>
            <div
              className="knight-level-track"
              role="progressbar"
              aria-label={"Level " + (selectedIslandIndex + 1) + " island progress"}
              aria-valuemin={0}
              aria-valuemax={activeCandyGoal}
              aria-valuenow={candies}
              aria-valuetext={candies + " of " + activeCandyGoal + " treats collected"}
            >
              <span style={{ width: levelProgressPercent + "%" }} />
            </div>
          </div>
        </div>
        <div className="knight-player-health">
          <div className="knight-player-health-meta"><span>HEALTH</span><strong>{health} / {gameRef.current.player.maxHp}</strong></div>
          <div className="knight-player-health-track" role="progressbar" aria-label="Player health" aria-valuemin={0} aria-valuemax={gameRef.current.player.maxHp} aria-valuenow={health} aria-valuetext={health + " of " + gameRef.current.player.maxHp + " health"}>
            <span style={{ width: Math.max(0, Math.min(100, (health / Math.max(1, gameRef.current.player.maxHp)) * 100)) + "%" }} />
          </div>
        </div>

        <div className="knight-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="knight-canvas"
            width={WIDTH}
            height={HEIGHT}
            role="img"
            aria-label={`Large scrolling haunted world on ${selectedIsland.name}. Rescue islanders, shelter from monsters in houses, collect ${activeCandyGoal} treats.`}
          />
          {isPlaying && (
            <div className="knight-island-feature-badge" aria-label={selectedIslandFeatures.biome + ": " + selectedIslandFeatures.landmark}>
              <span>{selectedIslandFeatures.biome}</span><strong>{selectedIslandFeatures.landmark}</strong>
            </div>
          )}
          {isPlaying && gameRef.current.player.swimming && selectedIslandFeatures.river ? <div className="knight-swim-badge" role="status">SWIMMING · {selectedIslandFeatures.river.name}</div> : null}
          {isPlaying && readyOverlay && (
            <div className="knight-ready-overlay" role="status" aria-live="assertive">
              <span className="knight-ready-whisper">THE NIGHT HOLDS ITS BREATH</span>
              <span className="knight-ready-title">Ready?</span>
              <span className="knight-ready-island">{selectedIsland.emoji} {selectedIsland.name}</span>
            </div>
          )}
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
                {controlButton("interact", "Rescue a nearby islander, enter or leave a house, or search a nearby crate", "knight-action-button knight-search-button")}
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
                    screen === "won"
                      ? () => {
                          const currentIndex = HALLOWEEN_ISLANDS.findIndex((island) => island.id === gameRef.current.islandId);
                          const nextIsland = HALLOWEEN_ISLANDS.find((island, index) => index > currentIndex && !completedIslandIds.includes(island.id));
                          if (nextIsland) setSelectedIslandId(nextIsland.id);
                          if (duoState.status === "active") void leaveDuoQueue();
                          setScreen("map");
                        }
                      : () => void startGame(selectedIslandId, duoState.status === "active", gameRef.current.soloMode)
                  }
                  disabled={starting || (screen === "won" && rewardClaiming) || (screen === "lost" && !unlockedIslandIds.includes(selectedIslandId))}
                >
                  {screen === "won" ? "Sail onward" : "Try this island again"}
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

const islandTreeLayouts: Record<string, Array<{ x: number; y: number }>> = {};
function halloweenTrees(islandId: string = HALLOWEEN_ISLANDS[0].id) {
  if (!islandTreeLayouts[islandId]) {
    const index = Math.max(0, HALLOWEEN_ISLANDS.findIndex((island) => island.id === islandId)); const feature = getIslandFeatures(islandId);
    islandTreeLayouts[islandId] = Array.from({ length: feature.treeCount }, (_, i) => {
      let x = 70 + ((i * 173 + 53 + index * 211) % (WORLD_WIDTH - 140)); let y = 70 + ((i * 229 + 91 + index * 167) % (WORLD_HEIGHT - 140));
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const nearHouse = HOUSE_LAYOUT.some((house) => x + 40 > house.x && x - 40 < house.x + house.width && y + 60 > house.y && y - 55 < house.y + house.height);
        if (!nearHouse && Math.hypot(x - 180, y - (WORLD_HEIGHT - 170)) > 110 && Math.hypot(x - feature.landmarkX, y - feature.landmarkY) > 150 && !isPointInRiver(x, y, islandId)) break;
        x = 70 + ((x + 211 + index * 19) % (WORLD_WIDTH - 140)); y = 70 + ((y + 157 + index * 23) % (WORLD_HEIGHT - 140));
      }
      return { x, y };
    });
  }
  return islandTreeLayouts[islandId]!;
}
function canStandAt(x: number, y: number, houses: House[] = HOUSE_LAYOUT, islandId: string = HALLOWEEN_ISLANDS[0].id) {
  if (x < 38 || x > WORLD_WIDTH - 38 || y < 80 || y > WORLD_HEIGHT - 38) return false;
  if (houses.some((house) => x + 17 > house.x && x - 17 < house.x + house.width && y + 12 > house.y && y - 12 < house.y + house.height)) return false;
  return halloweenTrees(islandId).every((tree) => Math.hypot(x - tree.x, y - (tree.y + 48)) > 34);
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
  const speed = (rolling ? 350 : 165) * (isPointInRiver(player.x, player.y, game.islandId) ? 0.78 : 1);
  const moveX = rolling ? player.directionX : x;
  const moveY = rolling ? player.directionY : y;
  const previousX = player.x;
  const previousY = player.y;
  if (rolling || magnitude > 0) {
    const nextX = player.x + moveX * speed * delta;
    const nextY = player.y + moveY * speed * delta;
    const interior = game.insideHouseId ? game.houses.find((house) => house.id === game.insideHouseId) : undefined;
    if (interior) {
      player.x = clamp(nextX, interior.x + 28, interior.x + interior.width - 28);
      player.y = clamp(nextY, interior.y + 30, interior.y + interior.height - 28);
    } else {
      const boundedX = clamp(nextX, 38, WORLD_WIDTH - 38);
      const boundedY = clamp(nextY, 80, WORLD_HEIGHT - 38);
      if (canStandAt(boundedX, player.y, game.houses, game.islandId)) player.x = boundedX;
      if (canStandAt(player.x, boundedY, game.houses, game.islandId)) player.y = boundedY;
    }
  }
  player.swimming = !game.insideHouseId && isPointInRiver(player.x, player.y, game.islandId);
  player.walking = Math.hypot(player.x - previousX, player.y - previousY) > 0.15 && !rolling;
  if (player.walking || rolling) player.walkPhase += delta * (rolling ? 18 : 13);

  if (game.insideHouseId && player.hp < player.maxHp && now >= game.nextHouseHealAt) {
    player.hp = Math.min(player.maxHp, player.hp + 1);
    game.nextHouseHealAt = now + 1_250;
    playHalloweenSound("heal");
  }
  for (const [index, npc] of game.npcs.entries()) {
    if (!npc.rescued) continue;
    const trail = 46 + index * 28;
    const side = index % 2 === 0 ? -1 : 1;
    let targetX = player.x - player.directionX * trail - player.directionY * side * 20;
    let targetY = player.y - player.directionY * trail + player.directionX * side * 20;
    const interior = game.insideHouseId ? game.houses.find((house) => house.id === game.insideHouseId) : undefined;
    if (interior) {
      targetX = clamp(targetX, interior.x + 30, interior.x + interior.width - 30);
      targetY = clamp(targetY, interior.y + 32, interior.y + interior.height - 30);
    } else {
      targetX = clamp(targetX, 38, WORLD_WIDTH - 38);
      targetY = clamp(targetY, 80, WORLD_HEIGHT - 38);
    }
    const dx = targetX - npc.x; const dy = targetY - npc.y; const distance = Math.hypot(dx, dy);
    if (distance > 20) { const step = Math.min(distance, 118 * delta); npc.x += dx / distance * step; npc.y += dy / distance * step; }
  }

  if (input.switchQueued) {
    input.switchQueued = false;
    if (player.weapons.length > 1) {
      const currentIndex = player.weapons.findIndex((weapon) => weapon.id === player.weaponId);
      const nextWeapon = player.weapons[(Math.max(0, currentIndex) + 1) % player.weapons.length]!;
      const nextGun = HALLOWEEN_GUNS.find((gun) => gun.id === nextWeapon.id) ?? HALLOWEEN_GUNS[0]!;
      player.weaponId = nextWeapon.id;
      player.ammo = nextWeapon.ammo;
      player.maxAmmo = nextGun.ammoCapacity;
      player.nextShotAt = now;
    }
  }

  if (input.attackQueued && now >= player.attackCooldownUntil) {
    player.attackCooldownUntil = now + 390;
    player.swingUntil = now + 230;
    playHalloweenSound("slash");
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

  if (input.fireQueued && now >= player.nextShotAt && player.ammo > 0) {
    const gun = HALLOWEEN_GUNS.find((item) => item.id === player.weaponId) ?? HALLOWEEN_GUNS[0]!;
    player.nextShotAt = now + gun.cooldown;
    player.ammo -= 1;
    const equippedWeapon = player.weapons.find((weapon) => weapon.id === player.weaponId);
    if (equippedWeapon) equippedWeapon.ammo = player.ammo;
    playHalloweenSound("shot");
    game.projectiles.push({
      x: player.x + player.directionX * 19, y: player.y + player.directionY * 19,
      directionX: player.directionX, directionY: player.directionY,
      speed: gun.speed, damage: gun.damage, rangeLeft: gun.range, color: gun.color, weaponId: gun.id,
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
        const impactX = enemy.x;
        const impactY = enemy.y;
        const explosive = projectile.weaponId === "spirit-burst";
        enemy.hp -= projectile.damage;
        projectile.rangeLeft = -1;
        game.explosions.push({ x: impactX, y: impactY, radius: explosive ? 118 : 42, color: projectile.color, startedAt: now });
        if (enemy.hp <= 0) {
          game.candies.push({ x: enemy.x, y: enemy.y, phase: enemy.phase });
          game.kills += 1;
        }
        if (explosive) {
          for (const nearby of game.enemies) {
            if (nearby !== enemy && nearby.hp > 0 && Math.hypot(nearby.x - impactX, nearby.y - impactY) < 86) {
              nearby.hp -= 1;
              if (nearby.hp <= 0) { game.candies.push({ x: nearby.x, y: nearby.y, phase: nearby.phase }); game.kills += 1; }
            }
          }
        }
        break;
      }
    }
  }
  game.projectiles = game.projectiles.filter((projectile) => projectile.rangeLeft > 0);
  game.explosions = game.explosions.filter((explosion) => now - explosion.startedAt < 420);
  game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);

  for (const enemy of game.enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const approach = enemy.kind === "brute" ? 46 : enemy.kind === "bat" ? 42 : 31;
    const enemySpeed = enemy.kind === "brute" ? 23 + Math.min(10, Math.floor(game.totalEnemies / 3)) : enemy.kind === "bat" ? 46 : 34;
    if (distance > approach && !game.insideHouseId) {
      const difficultyMultiplier = game.soloMode ? 1.2 : 1;
      const nextX = enemy.x + (dx / distance) * enemySpeed * difficultyMultiplier * delta;
      const nextY = enemy.y + (dy / distance) * enemySpeed * difficultyMultiplier * delta;
      if (canStandAt(nextX, enemy.y, game.houses, game.islandId)) enemy.x = nextX;
      if (canStandAt(enemy.x, nextY, game.houses, game.islandId)) enemy.y = nextY;
    }
    enemy.phase += delta * (enemy.kind === "bat" ? 8 : enemy.kind === "brute" ? 1.3 : 3);
    const contactDistance = enemy.kind === "brute" ? 43 : 34;
    if (!game.insideHouseId && distance < contactDistance && now >= player.invulnerableUntil) {
      player.hp -= enemy.kind === "brute" ? 2 : 1;
      playHalloweenSound("damage");
      player.invulnerableUntil = now + (enemy.kind === "brute" ? 1_150 : 900);
      if (player.hp <= 0) finish("lost");
    }
  }

  game.candies = game.candies.filter((candy) => {
    candy.phase += delta * 3;
    if (Math.hypot(candy.x - player.x, candy.y - player.y) < 31) {
      game.candyCollected += 1;
      playHalloweenSound("pickup");
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
  if (game.insideHouseId) {
    drawHouseInterior(ctx, game, now, viewHeight);
    const house = game.houses.find((entry) => entry.id === game.insideHouseId);
    const indoorPlayer = {
      ...game.player,
      x: house ? clamp(96 + ((game.player.x - house.x) / house.width) * (WIDTH - 192), 96, WIDTH - 96) : WIDTH / 2,
      y: house ? clamp(viewHeight * 0.28 + ((game.player.y - house.y) / house.height) * (viewHeight * 0.34), viewHeight * 0.28, viewHeight * 0.62) : viewHeight * 0.48,
    };
    game.npcs.filter((npc) => npc.rescued).forEach((npc, index) => {
      const follower = { ...npc, x: clamp(indoorPlayer.x - 48 - index * 22, 90, WIDTH - 90), y: indoorPlayer.y + 34 + index * 8 };
      drawIslandNpc(ctx, follower, indoorPlayer, now);
    });
    drawKnight(ctx, indoorPlayer, now);
    drawPlayerName(ctx, playerName, indoorPlayer.x, indoorPlayer.y - 50);
    return;
  }
  const cameraX = clamp(game.player.x - WIDTH / 2, 0, WORLD_WIDTH - WIDTH);
  const cameraY = clamp(game.player.y - viewHeight / 2, 0, WORLD_HEIGHT - viewHeight);
  ctx.save();
  ctx.translate(-cameraX, -cameraY);
  drawCourtyard(ctx, now, game.islandId);
  for (const crate of game.crates) drawLootCrate(ctx, crate, game.player, now);
  for (const candy of game.candies) drawCandy(ctx, candy);
  for (const npc of game.npcs) drawIslandNpc(ctx, npc, game.player, now);
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
  for (const explosion of game.explosions) drawExplosion(ctx, explosion, now);
  for (const house of game.houses) drawHouse(ctx, house, game.player, now);
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

function drawHouse(ctx: CanvasRenderingContext2D, house: House, player: Player, now: number) {
  const distance = Math.hypot(house.doorX - player.x, house.doorY - player.y);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(house.x - 9, house.y + house.height - 4, house.width + 18, 20);
  ctx.fillStyle = "#30222a"; ctx.fillRect(house.x, house.y + 24, house.width, house.height - 24);
  ctx.fillStyle = "#734149"; ctx.beginPath(); ctx.moveTo(house.x - 24, house.y + 34); ctx.lineTo(house.x + house.width / 2, house.y - 26); ctx.lineTo(house.x + house.width + 24, house.y + 34); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#e8a05d"; ctx.fillRect(house.x + 26, house.y + 58, 36, 38); ctx.fillRect(house.x + house.width - 62, house.y + 58, 36, 38);
  ctx.fillStyle = "#171820"; ctx.fillRect(house.x + house.width / 2 - 20, house.y + house.height - 58, 40, 58);
  ctx.fillStyle = "#f4c47b"; ctx.beginPath(); ctx.arc(house.x + house.width / 2 + 12, house.y + house.height - 29, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffd491"; ctx.font = "700 12px Poppins, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(house.name, house.x + house.width / 2, house.y - 34);
  if (distance < 108) ctx.fillText(distance < 76 ? "E · ENTER SAFE HOUSE" : "SAFE HOUSE", house.doorX, house.doorY + 18);
  const glow = ctx.createRadialGradient(house.doorX, house.doorY, 2, house.doorX, house.doorY, 32);
  glow.addColorStop(0, "rgba(255,190,111,.24)"); glow.addColorStop(1, "rgba(255,190,111,0)");
  ctx.fillStyle = glow; ctx.fillRect(house.doorX - 32, house.doorY - 32, 64, 64);
  ctx.restore();
}

function drawIslandNpc(ctx: CanvasRenderingContext2D, npc: IslandNpc, player: Player, now: number) {
  const distance = Math.hypot(npc.x - player.x, npc.y - player.y);
  ctx.save(); ctx.translate(npc.x, npc.y);
  ctx.fillStyle = npc.rescued ? "rgba(119,238,192,.15)" : "rgba(255,215,131,.2)"; ctx.beginPath(); ctx.arc(0, -2, 28 + Math.sin(now / 320) * 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = npc.rescued ? "#64bd99" : "#b56d83"; ctx.beginPath(); ctx.ellipse(0, 0, 13, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f2d3bf"; ctx.beginPath(); ctx.arc(0, -18, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#402d40"; ctx.fillRect(-6, -19, 3, 2); ctx.fillRect(3, -19, 3, 2);
  ctx.fillStyle = "#fff1d2"; ctx.font = "700 11px Poppins, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(npc.name + (npc.rescued ? " · SAFE" : " · " + npc.role), 0, -39);
  if (!npc.rescued && distance < 108) ctx.fillText(distance < 82 ? "E · RESCUE" : "NEEDS HELP", 0, 30);
  ctx.restore();
}

function drawHouseInterior(ctx: CanvasRenderingContext2D, game: GameState, now: number, viewHeight: number) {
  const house = game.houses.find((entry) => entry.id === game.insideHouseId);
  ctx.fillStyle = "#171a27"; ctx.fillRect(0, 0, WIDTH, viewHeight);
  ctx.fillStyle = "#4a3240"; ctx.fillRect(54, 48, WIDTH - 108, viewHeight - 96);
  ctx.fillStyle = "#795345"; ctx.fillRect(76, 112, WIDTH - 152, viewHeight - 188);
  ctx.fillStyle = "#a56a4e";
  for (let y = 145; y < viewHeight - 90; y += 42) { ctx.fillRect(82, y, WIDTH - 164, 3); }
  ctx.fillStyle = "#f3bf74"; ctx.fillRect(132, 142, 62, 76); ctx.fillRect(WIDTH - 194, 142, 62, 76);
  ctx.fillStyle = "#29202a"; ctx.fillRect(WIDTH / 2 - 72, 106, 144, 116);
  ctx.fillStyle = "#ef9b61"; ctx.beginPath(); ctx.ellipse(WIDTH / 2, 226, 34, 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffcf7d"; ctx.beginPath(); ctx.arc(WIDTH / 2, 193 + Math.sin(now / 200) * 3, 17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#251e2a"; ctx.fillRect(WIDTH / 2 - 130, viewHeight - 128, 260, 48);
  ctx.fillStyle = "#ffe4b5"; ctx.font = "800 15px Poppins, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(house ? house.name : "Safe House", WIDTH / 2, 74);
  ctx.font = "700 12px Poppins, sans-serif"; ctx.fillText("Safe from monsters · recover hearts · move around · press E to leave", WIDTH / 2, viewHeight - 88);
}

function drawExplosion(ctx: CanvasRenderingContext2D, explosion: Explosion, now: number) {
  const progress = clamp((now - explosion.startedAt) / 420, 0, 1);
  if (progress >= 1) return;
  const radius = explosion.radius * (0.3 + progress * 0.7);
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  ctx.fillStyle = explosion.color;
  ctx.shadowBlur = 20 * (1 - progress);
  ctx.shadowColor = explosion.color;
  ctx.beginPath(); ctx.arc(explosion.x, explosion.y, radius * (explosion.radius > 60 ? 0.43 : 0.3), 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = explosion.color; ctx.lineWidth = 8 * (1 - progress) + 1;
  ctx.beginPath(); ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#fff1bd"; ctx.lineWidth = 2 * (1 - progress);
  for (let i = 0; i < 8; i += 1) {
    const angle = i * Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(explosion.x + Math.cos(angle) * radius * 0.45, explosion.y + Math.sin(angle) * radius * 0.45);
    ctx.lineTo(explosion.x + Math.cos(angle) * (radius + 12), explosion.y + Math.sin(angle) * (radius + 12));
    ctx.stroke();
  }
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
  if (!crate.opened) {
    const gun = HALLOWEEN_GUNS.find((item) => item.id === crate.weaponId);
    const gunColor = gun?.color ?? "#91e8ff";
    ctx.fillStyle = gunColor; ctx.shadowBlur = 10; ctx.shadowColor = gunColor;
    ctx.fillRect(-8, -11, 16, 4); ctx.fillRect(-4, -7, 5, 5); ctx.shadowBlur = 0;
  }
  if (distance < 110 && !crate.opened) {
    ctx.font = "800 10px Poppins, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#d2f7ff";
    ctx.fillText(distance < 82 ? "E · OPEN GUN CACHE" : "GUN CACHE", 0, -23);
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

  const features = getIslandFeatures(islandId);
  if (features.river) drawIslandRiver(ctx, features.river, now);

  ctx.fillStyle = "rgba(176, 211, 186, 0.12)";
  for (let i = 0; i < 760; i += 1) {
    const px = (i * 137 + 19) % WORLD_WIDTH;
    const py = (i * 83 + 47) % WORLD_HEIGHT;
    ctx.fillRect(px, py, 2 + (i % 3), 1);
  }

  drawIslandLandmark(ctx, islandId, now);
  drawIslandTrail(ctx, getIslandFeatures(islandId), now);

  for (const tree of halloweenTrees(islandId)) drawTree(ctx, tree.x, tree.y, now, getIslandFeatures(islandId).treeStyle);
  drawIslandDetails(ctx, islandId, now);

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

function traceIslandPath(ctx: CanvasRenderingContext2D, points: Array<[number, number]>) {
  if (!points.length) return; ctx.beginPath(); ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 1; i < points.length - 1; i += 1) { const p = points[i]!; const n = points[i + 1]!; ctx.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2); }
  const last = points[points.length - 1]!; ctx.lineTo(last[0], last[1]);
}
function drawIslandRiver(ctx: CanvasRenderingContext2D, river: IslandRiver, now: number) {
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  traceIslandPath(ctx, river.points); ctx.lineWidth = river.width + 26; ctx.strokeStyle = "rgba(12, 23, 30, .76)"; ctx.stroke();
  traceIslandPath(ctx, river.points); ctx.lineWidth = river.width; ctx.strokeStyle = "#1d5f78"; ctx.stroke();
  traceIslandPath(ctx, river.points); ctx.lineWidth = river.width * .72; ctx.strokeStyle = "#2d8293"; ctx.stroke();
  traceIslandPath(ctx, river.points); ctx.lineWidth = 3; ctx.setLineDash([18, 28]); ctx.lineDashOffset = -now / 42; ctx.strokeStyle = "rgba(198, 245, 233, .62)"; ctx.stroke(); ctx.restore();
}
function distanceToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax; const dy = by - ay; const len = dx * dx + dy * dy; const t = len ? clamp(((x - ax) * dx + (y - ay) * dy) / len, 0, 1) : 0;
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}
function isPointInRiver(x: number, y: number, islandId: string) {
  const river = getIslandFeatures(islandId).river; if (!river) return false;
  return river.points.some((p, i) => i < river.points.length - 1 && distanceToSegment(x, y, p[0], p[1], river.points[i + 1]![0], river.points[i + 1]![1]) <= river.width / 2 - 8);
}
function drawIslandTrail(ctx: CanvasRenderingContext2D, feature: IslandFeatures, now: number) {
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; traceIslandPath(ctx, feature.trail); ctx.lineWidth = 24; ctx.strokeStyle = "rgba(15, 18, 19, .22)"; ctx.stroke();
  traceIslandPath(ctx, feature.trail); ctx.lineWidth = 9; ctx.strokeStyle = "rgba(202, 173, 126, .15)"; ctx.stroke();
  traceIslandPath(ctx, feature.trail); ctx.lineWidth = 2; ctx.setLineDash([12, 24]); ctx.lineDashOffset = -now / 85; ctx.strokeStyle = "rgba(237, 211, 164, .23)"; ctx.stroke(); ctx.restore();
}
function drawGlowingMushroom(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string, now: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.fillStyle = "#dfd1bc"; ctx.fillRect(-4, -1, 8, 19); ctx.fillStyle = color; ctx.shadowBlur = 12 + Math.sin(now / 240) * 3; ctx.shadowColor = color;
  ctx.beginPath(); ctx.ellipse(0, -3, 16, 9, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
}
function drawIslandLandmark(ctx: CanvasRenderingContext2D, id: string, now: number) {
  const f = getIslandFeatures(id); const x = f.landmarkX; const y = f.landmarkY; ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,.34)"; ctx.beginPath(); ctx.ellipse(0, 47, 116, 25, 0, 0, Math.PI * 2); ctx.fill();
  if (f.landmarkStyle === "pier") {
    ctx.fillStyle = "#4d3428"; ctx.fillRect(-106, -14, 212, 27); ctx.fillStyle = "#a36c43"; for (let i = -3; i <= 3; i += 1) ctx.fillRect(i * 28, -14, 3, 27);
    ctx.fillStyle = "#392921"; for (const px of [-86, -26, 36, 88]) ctx.fillRect(px, 10, 9, 44); ctx.fillStyle = "#d3a365"; ctx.fillRect(-112, -20, 224, 7);
    drawLantern(ctx, -74, -38, now); drawLantern(ctx, 74, -38, now + 300);
  } else if (f.landmarkStyle === "mushroom-ring") {
    ctx.strokeStyle = "rgba(195,117,221,.38)"; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(0, 9, 88, 43, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i += 1) drawGlowingMushroom(ctx, Math.cos(i * Math.PI / 4) * 78, Math.sin(i * Math.PI / 4) * 34, .8, "#d7a8ff", now + i * 90);
  } else if (f.landmarkStyle === "moonwell") {
    const glow = ctx.createRadialGradient(0, 0, 6, 0, 0, 118); glow.addColorStop(0, "rgba(125,230,222,.42)"); glow.addColorStop(1, "rgba(125,230,222,0)"); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0,0,118,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#496b6a"; ctx.lineWidth = 18; ctx.beginPath(); ctx.ellipse(0,8,78,47,-.08,0,Math.PI*2); ctx.stroke(); ctx.fillStyle = "#42919a"; ctx.beginPath(); ctx.ellipse(0,7,61,34,-.08,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#c5f4e3"; ctx.beginPath(); ctx.arc(3, -3 + Math.sin(now/500)*3, 9, 0, Math.PI*2); ctx.fill();
  } else if (f.landmarkStyle === "bell-tower") {
    ctx.fillStyle = "#34313a"; ctx.beginPath(); ctx.moveTo(-55,47); ctx.lineTo(-47,-53); ctx.lineTo(-28,-74); ctx.lineTo(29,-74); ctx.lineTo(48,-50); ctx.lineTo(56,47); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#55414a"; ctx.beginPath(); ctx.moveTo(-64,-50); ctx.lineTo(0,-105); ctx.lineTo(64,-50); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#151923"; ctx.fillRect(-23,-38,46,39);
    ctx.strokeStyle = "#d5a965"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0,-22,12,0,Math.PI*2); ctx.stroke(); ctx.fillStyle = "#c48d52"; ctx.beginPath(); ctx.arc(0,-20,7,0,Math.PI*2); ctx.fill();
  } else {
    ctx.fillStyle = "rgba(29,26,46,.78)"; ctx.beginPath(); ctx.ellipse(0,8,112,46,-.12,0,Math.PI*2); ctx.fill(); ctx.strokeStyle = "#847bbb"; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(0,8,98,38,-.12,0,Math.PI*2); ctx.stroke();
    ctx.shadowBlur = 18; ctx.shadowColor = "#b6a6ff"; for (const s of [[-46,8,36],[0,-3,55],[44,15,30],[10,19,26]] as Array<[number,number,number]>) { ctx.fillStyle = "#8b81c7"; ctx.beginPath(); ctx.moveTo(s[0]-13,s[1]+21); ctx.lineTo(s[0],s[1]-s[2]); ctx.lineTo(s[0]+15,s[1]+21); ctx.closePath(); ctx.fill(); } ctx.shadowBlur = 0;
  }
  ctx.fillStyle = "rgba(13,17,22,.86)"; ctx.fillRect(-100,72,200,25); ctx.strokeStyle = f.accent; ctx.lineWidth=1; ctx.strokeRect(-100,72,200,25); ctx.fillStyle="#fff0d7"; ctx.font="800 13px Poppins,sans-serif"; ctx.textAlign="center"; ctx.fillText(f.landmark,0,89); ctx.restore();
}
function drawIslandDetails(ctx: CanvasRenderingContext2D, id: string, now: number) {
  const f = getIslandFeatures(id); const index = Math.max(0, HALLOWEEN_ISLANDS.findIndex((island) => island.id === id));
  for (let i=0;i<10;i+=1) { const x=160+((i*307+index*193)%2880); const y=170+((i*239+index*317)%1520); if(Math.hypot(x-f.landmarkX,y-f.landmarkY)<180) continue;
    if(f.landmarkStyle === "pier") { drawPumpkin(ctx,x,y,.72,now+i*170); if(i%2===0) drawLantern(ctx,x+48,y-50,now+i*260); }
    else if(f.landmarkStyle === "mushroom-ring") drawGlowingMushroom(ctx,x,y,.72,i%2?"#c88cef":"#8bdaaf",now+i*110);
    else if(f.landmarkStyle === "moonwell") { ctx.save(); ctx.translate(x,y); ctx.fillStyle="rgba(133,200,175,.45)"; ctx.beginPath(); ctx.ellipse(0,0,18,7,-.15,0,Math.PI*2); ctx.fill(); ctx.strokeStyle="#8aa98a"; ctx.lineWidth=2; for(let r=-1;r<=1;r+=1){ctx.beginPath();ctx.moveTo(r*6,4);ctx.lineTo(r*7-3,-17-Math.abs(r)*3);ctx.stroke();} ctx.restore(); }
    else if(f.landmarkStyle === "bell-tower") { ctx.fillStyle="#4d4548"; ctx.fillRect(x-17,y-4,34,13); ctx.fillStyle="#756466"; ctx.fillRect(x-11,y-12,22,8); }
    else { ctx.save();ctx.translate(x,y);ctx.fillStyle="rgba(129,128,208,.42)";ctx.shadowBlur=9;ctx.shadowColor="#9997ed";ctx.beginPath();ctx.moveTo(-8,10);ctx.lineTo(-2,-17-(i%3)*3);ctx.lineTo(4,10);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.restore(); }
  }
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, style: TreeStyle) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = "rgba(4,8,11,.48)"; ctx.beginPath(); ctx.ellipse(0, 61, 36, 11, 0, 0, Math.PI * 2); ctx.fill();
  if (style === "crystal") {
    ctx.shadowBlur = 15; ctx.shadowColor = "#a9a4ff"; ctx.fillStyle = "#4b568d"; ctx.beginPath(); ctx.moveTo(-8, 56); ctx.lineTo(-18, 2); ctx.lineTo(-3, -46); ctx.lineTo(8, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8c91d9"; ctx.beginPath(); ctx.moveTo(4, 56); ctx.lineTo(13, -5); ctx.lineTo(29, -34); ctx.lineTo(26, 19); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = style === "witchwood" ? "#30243c" : style === "willow" ? "#202e2e" : style === "deadwood" ? "#302b32" : "#161b1d"; ctx.fillRect(-7, 4, 14, 65);
    ctx.strokeStyle = style === "deadwood" ? "#4c4245" : "#111619"; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-2, 28); ctx.lineTo(-22, 13); ctx.lineTo(-34, 16); ctx.moveTo(2, 19); ctx.lineTo(22, 3); ctx.lineTo(34, 5); ctx.moveTo(-1, 43); ctx.lineTo(-25, 34); ctx.moveTo(2, 38); ctx.lineTo(26, 24); ctx.stroke();
    if (style === "witchwood") {
      for (const [cx, cy, radius] of [[-24, 3, 25], [0, -18, 31], [25, 0, 27]] as Array<[number, number, number]>) { ctx.fillStyle = cx < 0 ? "#314a3e" : "#3c384b"; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#f0a7ff"; ctx.shadowBlur = 10; ctx.shadowColor = "#d68df2"; ctx.beginPath(); ctx.arc(-10, 2, 3, 0, Math.PI * 2); ctx.arc(18, -17, 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    } else if (style === "willow") {
      ctx.fillStyle = "#304b48"; ctx.beginPath(); ctx.ellipse(0, -24, 37, 24, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#668b7c"; ctx.lineWidth = 4;
      for (let i = -3; i <= 3; i += 1) { ctx.beginPath(); ctx.moveTo(i * 9, -12); ctx.quadraticCurveTo(i * 13, 22, i * 11 + 4, 47); ctx.stroke(); }
    } else if (style === "deadwood") {
      ctx.strokeStyle = "#51474c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-16, 23); ctx.lineTo(-44, -7); ctx.lineTo(-50, -26); ctx.moveTo(18, 13); ctx.lineTo(42, -14); ctx.lineTo(48, -34); ctx.stroke();
    } else {
      ctx.fillStyle = "#0d1417"; ctx.beginPath(); ctx.moveTo(0,-54); ctx.lineTo(-38,10); ctx.lineTo(-16,4); ctx.lineTo(-46,39); ctx.lineTo(-14,32); ctx.lineTo(-27,60); ctx.lineTo(27,60); ctx.lineTo(14,32); ctx.lineTo(46,39); ctx.lineTo(16,4); ctx.lineTo(38,10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,91,78,.42)"; ctx.beginPath(); ctx.arc(Math.sin(now / 900 + x) * 3, 10, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
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
