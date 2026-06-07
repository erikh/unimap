import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupMock, type MockEnv } from "@unimap/testing";
import {
  createOsmProvider,
  motisToRoute,
  motisModeToLegMode,
  dedupeItineraries,
} from "@unimap/provider-osm";
import { encodePolyline, type LatLngTuple, type Provider } from "@unimap/core";

/** Wrap fetch to capture the outgoing request URL (for asserting query params). */
const capturingFetch =
  (capture: (url: URL) => void): typeof fetch =>
  (input, init) => {
    capture(new URL(input as string | URL));
    return fetch(input as string | URL, init);
  };

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
    motisUrl: env.osm.motisUrl,
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

  it("routes TRANSIT via MOTIS into a multimodal route", async () => {
    const result = await osm.routing!.route({
      origin: { lat: 37.42, lng: -122.08 },
      destination: { lat: 37.77, lng: -122.41 },
      waypoints: [],
      travelMode: "TRANSIT",
      alternatives: false,
      avoid: [],
    });
    // MOTIS returns several itineraries → several route options.
    expect(result.routes.length).toBe(2);
    const route = result.routes[0]!;
    expect(route.durationSeconds).toBe(1_800);
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.attribution.provider).toBe("osm");
    expect(route.polyline).toBeTruthy();
    // walk → S-Bahn "S7" → walk
    expect(route.legs.map((l) => l.mode)).toEqual(["WALK", "RAIL", "WALK"]);
    const transitLeg = route.legs.find((l) => l.transit)!;
    expect(transitLeg.transit!.line).toBe("S7");
    expect(transitLeg.transit!.agency).toMatch(/S-Bahn/);
    expect(transitLeg.transit!.numStops).toBe(1);
    // the second option is a distinct, slower U-Bahn itinerary
    const second = result.routes[1]!;
    expect(second.durationSeconds).toBe(2_160);
    const secondTransit = second.legs.find((l) => l.transit)!;
    expect(secondTransit.mode).toBe("SUBWAY");
    expect(secondTransit.transit!.line).toBe("U5");
  });

  it("throws NotFound when MOTIS returns no itineraries", async () => {
    const empty = createOsmProvider({ motisUrl: env.osm.motisUrl, fetchImpl: scenarioFetch("empty") });
    await expect(
      empty.routing!.route({
        // within the geofence, so we reach the empty-itinerary path (not the fence)
        origin: { lat: 1, lng: 1 },
        destination: { lat: 1.1, lng: 1.1 },
        waypoints: [],
        travelMode: "TRANSIT",
        alternatives: false,
        avoid: [],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not support a TRANSIT matrix", async () => {
    await expect(
      osm.routing!.matrix({
        origins: [{ lat: 1, lng: 1 }],
        destinations: [{ lat: 2, lng: 2 }],
        travelMode: "TRANSIT",
      }),
    ).rejects.toThrow(/TRANSIT/);
  });

  it("geofences transit beyond the default 100 km", async () => {
    // ~208 km apart — almost always a misgeocode; rejected before hitting MOTIS.
    await expect(
      osm.routing!.route({
        origin: { lat: 37.0, lng: -122.0 },
        destination: { lat: 38.0, lng: -120.0 },
        waypoints: [],
        travelMode: "TRANSIT",
        alternatives: false,
        avoid: [],
      }),
    ).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
  });

  it("allows long transit when the geofence is raised", async () => {
    const far = createOsmProvider({ motisUrl: env.osm.motisUrl, transitMaxKm: 100_000 });
    const result = await far.routing!.route({
      origin: { lat: 37.0, lng: -122.0 },
      destination: { lat: 38.0, lng: -120.0 },
      waypoints: [],
      travelMode: "TRANSIT",
      alternatives: false,
      avoid: [],
    });
    expect(result.routes.length).toBeGreaterThan(0);
  });

  it("requests a wider searchWindow and dedupes the returned options", async () => {
    let planUrl: URL | undefined;
    const cap = createOsmProvider({
      motisUrl: env.osm.motisUrl,
      fetchImpl: capturingFetch((u) => {
        if (u.pathname.endsWith("/plan")) planUrl = u;
      }),
    });
    const result = await cap.routing!.route({
      origin: { lat: 37.42, lng: -122.08 },
      destination: { lat: 37.77, lng: -122.41 },
      waypoints: [],
      travelMode: "TRANSIT",
      alternatives: false,
      avoid: [],
    });
    expect(planUrl?.searchParams.get("searchWindow")).toBeTruthy();
    // the mock returns 3 itineraries (two share the S7 signature) → deduped to 2
    expect(result.routes.length).toBe(2);
  });
});

describe("MOTIS itinerary dedup", () => {
  it("collapses same-signature departures (keeps fastest) and preserves distinct ones", () => {
    const out = dedupeItineraries([
      { duration: 600, legs: [{ mode: "WALK" }, { mode: "BUS", routeShortName: "72" }, { mode: "WALK" }] },
      { duration: 500, legs: [{ mode: "WALK" }, { mode: "BUS", routeShortName: "72" }, { mode: "WALK" }] },
      { duration: 900, legs: [{ mode: "WALK" }, { mode: "SUBWAY", routeShortName: "Red" }, { mode: "WALK" }] },
    ]);
    expect(out.length).toBe(2);
    expect(out[0]!.duration).toBe(500); // fastest first; the kept "72" departure
    const sigs = out.map((it) =>
      (it.legs ?? [])
        .filter((l) => l.mode !== "WALK")
        .map((l) => `${l.mode}:${l.routeShortName}`)
        .join(">"),
    );
    expect(sigs).toContain("BUS:72");
    expect(sigs).toContain("SUBWAY:Red");
  });
});

describe("MOTIS mapping", () => {
  it("folds GTFS vehicle types onto neutral leg modes", () => {
    expect(motisModeToLegMode("SUBURBAN")).toBe("RAIL");
    expect(motisModeToLegMode("SUBWAY")).toBe("SUBWAY");
    expect(motisModeToLegMode("BUS")).toBe("BUS");
    expect(motisModeToLegMode("WALK")).toBe("WALK");
    expect(motisModeToLegMode("FUNICULAR")).toBe("OTHER");
  });

  it("decodes leg geometry at the declared precision", () => {
    const points: LatLngTuple[] = [
      [37.0, -122.0],
      [37.1, -122.1],
    ];
    const route = motisToRoute({
      duration: 600,
      legs: [
        {
          mode: "SUBURBAN",
          duration: 600,
          routeShortName: "S7",
          legGeometry: { points: encodePolyline(points, 7), precision: 7 },
        },
      ],
    });
    expect(route.legs[0]!.mode).toBe("RAIL");
    expect(route.legs[0]!.transit!.line).toBe("S7");
    // ~14 km when decoded at precision 7; decoding at 5 would be 100× off.
    expect(route.legs[0]!.distanceMeters).toBeGreaterThan(10_000);
    expect(route.legs[0]!.distanceMeters).toBeLessThan(20_000);
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
