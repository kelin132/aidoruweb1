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
          "A Halloween knight adventure with touch controls for phones and keyboard controls for desktop.",
      },
    ],
  }),
  component: HalloweenPage,
});

function HalloweenPage() {
  return (
    <AppShell
      title="Knight in the Night"
      subtitle="Help the knight through the haunted grounds. Works with touch controls or a keyboard."
    >
      <KnightInTheNight />
    </AppShell>
  );
}
