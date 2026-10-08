import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const WIDTH = 960;
const HEIGHT = 540;
const CANDY_GOAL = 10;
const ENEMY_STARTS = [
  [110, 125],
  [260, 110],
  [440, 105],
  [650, 112],
  [835, 125],
  [160, 330],
  [785, 325],
  [300, 440],
  [625, 435],
  [865, 430],
] as const;

type Screen = "intro" | "playing" | "won" | "lost";
type DirectionControl = "up" | "down" | "left" | "right";
type Control = DirectionControl | "attack" | "roll";

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
  candyCollected: number;
  kills: number;
}

interface InputState {
  held: Set<DirectionControl>;
  attackQueued: boolean;
  rollQueued: boolean;
}

function createGame(): GameState {
  return {
    player: {
      x: WIDTH / 2,
      y: HEIGHT - 105,
      hp: 4,
      directionX: 0,
      directionY: -1,
      invulnerableUntil: 0,
      rollUntil: 0,
      rollCooldownUntil: 0,
      attackCooldownUntil: 0,
      swingUntil: 0,
    },
    enemies: ENEMY_STARTS.map(([x, y], index) => ({
      x,
      y,
      hp: 1,
      phase: index * 0.8,
      kind: index % 3 === 0 ? "bat" : "ghost",
    })),
    candies: [],
    candyCollected: 0,
    kills: 0,
  };
}

export default function KnightInTheNight() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(createGame());
  const inputRef = useRef<InputState>({
    held: new Set<DirectionControl>(),
    attackQueued: false,
    rollQueued: false,
  });
  const screenRef = useRef<Screen>("intro");
  const [screen, setScreenState] = useState<Screen>("intro");
  const [health, setHealth] = useState(4);
  const [candies, setCandies] = useState(0);
  const [kills, setKills] = useState(0);

  const setScreen = (next: Screen) => {
    screenRef.current = next;
    setScreenState(next);
  };

  const startGame = () => {
    gameRef.current = createGame();
    inputRef.current = {
      held: new Set<DirectionControl>(),
      attackQueued: false,
      rollQueued: false,
    };
    setHealth(4);
    setCandies(0);
    setKills(0);
    setScreen("playing");
  };

  useEffect(() => {
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

      context.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
      drawGame(context, game, timestamp);
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
  }, []);

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
      {control === "attack" ? "SLASH" : control === "roll" ? "ROLL" : directionGlyph(control)}
    </button>
  );

  const isPlaying = screen === "playing";
  const resultTitle =
    screen === "won" ? "Candy secured!" : screen === "lost" ? "The ghosts got you." : "";

  return (
    <main className="knight-page">
      <section className="knight-frame" aria-label="Knight in the Night game">
        <div className="knight-game-header">
          <div>
            <p className="knight-eyebrow">AIDORU · HALLOWEEN QUEST</p>
            <h1 className="knight-title">Knight in the Night</h1>
          </div>
          <div className="knight-stats" aria-live="polite">
            <span className="knight-stat" aria-label={`Health ${health} out of 4`}>
              <span aria-hidden="true">♥</span> {health}/4
            </span>
            <span className="knight-stat" aria-label={`Candy ${candies} of ${CANDY_GOAL}`}>
              <span aria-hidden="true">🍬</span> {candies}/{CANDY_GOAL}
            </span>
            <span className="knight-stat" aria-label={`${kills} ghosts defeated`}>
              <span aria-hidden="true">☠</span> {kills}/10
            </span>
          </div>
        </div>

        <div className="knight-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="knight-canvas"
            width={WIDTH}
            height={HEIGHT}
            role="img"
            aria-label="Top-down haunted courtyard. Move the knight, defeat ten ghosts, and collect their candy."
          />
          {!isPlaying && (
            <div className="knight-overlay">
              <div className="knight-overlay-card" role="status">
                <p className="knight-eyebrow">
                  {screen === "intro" ? "A HAUNTED MANSION · TEN GHOSTS" : "THE NIGHT IS OVER"}
                </p>
                <h2>{screen === "intro" ? "Trick-or-treat has teeth." : resultTitle}</h2>
                <p>
                  {screen === "intro"
                    ? "Rohan has wandered into a haunted mansion. Fight through the ghosts, gather their candy, and make it out."
                    : screen === "won"
                      ? "You cleared the grounds and collected every last sweet."
                      : "The haunted grounds are still waiting. Try again and keep moving."}
                </p>
                <button type="button" className="knight-start-button" onClick={startGame}>
                  {screen === "intro" ? "Enter the grounds" : "Play again"}
                  <span aria-hidden="true">→</span>
                </button>
                <small>
                  {screen === "intro"
                    ? "Touch buttons work on phones · WASD / arrows, J / Space, K on keyboard"
                    : `${kills} ghosts defeated · ${candies} candy collected`}
                </small>
              </div>
            </div>
          )}
        </div>

        <div className="knight-game-footer">
          <div className="knight-objective">
            <span className="knight-objective-dot" aria-hidden="true" />
            <span>
              {isPlaying
                ? "Defeat the ghosts and collect 10 pieces of candy."
                : "Move with the pad. Slash ghosts, roll to dodge, collect the candy they drop."}
            </span>
          </div>
          <div className="knight-controls-hint">
            WASD / arrows · J or Space to slash · K to roll
          </div>
        </div>
      </section>

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
          {controlButton("attack", "Slash with sword", "knight-action-button knight-slash-button")}
        </div>
      </section>

      <p className="knight-credit">
        A browser adaptation inspired by{" "}
        <a href="https://github.com/yashk2000/KnightInTheNight" target="_blank" rel="noreferrer">
          KnightInTheNight
        </a>{" "}
        by Preet Shah, Shambhavi Aggarwal, Rohan Rout, and Yash Khare · Apache-2.0. This adaptation
        uses original canvas artwork.
      </p>
    </main>
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
  player.x = clamp(player.x, 38, WIDTH - 38);
  player.y = clamp(player.y, 80, HEIGHT - 38);

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

  if (game.candyCollected >= CANDY_GOAL) finish("won");
}

function drawGame(ctx: CanvasRenderingContext2D, game: GameState, now: number) {
  drawCourtyard(ctx, now);
  for (const candy of game.candies) drawCandy(ctx, candy);
  for (const enemy of game.enemies) drawEnemy(ctx, enemy);
  drawKnight(ctx, game.player, now);
}

function drawCourtyard(ctx: CanvasRenderingContext2D, now: number) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const ground = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  ground.addColorStop(0, "#283329");
  ground.addColorStop(0.5, "#1a2724");
  ground.addColorStop(1, "#131c22");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(176, 211, 186, 0.12)";
  for (let i = 0; i < 160; i += 1) {
    const px = (i * 137 + 19) % WIDTH;
    const py = (i * 83 + 47) % HEIGHT;
    ctx.fillRect(px, py, 2 + (i % 3), 1);
  }

  ctx.fillStyle = "#0d131a";
  ctx.beginPath();
  ctx.moveTo(270, 0);
  ctx.lineTo(278, 58);
  ctx.lineTo(324, 102);
  ctx.lineTo(636, 102);
  ctx.lineTo(682, 58);
  ctx.lineTo(690, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#242329";
  ctx.fillRect(343, 36, 274, 80);
  ctx.fillStyle = "#362725";
  ctx.fillRect(420, 40, 120, 76);
  ctx.fillStyle = "#101116";
  ctx.fillRect(451, 58, 58, 58);
  ctx.fillStyle = "rgba(255, 160, 66, 0.2)";
  ctx.fillRect(458, 64, 44, 52);
  ctx.fillStyle = "#b85c36";
  ctx.fillRect(336, 31, 288, 9);

  ctx.strokeStyle = "rgba(199, 193, 149, 0.13)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(480, 512);
  ctx.lineTo(480, 433);
  ctx.lineTo(535, 368);
  ctx.lineTo(535, 255);
  ctx.stroke();

  for (const [x, y] of [
    [74, 87],
    [890, 93],
    [63, 423],
    [910, 410],
    [247, 236],
    [711, 253],
  ] as const) {
    drawTree(ctx, x, y, now);
  }
  drawPumpkin(ctx, 132, 479, 1.05, now);
  drawPumpkin(ctx, 826, 475, 0.9, now + 400);
  drawLantern(ctx, 366, 130, now);
  drawLantern(ctx, 593, 130, now + 600);

  const shade = ctx.createRadialGradient(480, 270, 145, 480, 270, 610);
  shade.addColorStop(0, "rgba(7, 10, 15, 0)");
  shade.addColorStop(1, "rgba(6, 8, 14, 0.64)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(220, 230, 216, 0.16)";
  for (let i = 0; i < 8; i += 1) {
    const drift = ((now / 70 + i * 119) % (WIDTH + 180)) - 90;
    ctx.beginPath();
    ctx.ellipse(drift, 167 + i * 49, 76, 10, 0, 0, Math.PI * 2);
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
