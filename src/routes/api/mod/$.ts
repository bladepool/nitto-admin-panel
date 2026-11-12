import { createFileRoute } from "@tanstack/react-router";

import { gameApiHandlers } from "@/lib/game-proxy";

/* Relays /api/mod/* (racer lookup, ban/mute/kick) to the game API; see src/lib/game-proxy.ts. */
export const Route = createFileRoute("/api/mod/$")({
  server: { handlers: gameApiHandlers },
});
