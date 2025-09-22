// /api/offers — return current offers for a jobId
const offersByJob = globalThis.__OFFERS__ || (globalThis.__OFFERS__ = new Map());

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const jobId = String(url.searchParams.get("jobId") || "");
  if (!jobId) return json({ error: "jobId required" }, 400);
  const offers = offersByJob.get(jobId) || [];
  return corsJson({ jobId, offers });
};

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}
function corsJson(obj, status = 200) {
  return json(obj, status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}
