import { createFileRoute } from "@tanstack/react-router";
import { Portal } from "./index";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — AIDORU" },
      {
        name: "description",
        content: "Sign in to your AIDORU trainer account.",
      },
    ],
  }),
  component: () => <Portal standalone />,
});
