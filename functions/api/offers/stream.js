export const onRequestGet = async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ jobId: null, offers: [] })}\n\n`));
      setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 25000);
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
