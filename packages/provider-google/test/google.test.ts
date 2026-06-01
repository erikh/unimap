import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupMock, type MockEnv } from "@unimap/testing";
import { createGoogleProvider } from "@unimap/provider-google";
import { polylineToLatLngs, type Provider } from "@unimap/core";

let env: MockEnv;
let google: Provider;

function provider(extra: { apiKey?: string; fetchImpl?: typeof fetch } = {}): Provider {
  return createGoogleProvider({
    apiKey: extra.apiKey ?? "test-key",
    fetchImpl: extra.fetchImpl,
    baseUrls: {
      geocode: env.googleBaseUrl,
      routes: env.googleBaseUrl,
      places: env.googleBaseUrl,
      static: env.googleBaseUrl,
    },
  });
}

beforeAll(async () => {
  env = await setupMock();
  google = provider();
});

afterAll(async () => {
  await env.close();
});

describe("Google geocoding", () => {
  it("geocodes and normalises address components", async () => {
    const results = await google.geocoding!.geocode({ query: "1600 Amphitheatre Parkway" });
    const r = results[0]!;
    expect(r.location.lat).toBeCloseTo(37.4224, 3);
    expect(r.address.country).toBe("United States");
    expect(r.address.countryCode).toBe("US");
    expect(r.address.region).toBe("California");
    expect(r.address.postalCode).toBe("94043");
    expect(r.confidence).toBe(1); // ROOFTOP
    expect(r.placeId).toMatch(/^google:/);
    expect(r.attribution.provider).toBe("google");
  });

  it("reverse geocodes", async () => {
    const results = await google.geocoding!.reverseGeocode({ location: { lat: 37.4224, lng: -122.0841 } });
    expect(results[0]!.address.locality).toBe("Mountain View");
  });

  it("maps a missing API key (REQUEST_DENIED) to AuthError", async () => {
    const noKey = createGoogleProvider({ baseUrls: { geocode: env.googleBaseUrl } });
    await expect(noKey.geocoding!.geocode({ query: "x" })).rejects.toMatchObject({ code: "AUTH_ERROR" });
  });
});

describe("Google routing", () => {
  it("computes a route via the Routes API and decodes the polyline", async () => {
    const result = await google.routing!.route({
      origin: { lat: 37.4224, lng: -122.0841 },
      destination: { lat: 37.7749, lng: -122.4194 },
      waypoints: [],
      travelMode: "DRIVE",
      alternatives: false,
      avoid: [],
    });
    const route = result.routes[0]!;
    expect(route.distanceMeters).toBe(49_000);
    expect(route.durationSeconds).toBe(3_000); // parsed from "3000s"
    expect(route.legs[0]!.steps[0]!.maneuver?.instruction).toMatch(/north/i);
    expect(polylineToLatLngs(route.polyline!).length).toBeGreaterThan(1);
  });

  it("computes a route matrix", async () => {
    const matrix = await google.routing!.matrix({
      origins: [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
      destinations: [{ lat: 3, lng: 3 }],
      travelMode: "DRIVE",
    });
    expect(matrix.rows).toHaveLength(2);
    expect(matrix.rows[0]![0]!.status).toBe("OK");
    expect(matrix.rows[1]![0]!.durationSeconds).toBeGreaterThan(0);
  });
});

describe("Google places", () => {
  it("searches text", async () => {
    const places = await google.places!.search({ query: "Googleplex", categories: [] });
    expect(places[0]!.name).toBe("Googleplex");
    expect(places[0]!.rating).toBe(4.5);
    expect(places[0]!.id).toMatch(/^google:/);
  });

  it("autocompletes", async () => {
    const suggestions = await google.places!.autocomplete({ input: "Google" });
    expect(suggestions[0]!.text).toMatch(/Googleplex/);
    expect(suggestions[0]!.placeId).toMatch(/^google:/);
  });

  it("fetches details", async () => {
    const place = await google.places!.details({ id: "google:ChIJ2eUgeAK6j4ARbn5u_wAGqWA" });
    expect(place.provider).toBe("google");
    expect(place.website).toContain("google.com");
  });
});

describe("Google static map", () => {
  it("builds a signed static-map URL with markers", async () => {
    const result = await google.staticmap!.staticMap({
      center: { lat: 37.42, lng: -122.08 },
      zoom: 13,
      width: 600,
      height: 400,
      markers: [{ location: { lat: 37.42, lng: -122.08 }, color: "red", label: "A" }],
    });
    expect(result.url).toContain("/maps/api/staticmap");
    expect(result.url).toContain("size=600x400");
    expect(result.url).toContain("markers=");
    expect(result.url).toContain("key=test-key");
    expect(result.attribution.provider).toBe("google");
  });

  it("does not advertise tiles (basemap is SDK-locked)", () => {
    expect(google.tiles).toBeUndefined();
  });
});
