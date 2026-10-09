import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="glass max-w-md rounded-3xl p-10 text-center">
        <h1 className="font-display text-gradient-brand text-7xl font-bold">404</h1>
        <h2 className="text-foreground mt-4 text-xl font-semibold">Off the map</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          This zone doesn't exist in the trainer hub.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="bg-gradient-brand text-foreground glow-pink inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            Return to portal
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const isBattleFailure = /battle room|battle|trainer|not signed in|database|mongodb/i.test(
    rawMessage,
  );
  const displayTitle = isBattleFailure ? "Battle signal lost" : "Signal lost";
  const displayMessage = isBattleFailure
    ? rawMessage || "This battle room is unavailable. It may have expired or is waking up."
    : "Something went wrong on our end. Try again or head back to the portal.";
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="glass max-w-md rounded-3xl p-10 text-center">
        <h1 className="text-foreground font-display text-xl font-semibold tracking-tight">
          {displayTitle}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">{displayMessage}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="bg-gradient-brand text-foreground inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            Try again
          </button>
          <a
            href="/"
            className="border-border text-foreground hover:bg-accent/20 inline-flex items-center justify-center rounded-full border px-5 py-2.5 text-sm font-medium"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: ({ matches }) => {
    const isHalloweenPage = matches.some((match) => match.pathname === "/Halloween");
    const socialTitle = isHalloweenPage
      ? "Knight in the Night — AIDORU Halloween Game"
      : "aidoru community";
    const socialDescription = isHalloweenPage
      ? "Explore five haunted islands, collect candy, and earn 1–8 Halloween event cards on each island."
      : "aidoru community is an anime trainer hub for live profiles, cards, parties, the Mart, battles, guilds, and arcade games synced with your bot.";
    const socialOgDescription = isHalloweenPage
      ? "Explore five haunted islands, collect candy, and earn 1–8 Halloween event cards on each island."
      : "aidoru community for live bot-synced profiles, cards, parties, battles, the Mart, guilds, and arcade games.";
    const socialImage = isHalloweenPage
      ? "https://aidoru.zone.id/halloween-game-preview.jpg"
      : "https://raw.githubusercontent.com/kelin132/aidoruweb1/main/public/aidoru-battle-preview.jpg";
    const socialImageAlt = isHalloweenPage
      ? "Anime characters gathered around a Happy Halloween message."
      : "AIDORU Pokémon battle artwork";

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "aidoru community" },
        { name: "description", content: socialDescription },
        { name: "author", content: "AIDORU" },
        { property: "og:title", content: socialTitle },
        { property: "og:description", content: socialOgDescription },
        { property: "og:type", content: "website" },
        ...(isHalloweenPage
          ? [{ property: "og:url", content: "https://aidoru.zone.id/Halloween" }]
          : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: socialTitle },
        { name: "twitter:description", content: socialOgDescription },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Poppins:wght@400;500;600;700;800&display=swap",
        },
        { rel: "icon", href: "/favicon.png", type: "image/png" },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
