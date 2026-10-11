import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

function getConfiguredPublicOrigin(): string {
  const configuredUrl = process.env["PUBLIC_APP_URL"]?.trim() || "https://aidoru.zone.id";
  try {
    return new URL(configuredUrl).origin;
  } catch {
    return "https://aidoru.zone.id";
  }
}

const publicAppOrigins = new Set([getConfiguredPublicOrigin()]);

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  origin: (origin) => publicAppOrigins.has(origin),
  secFetchSite: (site, ctx) => {
    if (site === "same-origin") return true;
    if (site !== "same-site") return false;
    const origin = ctx.request.headers.get("Origin");
    return origin !== null && publicAppOrigins.has(origin);
  },
  referer: (referer) => {
    try {
      return publicAppOrigins.has(new URL(referer).origin);
    } catch {
      return false;
    }
  },
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
