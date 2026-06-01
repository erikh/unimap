# Legal & compliance notes

This is engineering guidance, not legal advice. If you operate UniMap commercially, review each
provider's current Terms of Service and consult counsel.

## 1. Clean-room unified interface (copyright)

The unified surface in `@unimap/core` is our **own vocabulary** — type names, field names, enums, and
JSON shapes designed from scratch. We do **not** copy any provider's response schema. Each adapter
*translates* a provider's wire format into our model; provider-specific extras are tucked under an
opt-in `raw` field rather than promoted into the canonical types.

*Google LLC v. Oracle America, Inc.*, 593 U.S. ___ (2021) held that reimplementing an API interface
can be fair use. Designing an independent interface (as we do) is the more conservative path. A
compliance test (`packages/proxy/test/compliance.test.ts`) asserts that adapter output conforms
**exactly** to the canonical schema (strict parse), so no provider field names leak into the public
surface.

## 2. What we never do

- **No redistribution of map data or tiles.** Provider basemap tiles are loaded by *their own SDKs*
  (Google Maps JS, MapKit JS) in the browser; we never proxy, cache, or re-serve them. The render
  façade's MapLibre engine uses OpenStreetMap/your own vector tiles only.
- **No scraping.** The default build calls only official, documented endpoints.
- **No stripping attribution.** Every `GeocodeResult`/`Place`/`Route`/`TileSource` carries an
  `attribution`, and the render layer always surfaces it.
- **Co-branding is additive only.** You may append your own credit (e.g. "Combined with UniMap" via
  `MapLibreEngine`'s `customAttribution`), but it renders *alongside* `© OpenStreetMap contributors`,
  never replacing or obscuring it. We don't use the OSM name/logo as branding or imply endorsement.
  This is a render-time overlay (an ODbL "Produced Work"), not a modified or re-served tile.

## 3. Per-provider Terms of Service

| Provider | Notes baked into the design |
| --- | --- |
| **Google Maps Platform** | API key / OAuth required; the proxy holds it. Google restricts caching of most content — the proxy cache is **off by default** (`UNIMAP_CACHE_TTL_MS=0`). Attribution ("Powered by Google") is preserved. Basemap tiles are usable only via the Maps JS SDK. |
| **Apple Maps** | ES256 JWT (from a MapKit `.p8`) is exchanged for a ~30-min access token; the private key stays in the proxy. 25k/day shared MapKit JS + Server API quota. Basemap is MapKit JS only. |
| **OpenStreetMap** | Data is **ODbL** — attribution ("© OpenStreetMap contributors") is mandatory and always attached. The public Nominatim/OSRM/tile servers have strict [usage policies](https://operations.osmfoundation.org/policies/nominatim/) (rate limits, required `User-Agent`); self-host (compose `--profile osm`) for any real volume. |

## 4. Reverse-engineered / unofficial tier

`@unimap/provider-unofficial` targets **undocumented endpoints**. It is:

- **Disabled by default** — every factory throws unless `UNIMAP_ENABLE_UNOFFICIAL=1`.
- **Risk-labeled** — the package and source headers state that these endpoints may violate provider
  ToS and can break without notice, and may raise Computer Fraud and Abuse Act (CFAA) exposure in the
  US (a *contract/anti-circumvention* axis, separate from copyright).
- **Interface-clean** — it implements the same clean-room `@unimap/core` interfaces; only the
  transport is unofficial.

Ship the official tier in production. The unofficial tier is for research / personal use where you
have assessed the risk.

## 5. AGPL-3.0 network clause (§13)

The proxy is network-facing AGPL software. Section 13 requires that users interacting with it over a
network be offered the **Corresponding Source**. The proxy exposes `GET /source` (configure the link
with `UNIMAP_SOURCE_URL`), and the demo links to it. If you modify and deploy UniMap, keep that
offer accurate and pointing at *your* modified source.

## 6. Dependencies

Runtime dependencies are AGPL-compatible: MapLibre GL (BSD-3), Hono / Zod / jose (MIT), React (MIT).
Google Maps JS and MapKit JS are **loaded at runtime from the providers' CDNs** — never bundled or
redistributed — which keeps their proprietary code out of this AGPL distribution.
