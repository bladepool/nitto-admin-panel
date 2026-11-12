/*
 * Server-side forwarder from this panel's origin to the game API.
 *
 * The staff cookie is HttpOnly + SameSite=Strict and scoped to Path=/api, so it must be FIRST-PARTY
 * to the panel's own origin. In production the panel's Node server therefore relays /api/admin/* and
 * /api/mod/* to the game API (GAME_API_ORIGIN, e.g. https://game.racinglegends.app) and passes the
 * Cookie / Set-Cookie headers through. Without GAME_API_ORIGIN the routes answer a small JSON 404 so
 * the UI shows its "API not available" state (local dev uses the Vite proxy instead).
 */

const FORWARD_REQUEST_HEADERS = ["accept", "content-type", "cookie", "x-rl-staff", "x-admin-key", "authorization"];
// `location`: the Discord sign-in routes answer 302s (to discord.com, then back into the panel).
const FORWARD_RESPONSE_HEADERS = ["content-type", "cache-control", "location", "retry-after"];
const TIMEOUT_MS = 15_000;

const unavailable = () =>
  Response.json(
    { ok: false, reason: "admin_api_not_mounted" },
    { status: 404, headers: { "cache-control": "no-store" } },
  );

export async function forwardToGameApi({ request }: { request: Request }): Promise<Response> {
  const origin = process.env["GAME_API_ORIGIN"];
  if (!origin) return unavailable();

  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, origin);
  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Let the game API rate-limit and audit by the real client, not this relay.
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : null,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return Response.json(
      { ok: false, reason: "admin_api_unreachable" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }

  const out = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const gameApiHandlers = {
  GET: forwardToGameApi,
  POST: forwardToGameApi,
  PUT: forwardToGameApi,
  PATCH: forwardToGameApi,
  DELETE: forwardToGameApi,
};
