import { corsJson, offersByJob } from "../../_lib/state.js";

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const jobId = String(url.searchParams.get("jobId") || "");
  const offers = Array.isArray(offersByJob.get(jobId)) ? offersByJob.get(jobId) : [];
  return corsJson({ jobId, offers });
};

// (Optional helper) POST to add an offer (kept simple, useful for testing)
export const onRequestPost = async ({ request }) => {
  try {
    const body = await request.json();
    const { jobId, offer } = body || {};
    if (!jobId) return corsJson({ ok:false, error:"Missing jobId" }, 400);
    const list = offersByJob.get(jobId) || [];
    if (offer) list.push(offer);
    offersByJob.set(jobId, list);
    return corsJson({ ok:true, jobId, count: list.length });
  } catch (e) {
    return corsJson({ ok:false, error:String(e) }, 500);
  }
};
