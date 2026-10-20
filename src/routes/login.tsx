import { createFileRoute } from "@tanstack/react-router";
import { PhoneLoginPage } from "@/components/aidoru/PhoneLoginPage";

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
  component: PhoneLoginPage,
});
