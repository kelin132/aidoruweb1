import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { AppShell } from "@/components/aidoru/AppShell";
import "@/styles/aparichit.css";

const ASSET_BASE = "https://raw.githubusercontent.com/hitarthpathak/Aparichit/main";
const OPENING_VIDEO = ASSET_BASE + "/Videos/Video%201.mp4";
const JUDGMENT_VIDEO = ASSET_BASE + "/Videos/Video%202.mp4";
const THEME_SONG = ASSET_BASE + "/Audios/Theme%20Song.mp3";
const BACKDROP_IMAGE = ASSET_BASE + "/Images/Hell.jpg";

type StoryStep = "welcome" | "opening" | "plea" | "judgment";

export const Route = createFileRoute("/Halloween")({
  head: () => ({
    meta: [
      { title: "Aparichit — AIDORU Halloween Story" },
      {
        name: "description",
        content:
          "An Android-friendly, tap-to-play Aparichit horror story for the AIDORU Halloween event.",
      },
    ],
  }),
  component: HalloweenPage,
});

function HalloweenPage() {
  const [step, setStep] = useState<StoryStep>("welcome");
  const [plea, setPlea] = useState("");
  const [musicPlaying, setMusicPlaying] = useState(false);
  const musicRef = useRef<HTMLAudioElement>(null);

  const progressStep = step === "opening" ? 1 : step === "plea" ? 2 : step === "judgment" ? 3 : 0;
  const progressPercent =
    progressStep === 0
      ? "0%"
      : progressStep === 1
        ? "33.33%"
        : progressStep === 2
          ? "66.66%"
          : "100%";

  const toggleMusic = () => {
    const audio = musicRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio
        .play()
        .then(() => setMusicPlaying(true))
        .catch(() => setMusicPlaying(false));
    } else {
      audio.pause();
      setMusicPlaying(false);
    }
  };

  const submitPlea = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStep("judgment");
  };

  const restartStory = () => {
    musicRef.current?.pause();
    setMusicPlaying(false);
    setPlea("");
    setStep("welcome");
  };

  return (
    <AppShell
      title="Aparichit"
      subtitle="An interactive horror story. Tap to load and play each video."
    >
      <main className="aparichit-page">
        <section className="aparichit-panel aparichit-hero" aria-labelledby="aparichit-title">
          <div className="aparichit-hero-copy">
            <p className="aparichit-kicker">AIDORU HALLOWEEN STORY</p>
            <h1 id="aparichit-title" className="aparichit-title" lang="hi">
              अपरिचित
            </h1>
            <p className="aparichit-tagline" lang="hi">
              गलती की सजा — मौत!
            </p>
            <p className="aparichit-copy" lang="hi">
              कलयुग अपने अंतिम चरण पर पहुँच चुका है। पाप का घड़ा भर चुका है। सबको अपने पापों का
              प्रायश्चित करवाने अपरिचित आ रहा है।
            </p>
            <p className="aparichit-copy">
              The age of Kali has reached its final stage. The stranger is coming to make everyone
              atone.
            </p>
          </div>
        </section>

        <section
          className="aparichit-panel aparichit-story"
          aria-label="Aparichit story experience"
        >
          <div className="aparichit-story-top">
            <p className="aparichit-kicker">
              {step === "welcome" ? "THREE STEPS · ONE JUDGMENT" : "STEP " + progressStep + " OF 3"}
            </p>
            <button
              type="button"
              className="aparichit-music-button"
              onClick={toggleMusic}
              aria-pressed={musicPlaying}
              aria-label={musicPlaying ? "Turn theme music off" : "Turn theme music on"}
              title={musicPlaying ? "Turn music off" : "Play theme music"}
            >
              {musicPlaying ? (
                <VolumeX aria-hidden="true" size={18} />
              ) : (
                <Volume2 aria-hidden="true" size={18} />
              )}
              <span className="aparichit-music-label">
                {musicPlaying ? "Music on" : "Play music"}
              </span>
            </button>
          </div>

          <div
            className="aparichit-progress"
            role="progressbar"
            aria-label="Story progress"
            aria-valuemin={0}
            aria-valuemax={3}
            aria-valuenow={progressStep}
          >
            <div className="aparichit-progress-fill" style={{ width: progressPercent }} />
          </div>

          {step === "welcome" && (
            <div className="aparichit-stage" aria-live="polite">
              <h2 className="aparichit-stage-title">The stranger is waiting.</h2>
              <p className="aparichit-stage-copy">
                Watch the opening, write your plea, then face the judgment. Your videos use
                Android’s built-in playback controls and load only when you open them.
              </p>
              <button type="button" className="aparichit-button" onClick={() => setStep("opening")}>
                <Play aria-hidden="true" size={18} />
                Begin the story
                <ArrowRight aria-hidden="true" size={18} />
              </button>
            </div>
          )}

          {step === "opening" && (
            <div className="aparichit-stage" aria-live="polite">
              <h2 className="aparichit-stage-title">The warning</h2>
              <p className="aparichit-stage-copy" lang="hi">
                कलयुग अपने अंतिम चरण पर पहुँच चुका है।
              </p>
              <video
                className="aparichit-video"
                controls
                playsInline
                preload="none"
                poster={BACKDROP_IMAGE}
                aria-label="Aparichit opening video"
              >
                <source src={OPENING_VIDEO} type="video/mp4" />
                Your browser cannot play this video. Use the direct video link below.
              </video>
              <p className="aparichit-video-fallback">
                If playback does not start,{" "}
                <a className="aparichit-link" href={OPENING_VIDEO} target="_blank" rel="noreferrer">
                  open the video directly
                </a>
                .
              </p>
              <div className="aparichit-actions">
                <button
                  type="button"
                  className="aparichit-secondary-button"
                  onClick={() => setStep("welcome")}
                >
                  <ArrowLeft aria-hidden="true" size={18} /> Back
                </button>
                <button type="button" className="aparichit-button" onClick={() => setStep("plea")}>
                  Continue to your plea <ArrowRight aria-hidden="true" size={18} />
                </button>
              </div>
            </div>
          )}

          {step === "plea" && (
            <div className="aparichit-stage" aria-live="polite">
              <h2 className="aparichit-stage-title" lang="hi">
                अपनी समस्या लिखो। अपरिचित इंसाफ करेगा।
              </h2>
              <p className="aparichit-stage-copy" lang="hi">
                गरुड़ पुराण के हिसाब से सबको सजा मिलेगी।
              </p>
              <form className="aparichit-form" onSubmit={submitPlea}>
                <label className="aparichit-label" htmlFor="aparichit-plea">
                  Write your plea
                </label>
                <textarea
                  id="aparichit-plea"
                  className="aparichit-textarea"
                  value={plea}
                  onChange={(event) => setPlea(event.currentTarget.value)}
                  maxLength={600}
                  rows={5}
                  placeholder="What should the stranger know?"
                  enterKeyHint="done"
                />
                <p className="aparichit-privacy">
                  This is only part of the story. Your text stays in this page, is never sent or
                  saved, and clears when you restart or leave.
                </p>
                <div className="aparichit-actions">
                  <button
                    type="button"
                    className="aparichit-secondary-button"
                    onClick={() => setStep("opening")}
                  >
                    <ArrowLeft aria-hidden="true" size={18} /> Back to the warning
                  </button>
                  <button type="submit" className="aparichit-button">
                    Face the judgment <ArrowRight aria-hidden="true" size={18} />
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === "judgment" && (
            <div className="aparichit-stage" aria-live="polite">
              <h2 className="aparichit-stage-title" lang="hi">
                गलती की सजा — मौत!
              </h2>
              <p className="aparichit-stage-copy">
                The judgment begins. Tap the video’s play button to watch.
              </p>
              <video
                className="aparichit-video"
                controls
                playsInline
                preload="none"
                poster={BACKDROP_IMAGE}
                aria-label="Aparichit judgment video"
              >
                <source src={JUDGMENT_VIDEO} type="video/mp4" />
                Your browser cannot play this video. Use the direct video link below.
              </video>
              <p className="aparichit-video-fallback">
                If playback does not start,{" "}
                <a
                  className="aparichit-link"
                  href={JUDGMENT_VIDEO}
                  target="_blank"
                  rel="noreferrer"
                >
                  open the video directly
                </a>
                .
              </p>
              <div className="aparichit-actions">
                <button
                  type="button"
                  className="aparichit-secondary-button"
                  onClick={() => setStep("plea")}
                >
                  <ArrowLeft aria-hidden="true" size={18} /> Back to your plea
                </button>
                <button type="button" className="aparichit-button" onClick={restartStory}>
                  <RotateCcw aria-hidden="true" size={18} /> Restart story
                </button>
              </div>
            </div>
          )}

          <footer className="aparichit-story-footer">
            <p className="aparichit-attribution">
              Adapted from the{" "}
              <a
                className="aparichit-link"
                href="https://github.com/hitarthpathak/Aparichit"
                target="_blank"
                rel="noreferrer"
              >
                Aparichit project
              </a>
              . Its videos and theme music stream from the source repository when played.
            </p>
            <p className="aparichit-attribution">
              No sound or video starts until you choose to play it.
            </p>
          </footer>
        </section>

        <audio ref={musicRef} className="aparichit-audio" preload="none" loop>
          <source src={THEME_SONG} type="audio/mpeg" />
        </audio>
      </main>
    </AppShell>
  );
}
