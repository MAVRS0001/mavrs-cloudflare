import { corsJson, clearProviderCache } from "../_lib/state.js";

export const onRequestPost = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const service = String(body.service || "*").toLowerCase();
    const res = clearProviderCache(service);
    return corsJson({ ok: true, service, ...res });
  } catch (e) {
    return corsJson({ ok: false, error: String(e) }, 500);
  }
};
