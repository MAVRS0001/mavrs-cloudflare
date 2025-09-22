// /api/offers/stream — SSE stream of offers for a given jobId
const offersByJob = globalThis.__OFFERS__ || (globalThis.__OFFERS__ = new Map());
const sseBuckets = globalThis.__SSE__ || (globalThis.__SSE__ = new Map()); // jobId -> Set(controller)

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const jobId = String(url.searchParams.get("jobId") || "");
  if (!jobId) return new Response("jobId required", { status: 400 });

  const stream = new ReadableStream({
    start(controller){
      // add to bucket
      if (!sseBuckets.has(jobId)) sseBuckets.set(jobId, new Set());
      const bucket = sseBuckets.get(jobId);
      bucket.add(controller);

      // send initial snapshot
      const init = JSON.stringify({ jobId, offers: offersByJob.get(jobId) || [] });
      controller.enqueue(encode(`data: ${init}\n\n`));

      // heartbeat
      const hb = setInterval(() => controller.enqueue(encode(`:ping\n\n`)), 25000);

      // cleanup on close/abort
      const abort = () => {
        clearInterval(hb);
        bucket.delete(controller);
        if (bucket.size === 0) sseBuckets.delete(jobId);
        try { controller.close(); } catch(_){}
      };
      request.signal.addEventListener("abort", abort);
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "access-control-allow-origin": "*"
    }
  });
};

// helper to broadcast (you can POST to /api/offers/push to use this)
function broadcast(jobId){
  const bucket = sseBuckets.get(jobId);
  if (!bucket || bucket.size === 0) return;
  const payload = JSON.stringify({ jobId, offers: offersByJob.get(jobId) || [] });
  for (const c of bucket){ c.enqueue(encode(`data: ${payload}\n\n`)); }
}

// Optional: push offers endpoint (disabled by default).
// Uncomment and move to /api/offers/push if you want to test server->client pushes.
// export const onRequestPost = async ({ request }) => {
//   const body = await request.json();
//   const { jobId, offer } = body || {};
//   if (!jobId || !offer) return new Response("jobId and offer required", { status: 400 });
//   const list = offersByJob.get(jobId) || [];
//   list.push(offer);
//   offersByJob.set(jobId, list);
//   broadcast(jobId);
//   return new Response("ok");
// };

const encoder = new TextEncoder();
const encode = (s) => encoder.encode(s);
