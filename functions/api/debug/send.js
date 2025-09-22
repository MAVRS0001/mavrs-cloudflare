// functions/api/debug/send.js
export const onRequestOptions = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Max-Age": "86400",
    },
  });

export const onRequestPost = async ({ request, env }) => {
  // Optional lock so only you can use this endpoint
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") || "";
  const headerToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const queryToken = url.searchParams.get("secret");
  const token = headerToken || queryToken;
  if (env.DEBUG_SEND_SECRET && token !== env.DEBUG_SEND_SECRET) {
    return j({ ok: false, error: "unauthorized" }, 401);
  }

  // Make sure required env vars exist (READ FROM env, not process.env)
  if (!env.TELNYX_API_KEY || !env.TELNYX_MESSAGING_PROFILE_ID || !env.TELNYX_FROM_NUMBER) {
    return j({ ok: false, error: "missing Telnyx env" }, 500);
  }

  // Parse body
  let payload;
  try { payload = await request.json(); } catch { return j({ ok:false, error:"invalid JSON" }, 400); }
  const to = String(payload?.to || "").trim();
  const text = String(payload?.text || "MAVRS test SMS");
  if (!to.startsWith("+")) return j({ ok:false, error:"to must be E.164 like +18445550123" }, 400);

  // >>> THIS is the auth header Telnyx needs (Bearer + your API key from env)
  const r = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.TELNYX_FROM_NUMBER,
      to,
      text,
      messaging_profile_id: env.TELNYX_MESSAGING_PROFILE_ID,
    }),
  });

  const bodyText = await r.text();
  if (!r.ok) return j({ ok:false, status:r.status, body:bodyText }, r.status);
  return j({ ok:true });
};

function j(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type":"application/json", "Access-Control-Allow-Origin":"*" },
  });
}
