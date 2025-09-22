import { corsJson, normalizeE164Maybe } from "../../_lib/state.js";

export const onRequestPost = async ({ request, env }) => {
  // Optional guard
  const hdr = request.headers.get("authorization") || "";
  const bearer = hdr.startsWith("Bearer ") ? hdr.slice(7).trim() : "";
  const qp = new URL(request.url).searchParams.get("secret") || "";
  const provided = bearer || qp;
  if (env.DEBUG_SEND_SECRET && provided !== env.DEBUG_SEND_SECRET) {
    return corsJson({ ok:false, error: "unauthorized" }, 401);
  }

  const { TELNYX_API_KEY, TELNYX_MESSAGING_PROFILE_ID, TELNYX_FROM_NUMBER } = env;
  if (!TELNYX_API_KEY || !TELNYX_MESSAGING_PROFILE_ID || !TELNYX_FROM_NUMBER) {
    return corsJson({ ok:false, error: "missing Telnyx env" }, 401);
  }

  try {
    const { to, text } = await request.json();
    const toNorm = normalizeE164Maybe(to);
    if (!toNorm) return corsJson({ ok:false, error:"invalid 'to'" }, 400);

    const r = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: TELNYX_FROM_NUMBER,
        to: toNorm,
        text: text || "MAVRS test SMS",
        messaging_profile_id: TELNYX_MESSAGING_PROFILE_ID,
      }),
    });

    const body = await r.text();
    if (!r.ok) return corsJson({ ok:false, status:r.status, body }, 401);
    return corsJson({ ok:true });
  } catch (e) {
    return corsJson({ ok:false, error:String(e) }, 500);
  }
};
