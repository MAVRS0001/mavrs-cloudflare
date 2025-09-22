function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,   // use "*" if you prefer
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export const onRequestOptions = async ({ request }) => {
  // Handle CORS preflight
  return new Response(null, { headers: corsHeaders(request) });
};

export const onRequest = async (context) => {
  // Run the matched function/route first
  const response = await context.next();

  // Append CORS headers to every response
  const headers = new Headers(response.headers);
  const extra = corsHeaders(context.request);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
