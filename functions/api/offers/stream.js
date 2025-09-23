export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) {
    return new Response(JSON.stringify({ ok: false, error: "Missing jobId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const enc = new TextEncoder();
  let intervalId;

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const ping = () => controller.enqueue(enc.encode(`: ping\n\n`));
      send({ jobId, offers: [] });
      intervalId = setInterval(ping, 25000);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    }
  });
};

export const onRequestOptions = async () => new Response(null, { status: 204 });