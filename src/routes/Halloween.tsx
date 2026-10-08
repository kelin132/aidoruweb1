import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Expand,
  Gamepad2,
  Keyboard,
  MousePointer2,
  RotateCcw,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/aidoru/AppShell";

export const Route = createFileRoute("/Halloween")({
  head: () => ({
    meta: [
      { title: "Halloween Event: The Catrooms — AIDORU" },
      {
        name: "description",
        content:
          "Enter The Catrooms for AIDORU's Halloween event. Find all 14 trinkets before the demonic cats find you.",
      },
    ],
  }),
  component: HalloweenPage,
});

function HalloweenPage() {
  const [gameStarted, setGameStarted] = useState(false);
  const [gameVersion, setGameVersion] = useState(0);
  const gameFrame = useRef<HTMLIFrameElement>(null);

  const enterGame = () => {
    setGameStarted(true);
    setGameVersion((version) => version + 1);
    window.setTimeout(() => {
      document.getElementById("catrooms-game")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 0);
  };

  return (
    <AppShell
      title="Halloween Event"
      subtitle="The Catrooms are open. Find your way out before the cats find you."
    >
      <div className="halloween-event-page">
        <section className="halloween-hero hof-panel">
          <div className="halloween-hero-copy">
            <p className="halloween-eyebrow">
              <span aria-hidden="true">✦</span> AIDORU BOT EVENT <span aria-hidden="true">✦</span>
            </p>
            <h2 className="halloween-title">The Catrooms</h2>
            <p className="halloween-lede">
              A wrong turn. Endless rooms. Something with glowing eyes is close behind.
            </p>
            <p className="halloween-objective">
              Find all <strong>14 trinkets</strong> and escape before the demonic cats catch you.
            </p>
            <button type="button" onClick={enterGame} className="halloween-enter-button">
              <Gamepad2 aria-hidden="true" className="size-5" />
              Enter the Catrooms
            </button>
          </div>
          <div className="halloween-hero-art">
            <img
              src="/catrooms/screenshot.png"
              alt="A dark maze from The Catrooms, with a red demonic cat waiting between the walls"
            />
            <span className="halloween-art-glow" aria-hidden="true" />
            <span className="halloween-art-caption">DON’T FOLLOW THE EYES</span>
          </div>
        </section>

        <section className="halloween-briefing" aria-label="Game objective">
          <div className="halloween-briefing-card">
            <span className="halloween-briefing-number">14</span>
            <div>
              <p className="halloween-briefing-label">TRINKETS</p>
              <p className="halloween-briefing-detail">Collect every one to escape</p>
            </div>
          </div>
          <div className="halloween-briefing-card">
            <span className="halloween-briefing-icon" aria-hidden="true">
              ◉
            </span>
            <div>
              <p className="halloween-briefing-label">KEEP MOVING</p>
              <p className="halloween-briefing-detail">Demonic cats are on the hunt</p>
            </div>
          </div>
          <div className="halloween-briefing-card">
            <span
              className="halloween-briefing-icon halloween-briefing-icon-exit"
              aria-hidden="true"
            >
              ↗
            </span>
            <div>
              <p className="halloween-briefing-label">FIND THE EXIT</p>
              <p className="halloween-briefing-detail">The final trinket has no guide</p>
            </div>
          </div>
        </section>

        <section id="catrooms-game" className="halloween-game-panel hof-panel">
          <div className="halloween-game-heading">
            <div>
              <p className="halloween-eyebrow">THE EVENT GAME</p>
              <h3 className="halloween-section-title">Stay sharp in the maze</h3>
            </div>
            <div className="halloween-game-actions">
              {gameStarted && (
                <button
                  type="button"
                  onClick={enterGame}
                  className="halloween-icon-button"
                  aria-label="Restart The Catrooms"
                  title="Restart game"
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                  <span className="sr-only">Restart</span>
                </button>
              )}
              {gameStarted && (
                <button
                  type="button"
                  onClick={() => void gameFrame.current?.requestFullscreen()}
                  className="halloween-fullscreen-button"
                >
                  <Expand aria-hidden="true" className="size-4" />
                  Full screen
                </button>
              )}
            </div>
          </div>

          <div className="halloween-game-window">
            {gameStarted ? (
              <iframe
                key={gameVersion}
                ref={gameFrame}
                src="/catrooms/index.html"
                title="The Catrooms — playable Halloween event game"
                allow="fullscreen; gamepad; autoplay; pointer-lock"
                allowFullScreen
                loading="eager"
                referrerPolicy="same-origin"
              />
            ) : (
              <div className="halloween-game-ready">
                <img src="/catrooms/screenshot.png" alt="" aria-hidden="true" />
                <div className="halloween-game-ready-shade" />
                <div className="halloween-game-ready-copy">
                  <p className="halloween-eyebrow">14 TRINKETS. NO WAY BACK.</p>
                  <h4>Ready to get lost?</h4>
                  <button type="button" onClick={enterGame} className="halloween-enter-button">
                    <Gamepad2 aria-hidden="true" className="size-5" />
                    Play The Catrooms
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="halloween-controls" aria-label="Game controls">
            <div className="halloween-control">
              <Keyboard aria-hidden="true" />
              <p>
                <strong>Move</strong>
                <span>WASD or arrow keys</span>
              </p>
            </div>
            <div className="halloween-control">
              <MousePointer2 aria-hidden="true" />
              <p>
                <strong>Look around</strong>
                <span>Move the mouse</span>
              </p>
            </div>
            <div className="halloween-control">
              <Smartphone aria-hidden="true" />
              <p>
                <strong>On mobile</strong>
                <span>Left side moves, right side looks</span>
              </p>
            </div>
            <div className="halloween-control">
              <Sparkles aria-hidden="true" />
              <p>
                <strong>Release mouse</strong>
                <span>Press Esc</span>
              </p>
            </div>
          </div>
        </section>

        <footer className="halloween-attribution">
          <span>Made for the AIDORU bot Halloween event.</span>
          <span>
            The Catrooms by James William Fletcher ·{" "}
            <a href="https://github.com/mrbid/Catrooms" target="_blank" rel="noreferrer">
              source
            </a>
            {" · "}
            <a href="/catrooms/LICENSE" target="_blank" rel="noreferrer">
              MIT license
            </a>
          </span>
        </footer>
      </div>
    </AppShell>
  );
}
