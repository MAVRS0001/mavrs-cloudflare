// /api/debug/send — Telnyx SMS (guarded by optional X-Admin-Secret)
export const onRequestPost = async ({ request, env }) => {
  try {
    const secretRequired = env.DEBUG_SEND_SECRET || "";
    if (secretRequired) {
      const got = request.headers.get("x-admin-secret") || "";
      if (got !== secretRequired) return json({ ok:false, error:"forbidden" }, 403);
    }

    const body = await request.json();
    const to = (body?.to || "").trim();
    const text = (body?.text || "MAVRS test SMS").trim();
    if (!to) return json({ ok:false, error:"Missing 'to'" }, 400);

    const toNorm = normalizeE164Maybe(to);
    const r = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.TELNYX_FROM_NUMBER,
        to: toNorm,
        text,
        messaging_profile_id: env.TELNYX_MESSAGING_PROFILE_ID,
      }),
    });
    const textResp = await r.text();
    if (!r.ok) return json({ ok:false, status:r.status, body:textResp }, r.status);
    return corsJson({ ok:true });
  } catch (e) {
    return json({ ok:false, error:String(e) }, 500);
  }
};

function normalizeE164Maybe(num) {
  if (!num) return "";
  let p = String(num).trim().replace(/[()\\s,-]/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  if (/^\\d+$/.test(p)) return "+" + p;
  return p;
}
function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}
function corsJson(obj, status = 200) {
  return json(obj, status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Admin-Secret",
  });
}
