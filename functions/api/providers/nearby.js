import {
  SERVICES, PROVIDER_CACHE_TTL_MS, providerCache,
  geoCache, reverseCache, GEO_TTL_MS,
  json, corsJson, normalizeE164Maybe, haversineKm,
  firstVal, looksFalse, stateAbbrev, toNum, parseCsv,
  geocodeAddress, reverseGeocodeAdminArea
} from "../../_lib/state.js";

export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const service = (url.searchParams.get("service") || "towing").toLowerCase();

    const DEFAULT_RADIUS_KM    = Number(env.RADIUS_KM || "40");
    const MAX_RESULTS_DEFAULT  = Number(env.MAX_RESULTS || "10");
    const MAX_GEOCODES_PER_REQ = Number(env.MAX_GEOCODES_PER_REQ || "120");

    const radiusParam = url.searchParams.get("radius_km") ?? url.searchParams.get("radius");
    const radiusKm    = Math.max(1, Number(radiusParam || DEFAULT_RADIUS_KM));
    const maxResults  = Math.min(Math.max(1, parseInt(url.searchParams.get("max_results") || MAX_RESULTS_DEFAULT, 10)), 500);
    const maxGeocodes = Math.max(0, parseInt(url.searchParams.get("max_geocodes") || MAX_GEOCODES_PER_REQ, 10));
    const wantDebug   = (url.searchParams.get("debug") ?? "") !== "" && url.searchParams.get("debug") !== "0";

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return corsJson({ error: "lat/lng required" }, 400);
    }

    const csvUrl = SERVICES[service];
    if (!csvUrl) return corsJson({ error: `No CSV configured for service "${service}"` }, 400);

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
    return corsJson({ error: "server error", detail: String(e) }, 500);
  }
};

/* ========================= Internals ========================= */

async function loadProviders(csvUrl, debug){
  const cached = providerCache.get(csvUrl);
  if (cached && Date.now() - cached.at < PROVIDER_CACHE_TTL_MS) {
    debug.cache = "hit";
    return cached.rows;
  }
  const resp = await fetch(csvUrl, { redirect: "follow" });
  if (!resp.ok) throw new Error(`CSV HTTP ${resp.status}`);
  const csvText = await resp.text();
  const records = parseCsv(csvText);

  const rows = [];
  let rawCount = 0;
  for (const r of records){
    rawCount++;

    const active = firstVal(r, ["active","Active","is_active","Is Active","enabled","Enabled","status","Status"]);
    if (looksFalse(active)) continue;

    const phone = normalizeE164Maybe(firstVal(r, [
      "phone","Phone","phone_number","Phone Number","PhoneNumber",
      "Mobile","Mobile Phone","Primary Phone","PrimaryPhone","Contact","Contact Phone"
    ]));
    if (!phone) continue;

    const addr1 = firstVal(r, ["address","Address","street","Street","Address 1","Address1","Street Address","StreetAddress","Full Address","FullAddress"]);
    const city = firstVal(r, ["city","City"]);
    const stateRaw = firstVal(r, ["state","State","Province"]);
    const state = stateAbbrev(stateRaw || "");
    const zip = firstVal(r, ["zip","Zip","Zip Code","Postal Code","Postcode"]);
    const address = [addr1, city, state, zip].filter(Boolean).join(", ") || [city, state].filter(Boolean).join(", ");

    // Lat/Lng
    const lat = toNum(firstVal(r, ["lat","Lat","LAT","latitude","Latitude","LATITUDE"]));
    const lng = toNum(firstVal(r, ["lng","Lng","LNG","lon","Lon","LONG","longitude","Longitude","LONGITUDE"]));

    const base_fee = toNum(firstVal(r, ["base_fee","Base Fee","BaseFee"]));
    const per_mile = toNum(firstVal(r, ["per_mile","Per Mile","PerMile","per_mi","Per Mi"]));
    const name = firstVal(r, ["name","Name","company","Company","Company Name","CompanyName"]) || "Provider";

    rows.push({ name, phone, address, city, state, lat, lng, base_fee, per_mile });
  }
  debug.rawCount = rawCount;
  providerCache.set(csvUrl, { at: Date.now(), rows });
  return rows;
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
