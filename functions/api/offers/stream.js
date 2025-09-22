import { offersByJob, sseClients } from "../../_lib/state.js";

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const jobId = String(url.searchParams.get("jobId") || "");
  if (!jobId) return new Response(null, { status: 400 });

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const write = (str) => controller.enqueue(encoder.encode(str));

      // Register client
      if (!sseClients.has(jobId)) sseClients.set(jobId, new Set());
      const bucket = sseClients.get(jobId);
      const client = { write };
      bucket.add(client);

      // Send initial snapshot
      const init = JSON.stringify({ jobId, offers: offersByJob.get(jobId) || [] });
      write(`data: ${init}\n\n`);

      const ping = setInterval(() => write(`:ping\n\n`), 25000);

      controller._cleanup = () => {
        clearInterval(ping);
        bucket.delete(client);
        if (bucket.size === 0) sseClients.delete(jobId);
      };
    },
    cancel() {}
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    }
  });
};
