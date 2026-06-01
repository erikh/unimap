# UniMap demo

A minimal Vite + React app: search an address (through the proxy, across any provider) and see
results on a MapLibre/OSM basemap via the unified `MapCanvas`.

This app is **not** an npm workspace (to keep the library install lean); Vite aliases `@unimap/*`
straight to the package sources in `../../packages`.

## Run

```bash
# 1. From the repo root, start the mock + proxy (no credentials needed):
npm run dev:mock      # terminal 1  (mock provider APIs on :8788)
npm run dev:proxy     # terminal 2  (unified proxy on :8787, backed by OSM by default)

# 2. Start the demo:
cd apps/demo
npm install
VITE_PROXY_URL=http://localhost:8787 npm run dev   # http://localhost:5173
```

Or bring up everything with Docker from the repo root:

```bash
docker compose up        # proxy + mock + demo
```

Switch providers by configuring credentials on the proxy (`.env`) and pinning a provider with
`createUnimapClient({ baseUrl, provider: "apple" })`.
