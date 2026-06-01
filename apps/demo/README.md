# UniMap demo

A minimal Vite + React app: search an address (through the proxy, across any provider) and see
results on a MapLibre/OSM basemap via the unified `MapCanvas`.

This app is **not** an npm workspace (to keep the library install lean); Vite aliases `@unimap/*`
straight to the package sources in `../../packages`.

## Run

Easiest — one command from the repo root starts the API (proxy, :8787) and this UI (:5173)
together, wired to each other:

```bash
npm run dev:ui      # then open http://localhost:5173
```

Or run the pieces yourself:

```bash
# 1. From the repo root, start the proxy (the API; no credentials needed):
npm run dev:proxy     # unified proxy on :8787, backed by OSM by default

# 2. Start this demo (defaults to the :8787 API; override with VITE_PROXY_URL):
cd apps/demo
npm install
npm run dev           # http://localhost:5173
```

**Accessing from another device** (phone, another laptop): use your machine's LAN IP for *both* —
the browser makes the API call, so it can't use `localhost`:

```bash
VITE_PROXY_URL=http://192.168.1.50:8787 npm run dev   # then open http://192.168.1.50:5173
```

Or bring up everything with Docker from the repo root:

```bash
docker compose up        # proxy + mock + demo at http://localhost:5173
```

Switch providers by configuring credentials on the proxy (`.env`) and pinning a provider with
`createUnimapClient({ baseUrl, provider: "apple" })`.
