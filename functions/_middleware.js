export const onRequest = async ({ request, next }) => {
  const origin = request.headers.get("Origin") || "*";

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        // ?? let JS read these headers
        "Access-Control-Expose-Headers":
          "Access-Control-Allow-Origin, Access-Control-Allow-Methods, Access-Control-Allow-Headers",
        "Access-Control-Max-Age": "86400"
      }
    });
  }

  // Normal requests -> run route, then append headers
  const res = await next();
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set(
    "Access-Control-Expose-Headers",
    "Access-Control-Allow-Origin, Access-Control-Allow-Methods, Access-Control-Allow-Headers"
  );

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
};