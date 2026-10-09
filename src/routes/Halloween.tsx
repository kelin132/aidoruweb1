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
