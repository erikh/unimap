import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupMock, type MockEnv } from "@unimap/testing";
import { createOsmProvider } from "@unimap/provider-osm";
import type { Provider } from "@unimap/core";

let env: MockEnv;
let osm: Provider;

const scenarioFetch =
  (scenario: string): typeof fetch =>
  (input, init) =>
    fetch(input as string | URL, {
      ...init,
      headers: { ...(init?.headers as Record<string, string> | undefined), "x-mock-scenario": scenario },
    });

beforeAll(async () => {
  env = await setupMock();
  osm = createOsmProvider({
    nominatimUrl: env.osm.nominatimUrl,
    osrmUrl: env.osm.osrmUrl,
    photonUrl: env.osm.photonUrl,
    overpassUrl: env.osm.overpassUrl,
    tileUrl: env.osm.tileUrl,
  });
});

afterAll(async () => {
  await env.close();
});

describe("OSM geocoding", () => {
  it("geocodes via Nominatim into the unified model", async () => {
    const results = await osm.geocoding!.geocode({ query: "1600 Amphitheatre Parkway" });
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.location.lat).toBeCloseTo(37.4224, 3);
    expect(r.location.lng).toBeCloseTo(-122.0841, 3);
    expect(r.address.country).toBe("United States");
    expect(r.address.countryCode).toBe("US");
    expect(r.address.locality).toBe("Mountain View");
    expect(r.placeId).toBe("osm:N2192620");
    expect(r.attribution.provider).toBe("osm");
    expect(r.bounds).toBeDefined();
  });

  it("reverse geocodes", async () => {
    const results = await osm.geocoding!.reverseGeocode({ location: { lat: 37.4224, lng: -122.0841 } });
    expect(results[0]!.address.locality).toBe("Mountain View");
  });

  it("returns [] for the empty scenario", async () => {
    const empty = createOsmProvider({ nominatimUrl: env.osm.nominatimUrl, fetchImpl: scenarioFetch("empty") });
    expect(await empty.geocoding!.geocode({ query: "nowhere" })).toEqual([]);
  });
});

describe("OSM routing", () => {
  it("routes via OSRM", async () => {
    const result = await osm.routing!.route({
      origin: { lat: 37.42, lng: -122.08 },
      destination: { lat: 37.77, lng: -122.41 },
      waypoints: [],
      travelMode: "DRIVE",
      alternatives: false,
      avoid: [],
    });
    const route = result.routes[0]!;
    expect(route.distanceMeters).toBe(49_000);
    expect(route.durationSeconds).toBe(3_000);
    expect(route.polyline).toBeTruthy();
    expect(route.legs[0]!.steps.length).toBeGreaterThan(0);
    expect(route.attribution.provider).toBe("osm");
  });

  it("computes a travel matrix", async () => {
    const matrix = await osm.routing!.matrix({
      origins: [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
      destinations: [
        { lat: 3, lng: 3 },
        { lat: 4, lng: 4 },
      ],
      travelMode: "DRIVE",
    });
    expect(matrix.rows).toHaveLength(2);
    expect(matrix.rows[0]).toHaveLength(2);
    expect(matrix.rows[0]![0]!.status).toBe("OK");
    expect(matrix.rows[0]![0]!.distanceMeters).toBeGreaterThan(0);
  });

  it("rejects TRANSIT as unsupported", async () => {
    await expect(
      osm.routing!.route({
        origin: { lat: 1, lng: 1 },
        destination: { lat: 2, lng: 2 },
        waypoints: [],
        travelMode: "TRANSIT",
        alternatives: false,
        avoid: [],
      }),
    ).rejects.toThrow(/TRANSIT/);
  });
});

describe("OSM places", () => {
  it("searches via Photon", async () => {
    const places = await osm.places!.search({ query: "Googleplex", categories: [] });
    expect(places[0]!.name).toBe("Googleplex");
    expect(places[0]!.location!.lat).toBeCloseTo(37.422, 3);
    expect(places[0]!.attribution.provider).toBe("osm");
  });

  it("autocompletes", async () => {
    const suggestions = await osm.places!.autocomplete({ input: "Google" });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]!.placeId).toBe("osm:N2192620");
  });

  it("fetches details via Nominatim lookup", async () => {
    const place = await osm.places!.details({ id: "osm:N2192620" });
    expect(place.provider).toBe("osm");
    expect(place.location).toBeDefined();
  });
});

describe("OSM tiles + capability surface", () => {
  it("exposes a raster tile source with attribution", async () => {
    const tiles = await osm.tiles!.tileSource();
    expect(tiles.kind).toBe("raster");
    expect(tiles.attribution.text).toMatch(/OpenStreetMap/);
  });

  it("does not advertise the staticmap capability (no official OSM API)", () => {
    expect(osm.staticmap).toBeUndefined();
  });
});

describe("OSM resilience", () => {
  it("maps HTTP 429 to a RATE_LIMITED error", async () => {
    const limited = createOsmProvider({ nominatimUrl: env.osm.nominatimUrl, fetchImpl: scenarioFetch("quota") });
    await expect(limited.geocoding!.geocode({ query: "x" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("maps malformed JSON to a PROVIDER_ERROR", async () => {
    const broken = createOsmProvider({ nominatimUrl: env.osm.nominatimUrl, fetchImpl: scenarioFetch("malformed") });
    await expect(broken.geocoding!.geocode({ query: "x" })).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});
