/**
 * Try the UniMap unified SDK directly — no server, no API keys required.
 *
 *   npx tsx examples/try.ts          (or: npm run example)
 *
 * Uses OpenStreetMap by default against its public endpoints (needs network).
 * If GOOGLE_MAPS_API_KEY or the APPLE_MAPS_* vars are set, those providers are
 * added ahead of OSM with automatic fallback. For a fully offline run that
 * needs neither network nor keys, see examples/offline.ts.
 */
import { MapsClient, type Provider } from "@unimap/core";
import { createOsmProvider } from "@unimap/provider-osm";

const providers: Provider[] = [
  createOsmProvider({ userAgent: "unimap-example/0.1 (https://github.com/unimap/unimap)" }),
];

if (process.env.GOOGLE_MAPS_API_KEY) {
  const { createGoogleProvider } = await import("@unimap/provider-google");
  providers.unshift(createGoogleProvider({ apiKey: process.env.GOOGLE_MAPS_API_KEY }));
}
if (process.env.APPLE_MAPS_PRIVATE_KEY && process.env.APPLE_MAPS_KEY_ID && process.env.APPLE_MAPS_TEAM_ID) {
  const { createAppleProvider } = await import("@unimap/provider-apple");
  providers.unshift(
    createAppleProvider({
      privateKey: process.env.APPLE_MAPS_PRIVATE_KEY,
      keyId: process.env.APPLE_MAPS_KEY_ID,
      teamId: process.env.APPLE_MAPS_TEAM_ID,
    }),
  );
}

const maps = new MapsClient({
  providers,
  onFallback: (info) =>
    console.warn(`  ↪ ${info.providerId} failed (${(info.error as Error).message}); trying next provider`),
});

console.log("Providers by capability:", maps.capabilities());

console.log("\n# Geocode");
const geocoded = await maps.geocode({ query: "1600 Amphitheatre Parkway, Mountain View" });
const top = geocoded[0];
if (top) {
  console.log(`  ${top.address.formatted}`);
  console.log(`  → ${top.location.lat}, ${top.location.lng}   [${top.attribution.provider}]`);
}

console.log("\n# Reverse geocode (Eiffel Tower)");
const reversed = await maps.reverseGeocode({ location: { lat: 48.8584, lng: 2.2945 } });
if (reversed[0]) console.log(`  ${reversed[0].address.formatted}   [${reversed[0].attribution.provider}]`);

if (top) {
  console.log("\n# Route (driving) → San Francisco");
  const result = await maps.route({
    origin: top.location,
    destination: { lat: 37.7749, lng: -122.4194 },
    waypoints: [],
    travelMode: "DRIVE",
    alternatives: false,
    avoid: [],
  });
  const route = result.routes[0];
  if (route) {
    console.log(
      `  ${(route.distanceMeters / 1000).toFixed(1)} km, ~${Math.round(route.durationSeconds / 60)} min   [${route.attribution.provider}]`,
    );
  }
}

console.log("\n# Places search");
const places = await maps.search({
  query: "coffee",
  location: { lat: 48.8584, lng: 2.2945 },
  categories: [],
  limit: 3,
});
for (const place of places.slice(0, 3)) console.log(`  • ${place.name}   [${place.attribution.provider}]`);

console.log("\nDone. Set GOOGLE_MAPS_API_KEY / APPLE_MAPS_* to add those providers with fallback.");
