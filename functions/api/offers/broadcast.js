export const onRequestPost = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const jobId = body?.jobId || `job-${Date.now()}`;
    return new Response(JSON.stringify({
      ok: true,
      status: "queued",
      message: "Broadcast accepted",
      jobId
    }), { headers: { "Content-Type": "application/json" }});
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || "server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
export const onRequestOptions = async () => new Response(null, { status: 204 });
