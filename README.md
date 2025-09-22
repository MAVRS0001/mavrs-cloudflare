# MAVRS — Cloudflare Pages + Functions (Starter)

This is a minimal port of your Express server to Cloudflare Pages Functions.

## Structure
```
public/                         # your frontend (replace with your real HTML)
functions/api/providers/nearby.js
functions/api/offers/index.js   # GET /api/offers?jobId=...
functions/api/offers/stream.js  # SSE /api/offers/stream?jobId=...
functions/api/debug/send.js     # POST /api/debug/send  (requires env + optional secret)
functions/admin/reload-providers.js
```

## Local dev
1) Install Wrangler: `npm i -g wrangler`
2) Create a `.dev.vars` file in this folder with your env values, for example:
```
RADIUS_KM=40
MAX_RESULTS=10
MAX_GEOCODES_PER_REQ=400
GMAPS_GEOCODING_KEY=YOUR_GOOGLE_GEOCODING_KEY
TELNYX_API_KEY=YOUR_TELNYX_KEY
TELNYX_MESSAGING_PROFILE_ID=YOUR_PROFILE_ID
TELNYX_FROM_NUMBER=+1XXXXXXX
DEBUG_SEND_SECRET=choose-a-strong-secret
```
3) Run: `wrangler pages dev public`
4) Test: open the printed URL and try `/api/providers/nearby?...`

## Deploy
- Push this folder to a Git repo.
- Cloudflare Dashboard → **Pages** → **Create project** → connect repo.
- Build command: none. Output directory: `public`.
- After first deploy: Pages → **Settings → Environment Variables** → add the same keys as above.
- Your API will be under `https://<project>.pages.dev/api/...`

## Frontend
In your Shopify embed, set:
`data-api-base="https://<project>.pages.dev"`

Then call:
`fetch(\`\${apiBase}/api/providers/nearby?lat=...&lng=...&service=towing\`)`

## Notes
- This starter embeds your `services.json` mapping directly inside `/api/providers/nearby.js` (the `SERVICES` constant). Edit those URLs there.
- Caches are in-memory per Cloudflare isolate (best-effort). For persistent storage, add KV/R2 later.
- The debug SMS endpoint is guarded by `DEBUG_SEND_SECRET` if you set it.
