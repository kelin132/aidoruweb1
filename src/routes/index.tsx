import { createFileRoute } from "@tanstack/react-router";
import { AidoruLanding } from "@/components/aidoru/AidoruLanding";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AIDORU — Trainer Network" },
      {
        name: "description",
        content: "An anime-inspired trainer network for your cards, Pokémon, battles, and community.",
      },
      { property: "og:title", content: "AIDORU — Trainer Network" },
    ],
    links: [
      {
        rel: "preload",
        href: "/aidoru-login-library.webp",
        as: "image",
        type: "image/webp",
      },
    ],
  }),
  component: AidoruLanding,
});
