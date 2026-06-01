# UniMap

**One JavaScript/TypeScript interface over Google Maps, Apple Maps, and OpenStreetMap.**

Write your geocoding, routing, places, static-map and interactive-map code once, then run it against
any provider — or mix providers per capability, with automatic fallback. Provider credentials live
only in a centralized proxy and never reach the browser. The whole thing is integration-tested
against a protocol-accurate mock server (no API keys needed), and can optionally be tested against
the live services.

> **License: [AGPL-3.0-or-later](./LICENSE).** This includes the network-use clause (§13): if you run
> the proxy as a service, you must offer its Corresponding Source to users. See [LEGAL.md](./LEGAL.md).

---

## Why it doesn't violate copyright

The unified surface is a **clean-room vocabulary** of our own design (`@unimap/core`) — not a copy of
any provider's field names or JSON. Each adapter *translates* a provider's dialect into that
vocabulary. *Google v. Oracle* (2021) supports reimplementing an API interface as fair use; designing
our own is safer still. We never redistribute provider map data or tiles, every result carries the
provider's required **attribution**, and provider basemap tiles stay inside their own SDKs. See
[LEGAL.md](./LEGAL.md).

## Two separate components

- **Services / data core** (headless): `@unimap/client` (browser) and the provider adapters (server).
  Geocoding, routing + matrix, places (search/autocomplete/details), static images, tile sources.
- **Render façade**: `@unimap/render` — one `MapView` API that delegates to MapLibre GL, Google Maps
  JS, or MapKit JS under the hood, plus `@unimap/react` bindings.

They share only the `@unimap/core` types; you can use either alone.

## Packages

| Package | Role |
| --- | --- |
| `@unimap/core` | Clean-room types, Zod schemas, service interfaces, `MapsClient` (fallback), errors, polyline/geo utils |
| `@unimap/provider-google` | Geocoding, Routes API, Places API (New), Static Maps |
| `@unimap/provider-apple` | Maps Server API (geocode/search/directions/ETA) + ES256 JWT auth |
| `@unimap/provider-osm` | Nominatim, OSRM, Photon, tiles |
| `@unimap/provider-unofficial` | **Opt-in** reverse-engineered tier (off unless `UNIMAP_ENABLE_UNOFFICIAL=1`) |
| `@unimap/proxy` | Credential custody, Apple JWT minting, unified REST, routing + fallback, AGPL `/source` |
| `@unimap/client` | Services-only browser SDK over the proxy (Component B) |
| `@unimap/render` | Unified interactive map façade (Component A) |
| `@unimap/react` | React hooks + `<MapCanvas>` |
| `@unimap/mock-server` | Protocol-accurate mock of the three providers |
| `@unimap/testing` | ES256 key generation + mock bootstrap for tests |

## Capability matrix

| | geocode | route/matrix | places | static map | tiles |
| --- | :-: | :-: | :-: | :-: | :-: |
| Google | ✅ | ✅ | ✅ | ✅ | — (SDK-locked) |
| Apple | ✅ | ✅ | ✅ | ✅ (Web Snapshot) | — (SDK-locked) |
| OSM | ✅ | ✅ | ✅ | — | ✅ |

`MapsClient`/`UnimapClient` route each capability to the first configured provider that supports it
and fall back to the next on error.

## Quick start

```bash
npm install
npm run build      # typecheck the whole monorepo
npm test           # unit + integration tests against the in-process mock (no secrets)
```

Run the UI + API locally with one command (no credentials — defaults to OpenStreetMap):

```bash
npm run dev:ui     # starts the proxy (API, :8787) + demo UI (:5173)
                   # then open http://localhost:5173  ── the UI is wired to the :8787 API
```

Or run the pieces yourself:

```bash
npm run dev:proxy                              # the API (unified proxy) on :8787
cd apps/demo && npm install && npm run dev     # the UI on :5173 (defaults to the :8787 API)
# override the API the UI targets: VITE_PROXY_URL=http://host:port npm run dev
```

Or with Docker:

```bash
docker compose up                  # proxy + mock + demo (http://localhost:5173)
docker compose --profile osm up    # also start self-hosted Nominatim/OSRM/Photon/tiles
```

## Using it in code

```ts
// Server side — talk to providers directly with fallback:
import { MapsClient } from "@unimap/core";
import { createGoogleProvider } from "@unimap/provider-google";
import { createOsmProvider } from "@unimap/provider-osm";

const maps = new MapsClient({
  providers: [createGoogleProvider({ apiKey: process.env.GOOGLE_MAPS_API_KEY! }), createOsmProvider({})],
  order: { geocoding: ["google", "osm"] },
});
const results = await maps.geocode({ query: "1600 Amphitheatre Parkway" });

// Browser — same interface, but through the proxy (no keys in the client):
import { createUnimapClient } from "@unimap/client";
const client = createUnimapClient({ baseUrl: "https://maps.example.com" });
await client.geocode({ query: "1600 Amphitheatre Parkway" });
```

## Configuration

Copy `.env.example` to `.env`. Nothing is required for the mock or for OSM; add Google/Apple
credentials to enable those providers. Key vars: `GOOGLE_MAPS_API_KEY`, `APPLE_MAPS_PRIVATE_KEY`
(+`_KEY_ID`/`_TEAM_ID`), `OSM_*`, `UNIMAP_ENABLE_UNOFFICIAL`.

## Testing

- **Default (mock):** `npm test` — every adapter, the proxy, and the client are exercised against
  `@unimap/mock-server`, which speaks the real Google/Apple/OSM wire protocols (including Apple's
  JWT→access-token exchange). No credentials.
- **Live (optional):** set provider credentials and `UNIMAP_LIVE=1`, then `npm run test:live` to run
  the same suites against the real services.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design and [LEGAL.md](./LEGAL.md) for the legal model.
