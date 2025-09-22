// Shared module for Cloudflare Pages Functions
// Holds caches & reusable helpers so endpoints can share memory (per isolate).

/* ========================= CACHES ========================= */
export const PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000; // ~5 minutes
export const GEO_TTL_MS = 24 * 60 * 60 * 1000;      // ~24 hours

// NOTE: These Maps are per-isolate (not global across the planet).
export const providerCache = new Map();  // key: csvUrl -> { at, rows }
export const geoCache = new Map();       // key: addressLower -> { at, lat, lng }
export const reverseCache = new Map();   // key: "lat,lng" -> { at, city, state }

// Offers memory for SSE/debug (ephemeral; good enough to mirror old server)
export const offersByJob = new Map();    // jobId -> array of offers
export const sseClients = new Map();     // jobId -> Set<Response>

/* ========================= SERVICES MAP ========================= */
// Replace or extend to add more services (replaces fs/services.json)
export const SERVICES = {
  towing: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSl3UDciPk6cTAYkTXFHM42BcwDWRPHnCDQY4KyzV_x0hQ3Pbr52RbGZWcnjmF2bwXuYBnnpqVhBLI_/pub?gid=0&single=true&output=csv",
  mechanic: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTq7T0fJQVoSA7hv6gKM1hhqiwNeCoczt1PzgpcSVXxblVrChDTLvxtSwDfGOk9-QLpq88RaPsNJQ12/pub?gid=0&single=true&output=csv",
};

/* ========================= UTILS ========================= */
export const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });

export const corsJson = (obj, status = 200) =>
  json(obj, status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });

export function normalizeE164Maybe(num) {
  if (!num) return "";
  let p = String(num).trim().replace(/[()\s,-]/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  if (/^\d+$/.test(p)) return "+" + p;
  return p;
}
const toRad = (deg) => deg * Math.PI / 180;
export const haversineKm = (aLat, aLng, bLat, bLng) => {
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const la1 = toRad(aLat), la2 = toRad(bLat);
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

export function firstVal(o, ks){ for (const k of ks){ const v = o[k]; if (v!=null && String(v).trim()!=="") return String(v).trim(); } return ""; }
export function looksFalse(vRaw){
  if (vRaw == null) return false;
  const v = String(vRaw).trim().toLowerCase();
  return ["false","f","no","n","0","inactive","disabled"].includes(v);
}
export function stateAbbrev(s){
  if (!s) return "";
  const v = String(s).trim().toUpperCase();
  const map = { ALABAMA:"AL", ALASKA:"AK", ARIZONA:"AZ", ARKANSAS:"AR", CALIFORNIA:"CA", COLORADO:"CO", CONNECTICUT:"CT",
    DELAWARE:"DE","DISTRICT OF COLUMBIA":"DC", FLORIDA:"FL", GEORGIA:"GA", HAWAII:"HI", IDAHO:"ID", ILLINOIS:"IL",
    INDIANA:"IN", IOWA:"IA", KANSAS:"KS", KENTUCKY:"KY", LOUISIANA:"LA", MAINE:"ME", MARYLAND:"MD",
    MASSACHUSETTS:"MA", MICHIGAN:"MI", MINNESOTA:"MN", MISSISSIPPI:"MS", MISSOURI:"MO", MONTANA:"MT", NEBRASKA:"NE",
    NEVADA:"NV","NEW HAMPSHIRE":"NH","NEW JERSEY":"NJ","NEW MEXICO":"NM","NEW YORK":"NY","NORTH CAROLINA":"NC",
    "NORTH DAKOTA":"ND", OHIO:"OH", OKLAHOMA:"OK", OREGON:"OR", PENNSYLVANIA:"PA", "RHODE ISLAND":"RI",
    "SOUTH CAROLINA":"SC","SOUTH DAKOTA":"SD", TENNESSEE:"TN", TEXAS:"TX", UTAH:"UT", VERMONT:"VT", VIRGINIA:"VA",
    WASHINGTON:"WA","WEST VIRGINIA":"WV", WISCONSIN:"WI", WYOMING:"WY" };
  if (map[v]) return map[v];
  if (/^[A-Z]{2}$/.test(v)) return v;
  return v;
}
export const toNum = (v) => (v == null || v === "" ? null : Number(v));

export function parseCsv(text){
  const lines = text.replace(/\r/g,"").split("\n").filter(l=>l.trim().length>0);
  if (lines.length===0) return [];
  const split = line => {
    const cells = [];
    let cur = "", inQ = false;
    for (let i=0;i<line.length;i++){
      const c = line[i], n = line[i+1];
      if (c === '"'){ if (inQ && n === '"'){ cur += '"'; i++; } else { inQ = !inQ; } }
      else if (c === "," && !inQ){ cells.push(cur); cur=""; }
      else { cur += c; }
    }
    cells.push(cur);
    return cells.map(x => x.trim());
  };
  const header = split(lines[0]);
  return lines.slice(1).map(l => {
    const cells = split(l), row = {};
    header.forEach((h,i)=> row[h] = cells[i] ?? "");
    return row;
  });
}

/* ========================= GEO ========================= */
export async function geocodeAddress(address, GMAPS_GEOCODING_KEY){
  const k = (address||"").trim().toLowerCase();
  if (!k) return null;
  const cached = geoCache.get(k);
  if (cached && Date.now() - cached.at < GEO_TTL_MS)
    return { lat: cached.lat, lng: cached.lng, _cached: true };
  if (!GMAPS_GEOCODING_KEY) return null;

  const u = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GMAPS_GEOCODING_KEY}`;
  try {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`Geocode HTTP ${r.status}`);
    const data = await r.json();
    const loc = data?.results?.[0]?.geometry?.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)){
      geoCache.set(k, { at: Date.now(), lat: loc.lat, lng: loc.lng });
      return { lat: loc.lat, lng: loc.lng, _cached:false };
    }
  } catch{}
  return null;
}

export async function reverseGeocodeAdminArea(lat, lng, GMAPS_GEOCODING_KEY) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const c = reverseCache.get(key);
  if (c && Date.now() - c.at < GEO_TTL_MS) return { city: c.city, state: c.state };
  if (!GMAPS_GEOCODING_KEY) return { city: "", state: "" };

  const u = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GMAPS_GEOCODING_KEY}`;
  try{
    const r = await fetch(u);
    if (!r.ok) throw new Error(`Reverse HTTP ${r.status}`);
    const data = await r.json();
    const comps = data?.results?.[0]?.address_components || [];
    let city = "", state = "";
    for (const comp of comps){
      if (comp.types?.includes("locality")) city = comp.long_name;
      if (comp.types?.includes("administrative_area_level_1")) state = comp.short_name || comp.long_name;
    }
    state = stateAbbrev(state);
    reverseCache.set(key, { at: Date.now(), city, state });
    return { city, state };
  }catch{ return { city:"", state:"" }; }
}

/* ========================= ADMIN ========================= */
export function clearProviderCache(serviceLowerOrStar = "*"){
  if (serviceLowerOrStar === "*" || !serviceLowerOrStar) {
    providerCache.clear();
    return { cleared: "all" };
  }
  const key = String(serviceLowerOrStar).toLowerCase();
  const existed = [...providerCache.keys()].some(k => k.includes(key));
  // We cache by csvUrl; safest is to clear all for simplicity
  providerCache.clear();
  return { cleared: existed ? key : "all" };
}
