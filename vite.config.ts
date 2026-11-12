// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Lovable's default build target is Cloudflare Workers (`cloudflare-module`). This app is
  // self-hosted as a plain Node process on the same VPS as the game backend (proxied by nginx,
  // run under systemd), not deployed to Cloudflare, so it needs Nitro's standard Node server
  // output instead.
  nitro: { preset: "node-server" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      // Local dev: proxy same-origin "/api" requests to the native backend-v2 server instead of
      // pointing VITE_API_BASE_URL cross-origin at it. The admin API has no CORS headers and its
      // session cookie isn't SameSite=None, so a cross-origin fetch from the Vite dev port would
      // be blocked by the browser -- this keeps everything same-origin from the browser's view,
      // matching how it actually runs in production. Override the target with
      // NITTO_BACKEND_PROXY_TARGET if the backend runs on a different host/port locally.
      // /api/mod (racer lookup) and /api/auth (game login for the staff-route credential) are
      // game-API routes the Tournaments / Badges / Events pages also call.
      proxy: Object.fromEntries(
        ["/api/admin", "/api/mod", "/api/auth"].map((prefix) => [
          prefix,
          {
            target: process.env["NITTO_BACKEND_PROXY_TARGET"] || "http://localhost:8082",
            changeOrigin: true,
          },
        ]),
      ),
    },
  },
});
