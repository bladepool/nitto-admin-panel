import { createFileRoute } from "@tanstack/react-router";

import { gameApiHandlers } from "@/lib/game-proxy";

/*
 * The real admin API lives on the game server. In production this catch-all relays every
 * /api/admin/* call there (GAME_API_ORIGIN) so the staff cookie stays first-party to the panel; with
 * no origin configured it answers a small JSON 404 so the UI renders its offline state instead of a
 * blank SSR error page. See src/lib/game-proxy.ts.
 */
export const Route = createFileRoute("/api/admin/$")({
  server: { handlers: gameApiHandlers },
});
