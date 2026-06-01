/**
 * Deterministic, fully-offline demo — no network, no API keys.
 *
 *   npx tsx examples/offline.ts      (or: npm run example:offline)
 *
 * Boots the in-process mock server (the same one the test suite uses, speaking
 * the real Google/Apple/OSM wire protocols) and runs the unified surface
 * against it. Shows that every provider returns the same unified shape.
 */
import { MapsClient } from "@unimap/core";
import { startMockServer } from "@unimap/mock-server";
import { createGoogleProvider } from "@unimap/provider-google";
import { createOsmProvider } from "@unimap/provider-osm";

const mock = await startMockServer();
try {
  const google = createGoogleProvider({
    apiKey: "demo-key",
    baseUrls: {
      geocode: `${mock.url}/google`,
      routes: `${mock.url}/google`,
      places: `${mock.url}/google`,
      static: `${mock.url}/google`,
    },
  });
  const osm = createOsmProvider({
    nominatimUrl: `${mock.url}/osm/nominatim`,
    osrmUrl: `${mock.url}/osm/osrm`,
    photonUrl: `${mock.url}/osm/photon`,
  });

  const maps = new MapsClient({
    providers: [google, osm],
    order: { geocoding: ["google", "osm"], routing: ["google", "osm"], places: ["google", "osm"] },
  });

  console.log("Capabilities:", maps.capabilities());

  const [g] = await maps.geocode({ query: "1600 Amphitheatre Parkway" });
  console.log(`\ngeocode (google): ${g?.address.formatted}`);
  console.log(`                  @ ${g?.location.lat}, ${g?.location.lng}  placeId=${g?.placeId}`);

  const routed = await maps.route({
    origin: { lat: 37.42, lng: -122.08 },
    destination: { lat: 37.77, lng: -122.42 },
    waypoints: [],
    travelMode: "DRIVE",
    alternatives: false,
    avoid: [],
  });
  console.log(`route (google):   ${(routed.routes[0]!.distanceMeters / 1000).toFixed(1)} km`);

  const places = await maps.search({ query: "Googleplex", categories: [] });
  console.log(`places (google):  ${places[0]?.name} (${places[0]?.rating} ★)`);

  // Same unified call, OSM normalization — note the different attribution + id scheme.
  const osmOnly = new MapsClient({ providers: [osm] });
  const [o] = await osmOnly.geocode({ query: "anything" });
  console.log(`\ngeocode (osm):    ${o?.address.formatted}`);
  console.log(`                  placeId=${o?.placeId}  [${o?.attribution.provider}]`);

  console.log("\nIdentical unified shape across providers — that's the whole point. ✅");
} finally {
  await mock.close();
}
