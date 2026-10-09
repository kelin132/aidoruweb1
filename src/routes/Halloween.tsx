import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/aidoru/AppShell";
import KnightInTheNight from "@/components/aidoru/KnightInTheNight";
import "@/styles/knight-game.css";

export const Route = createFileRoute("/Halloween")({
  head: () => ({
    meta: [
      { title: "Knight in the Night — AIDORU Halloween Game" },
      {
        name: "description",
        content:
          "Explore five haunted islands, earn 4–5M coins, and find other AIDORU explorers on the live Halloween map.",
      },
      { property: "og:title", content: "Knight in the Night — AIDORU Halloween Game" },
      {
        property: "og:description",
        content: "Explore five haunted islands, collect candy, and spot other players on AIDORU's live Halloween map.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://aidoru.zone.id/Halloween" },
      { property: "og:image", content: "https://aidoru.zone.id/halloween-game-preview.jpg" },
      { property: "og:image:alt", content: "Anime characters gathered around a Happy Halloween message." },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "736" },
      { property: "og:image:height", content: "750" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Knight in the Night — AIDORU Halloween Game" },
      {
        name: "twitter:description",
        content: "Explore five haunted islands, collect candy, and spot other players on AIDORU's live Halloween map.",
      },
      { name: "twitter:image", content: "https://aidoru.zone.id/halloween-game-preview.jpg" },
      { name: "twitter:image:alt", content: "Anime characters gathered around a Happy Halloween message." },
    ],
  }),
  component: HalloweenPage,
});

function HalloweenPage() {
  return (
    <AppShell
      title="Knight in the Night"
      subtitle="Explore five scrolling islands, earn 4–5M coins, and spot other players on the live Halloween map."
      hidePageHeading
    >
      <KnightInTheNight />
    </AppShell>
  );
}
