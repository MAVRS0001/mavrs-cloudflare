// Cloudflare Pages Function — /api/providers/nearby
// Port of your Express endpoint (no fs, no csv-parse).
// Edit the SERVICES map below or move to KV later.

export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const service = (url.searchParams.get("service") || "towing").toLowerCase();

    const DEFAULT_RADIUS_KM = Number(env.RADIUS_KM || "40");
    const MAX_RESULTS_DEFAULT = Number(env.MAX_RESULTS || "10");
    const MAX_GEOCODES_PER_REQ = Number(env.MAX_GEOCODES_PER_REQ || "120");

    const radiusParam = url.searchParams.get("radius_km") ?? url.searchParams.get("radius");
    const radiusKm = Math.max(1, Number(radiusParam || DEFAULT_RADIUS_KM));
    const maxResults = Math.min(Math.max(1, parseInt(url.searchParams.get("max_results") || MAX_RESULTS_DEFAULT, 10)), 500);
    const maxGeocodes = Math.max(0, parseInt(url.searchParams.get("max_geocodes") || MAX_GEOCODES_PER_REQ, 10));
    const wantDebug = (url.searchParams.get("debug") ?? "") !== "" && url.searchParams.get("debug") !== "0";

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json({ error: "lat/lng required" }, 400);
    }

    // ===== Service -> CSV mapping (embedded) =====
    const SERVICES = {
      towing: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSl3UDciPk6cTAYkTXFHM42BcwDWRPHnCDQY4KyzV_x0hQ3Pbr52RbGZWcnjmF2bwXuYBnnpqVhBLI_/pub?gid=0&single=true&output=csv",
      mechanic: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTq7T0fJQVoSA7hv6gKM1hhqiwNeCoczt1PzgpcSVXxblVrChDTLvxtSwDfGOk9-QLpq88RaPsNJQ12/pub?gid=0&single=true&output=csv",
    };
    const csvUrl = SERVICES[service];
    if (!csvUrl) return json({ error: `No CSV configured for service "${service}"` }, 400);

    const debug = {};
    const rows = await loadProviders(csvUrl, debug);
    const nearest = await nearestProviders(
      rows, lat, lng, radiusKm, maxResults, maxGeocodes, env.GMAPS_GEOCODING_KEY, debug
    );

    const clamped = nearest
      .filter(n => Number.isFinite(n.distKm) && n.distKm <= radiusKm)
      .slice(0, maxResults);

    const providers = clamped.map(n => ({
      company_name: n.name || "Provider",
      phone: n.phone || "",
      city: n.city || "",
      state: n.state || "",
      address: n.address || "",
      lat: n.lat,
      lng: n.lng,
      base_fee: Number.isFinite(n.base_fee) ? n.base_fee : 49,
      per_mile: Number.isFinite(n.per_mile) ? n.per_mile.toFixed(2) : "2.80",
      distance_km: Math.round(n.distKm * 10) / 10,
    }));

    const out = {
      providers,
      map_hint: {
        center: { lat, lng },
        radius_km: radiusKm,
        max_distance_km: providers.reduce((m, p) => Math.max(m, p.distance_km || 0), 0),
      },
    };
    if (wantDebug) out.debug = { ...debug, requested_radius_km: radiusKm, returned: providers.length, max_results: maxResults, max_geocodes: maxGeocodes };

    return corsJson(out);
  } catch (e) {
    return json({ error: "server error", detail: String(e) }, 500);
  }
};

/* ========================= Helpers ========================= */

const PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000;
const providerCache = new Map(); // key: csvUrl -> { at, rows }
const geoCache = new Map();      // key: addressLower -> { at, lat, lng }
const reverseCache = new Map();  // key: "lat,lng" -> { at, city, state }
const GEO_TTL_MS = 24 * 60 * 60 * 1000;

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

function normalizeE164Maybe(num) {
  if (!num) return "";
  let p = String(num).trim().replace(/[()\\s,-]/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  if (/^\\d+$/.test(p)) return "+" + p;
  return p;
}

const toNum = v => (v == null || v === "" ? null : (Number(v)));
const toRad = (deg) => deg * Math.PI / 180;
const haversineKm = (aLat, aLng, bLat, bLng) => {
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const la1 = toRad(aLat), la2 = toRad(bLat);
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

function looksFalse(vRaw){
  if (vRaw == null) return false;
  const v = String(vRaw).trim().toLowerCase();
  return ["false","f","no","n","0","inactive","disabled"].includes(v);
}
function firstVal(o, ks){ for (const k of ks){ const v = o[k]; if (v!=null && String(v).trim()!=="") return String(v).trim(); } return ""; }
function stateAbbrev(s){
  if (!s) return "";
  const v = String(s).trim().toUpperCase();
  const map = { ALABAMA:"AL", ALASKA:"AK", ARIZONA:"AZ", ARKANSAS:"AR", CALIFORNIA:"CA", COLORADO:"CO", CONNECTICUT:"CT", DELAWARE:"DE", "DISTRICT OF COLUMBIA":"DC", FLORIDA:"FL", GEORGIA:"GA", HAWAII:"HI", IDAHO:"ID", ILLINOIS:"IL", INDIANA:"IN", IOWA:"IA", KANSAS:"KS", KENTUCKY:"KY", LOUISIANA:"LA", MAINE:"ME", MARYLAND:"MD", MASSACHUSETTS:"MA", MICHIGAN:"MI", MINNESOTA:"MN", MISSISSIPPI:"MS", MISSOURI:"MO", MONTANA:"MT", NEBRASKA:"NE", NEVADA:"NV", "NEW HAMPSHIRE":"NH", "NEW JERSEY":"NJ", "NEW MEXICO":"NM", "NEW YORK":"NY", "NORTH CAROLINA":"NC", "NORTH DAKOTA":"ND", OHIO:"OH", OKLAHOMA:"OK", OREGON:"OR", PENNSYLVANIA:"PA", "RHODE ISLAND":"RI", "SOUTH CAROLINA":"SC", "SOUTH DAKOTA":"SD", TENNESSEE:"TN", TEXAS:"TX", UTAH:"UT", VERMONT:"VT", VIRGINIA:"VA", WASHINGTON:"WA", "WEST VIRGINIA":"WV", WISCONSIN:"WI", WYOMING:"WY" };
  if (map[v]) return map[v];
  if (/^[A-Z]{2}$/.test(v)) return v;
  return v;
}

// CSV parser (handles quoted cells with commas)
function parseCsv(text){
  const lines = text.replace(/\\r/g,"").split("\\n").filter(l=>l.trim().length>0);
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

async function loadProviders(csvUrl, debug){
  const cached = providerCache.get(csvUrl);
  if (cached && Date.now() - cached.at < PROVIDER_CACHE_TTL_MS) { debug.cache="hit"; return cached.rows; }
  const resp = await fetch(csvUrl, { redirect: "follow" });
  if (!resp.ok) throw new Error(`CSV HTTP ${resp.status}`);
  const csvText = await resp.text();
  const records = parseCsv(csvText);

  const rows = [];
  for (const r of records){
    const active = firstVal(r, ["active","Active","is_active","Is Active","enabled","Enabled","status","Status"]);
    if (looksFalse(active)) continue;

    const phone = normalizeE164Maybe(firstVal(r, ["phone","Phone","phone_number","Phone Number","PhoneNumber","Mobile","Mobile Phone","Primary Phone","PrimaryPhone"]));
    if (!phone) continue;

    const addr1 = firstVal(r, ["address","Address","street","Street","Address 1","Address1","Street Address","StreetAddress","Full Address","FullAddress"]);
    const city = firstVal(r, ["city","City"]);
    const stateRaw = firstVal(r, ["state","State","Province"]);
    const state = stateAbbrev(stateRaw || "");
    const zip = firstVal(r, ["zip","Zip","Zip Code","Postal Code","Postcode"]);
    const address = [addr1, city, state, zip].filter(Boolean).join(", ") || [city, state].filter(Boolean).join(", ");

    const lat = toNum(firstVal(r, ["lat","Lat","LAT","latitude","Latitude","LATITUDE"]));
    const lng = toNum(firstVal(r, ["lng","Lng","LNG","lon","Lon","LONG","longitude","Longitude","LONGITUDE"]));
    const base_fee = toNum(firstVal(r, ["base_fee","Base Fee","BaseFee"]));
    const per_mile = toNum(firstVal(r, ["per_mile","Per Mile","PerMile","per_mi","Per Mi"]));
    const name = firstVal(r, ["name","Name","company","Company","Company Name","CompanyName"]) || "Provider";

    rows.push({ name, phone, address, city, state, lat, lng, base_fee, per_mile });
  }
  providerCache.set(csvUrl, { at: Date.now(), rows });
  debug.loaded = rows.length;
  return rows;
}

async function geocodeAddress(address, GMAPS_GEOCODING_KEY){
  const k = (address||"").trim().toLowerCase();
  if (!k) return null;
  const c = geoCache.get(k);
  if (c && Date.now() - c.at < GEO_TTL_MS) return { lat: c.lat, lng: c.lng, _cached:true };
  if (!GMAPS_GEOCODING_KEY) return null;
  const u = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GMAPS_GEOCODING_KEY}`;
  try{
    const r = await fetch(u);
    if (!r.ok) throw new Error(`Geocode HTTP ${r.status}`);
    const data = await r.json();
    const loc = data?.results?.[0]?.geometry?.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)){
      geoCache.set(k, { at: Date.now(), lat: loc.lat, lng: loc.lng });
      return { lat: loc.lat, lng: loc.lng, _cached:false };
    }
  }catch(_){}
  return null;
}

async function reverseGeocodeAdminArea(lat, lng, GMAPS_GEOCODING_KEY) {
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
  }catch(_){ return { city:"", state:"" }; }
}

async function nearestProviders(rows, pickLat, pickLng, radiusKm, k, geocodeBudget, GMAPS_GEOCODING_KEY, debug){
  const dedup = [];
  const seen = new Set();
  for (const r of rows){ const p = normalizeE164Maybe(r.phone); if (!p || seen.has(p)) continue; seen.add(p); dedup.push({ ...r, phone:p }); }
  debug.deduped = dedup.length;

  const withCoords = [], withoutCoords = [];
  for (const r of dedup){ (Number.isFinite(r.lat) && Number.isFinite(r.lng) ? withCoords : withoutCoords).push(r); }
  debug.withCoords = withCoords.length;
  debug.needsGeocoding = withoutCoords.length;

  const admin = await reverseGeocodeAdminArea(pickLat, pickLng, GMAPS_GEOCODING_KEY);
  debug.pickupAdmin = admin;

  const out = [];
  for (const r of withCoords){
    const d = haversineKm(pickLat, pickLng, r.lat, r.lng);
    if (d <= radiusKm) out.push({ ...r, distKm: d });
  }

  // Prioritize by state/city match, then geocode up to budget
  const prioritized = withoutCoords.map(r => {
    let score = 0;
    const rState = stateAbbrev(r.state || "");
    const city = (r.city || "").trim().toLowerCase();
    if (admin.state && (rState === admin.state || (r.address || "").toUpperCase().includes(admin.state))) score += 2;
    if (admin.city && city && city === admin.city.toLowerCase()) score += 1;
    return { r, score };
  }).sort((a,b)=> b.score - a.score);

  let tried = 0, ok = 0;
  for (const { r } of prioritized){
    if (out.length >= k) break;
    if (tried >= geocodeBudget) break;
    tried++;
    const g = await geocodeAddress(r.address, GMAPS_GEOCODING_KEY);
    if (!g) continue;
    ok++;
    const d = haversineKm(pickLat, pickLng, g.lat, g.lng);
    if (d <= radiusKm) out.push({ ...r, lat: g.lat, lng: g.lng, distKm: d });
  }
  debug.geocodeTried = tried; debug.geocodeSuccess = ok;

  out.sort((a,b)=> a.distKm - b.distKm);
  return out.slice(0, k);
}
