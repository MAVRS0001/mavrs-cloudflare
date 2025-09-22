/**
 * Global CORS middleware for Cloudflare Pages Functions.
 * Adds ACAO headers and handles OPTIONS preflight.
 */
export async function onRequest({ request, next }) {
  const origin = request.headers.get("Origin");
  const allowOrigin = origin || "*"; // reflect caller, or use "*" for simple cases

  // Preflight
  if (request.method === "OPTIONS") {
    const reqHdrs =
      request.headers.get("Access-Control-Request-Headers") ||
      "Content-Type, Authorization";
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": reqHdrs,
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin, Access-Control-Request-Headers"
      },
    });
  }

  // Normal request
  const res = await next();
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", allowOrigin);
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.append("Vary", "Origin");

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}