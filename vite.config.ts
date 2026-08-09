// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { createRequire } from "node:module";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const nodeRequire = createRequire(import.meta.url);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
        // mongodb -> whatwg-url -> tr46 does `require("punycode/")`. The Worker
        // bundler maps that to a unenv shim that doesn't exist. Resolve it to the
        // userland punycode package instead.
        name: "punycode-slash-shim",
        enforce: "pre" as const,
        resolveId(source: string) {
          if (source === "punycode/" || source === "punycode") {
            return nodeRequire.resolve("punycode/punycode.js");
          }
          return null;
        },
      },
    ],
  },
});
