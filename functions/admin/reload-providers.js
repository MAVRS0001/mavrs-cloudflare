// /admin/reload-providers — clear in-memory caches (best-effort)
const providerCache = globalThis.__PROV_CACHE__ || (globalThis.__PROV_CACHE__ = new Map());

export const onRequestPost = async () => {
  try {
    providerCache.clear?.();
  } catch(_){}
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" }
  });
};
