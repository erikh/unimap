# Architecture

## Package graph

```
@unimap/core  ──────────────► (types, schemas, MapsClient, errors, http, polyline)
   ▲      ▲      ▲      ▲
   │      │      │      └────────── @unimap/provider-osm
   │      │      └───────────────── @unimap/provider-apple ── jose (ES256 JWT)
   │      └──────────────────────── @unimap/provider-google
   │                                @unimap/provider-unofficial (opt-in)
   │
   ├── @unimap/proxy ── hono ── (custody + unified REST + auth + fallback)  ◄── all providers
   │        ▲
   │        │ HTTP (unified JSON)
   │   @unimap/client (Component B, browser services SDK)
   │
   ├── @unimap/render (Component A) ── MapLibre | Google JS | MapKit JS engines
   │        ▲
   │   @unimap/react (MapsProvider, hooks, <MapCanvas>)
   │
   └── @unimap/mock-server (Google/Apple/OSM wire protocols)  ◄── @unimap/testing ◄── all tests
```

## Request flows

**Services (e.g. geocoding):**
```
app → UnimapClient.geocode()        (browser, Component B)
    → POST {proxy}/v1/geocode        (Zod-validated)
    → MapsClient picks provider + fallback
    → provider adapter maps unified request → provider wire format, fetches upstream
    → adapter maps provider JSON → unified GeocodeResult[] (with attribution)
    → proxy returns unified JSON; client re-validates against the shared schema
```

**Apple auth proxying:**
```
adapter/proxy signs ES256 JWT (.p8 private key, never sent to browser)
    → GET maps-api.apple.com/v1/token (Bearer authToken)
    → { accessToken, expiresInSeconds } cached ~30 min
    → subsequent calls use Bearer accessToken
render façade → GET {proxy}/v1/auth/apple/mapkit-token → MapKit JS authorizationCallback
```

**Rendering:** `MapView` (engine-agnostic) → `RenderEngine` (`MapLibreEngine` | `GoogleEngine` |
`AppleEngine`). Engines lazily load their SDK in the browser; Google/Apple basemap tiles stay inside
their SDKs (never piped into MapLibre — a ToS requirement).

## Key design decisions

- **Clean-room vocabulary.** One neutral model (`@unimap/core`); adapters translate into it. Keeps the
  public surface copyright-safe and provider-independent. See [LEGAL.md](./LEGAL.md).
- **Capability presence = support.** A `Provider` simply omits capabilities it can't serve (OSM has no
  `staticmap`; Google/Apple have no `tiles`). `MapsClient` builds a per-capability fallback chain.
- **Injectable base URLs + fetch.** Every adapter accepts `baseUrl(s)` and an optional `fetchImpl`, so
  tests point them at the mock server (or `MockAgent`) with zero code changes — this is what makes the
  whole stack integration-testable without credentials.
- **Run TypeScript directly.** Dev servers and Docker run via `tsx`; tests run on source via Vitest;
  `npm run build` is a whole-program `tsc` typecheck. No emit step to keep in sync (a publish step
  would add `tsup`/bundling later).
- **Two independent components.** The services core and the render façade depend only on
  `@unimap/core` types, never on each other — either is usable alone.

## Testing strategy

- **Mock-default integration.** `@unimap/mock-server` (Hono) implements the *real* Google/Apple/OSM
  request/response shapes — including Apple's JWT verification + token exchange and Google's
  `X-Goog-FieldMask`/key checks — plus programmable failure scenarios (`x-mock-scenario`: quota, error,
  malformed, slow, empty). Adapters, proxy, and client are all tested against it. No secrets.
- **Live-optional.** The same suites can target real services when credentials + `UNIMAP_LIVE=1` are
  present (`npm run test:live`); skipped otherwise.
- **Compliance.** `packages/proxy/test/compliance.test.ts` asserts the attribution invariant and the
  clean-room boundary (strict schema parse); `provider-unofficial` tests assert the tier is off by
  default.

## Adding a provider

1. `createXProvider(options): Provider` in a new `packages/provider-x`, implementing whichever of
   `GeocodingService` / `RoutingService` / `PlacesService` / `StaticMapService` / `TileService` it
   supports. Accept an injectable `baseUrl` + `fetchImpl`.
2. Map its wire format ⇄ `@unimap/core` types in a `mappers.ts` (unit-test these).
3. Add its routes to `@unimap/mock-server` and an integration test against the mock.
4. Register it in `buildProvidersFromEnv` (proxy) behind its credentials.
