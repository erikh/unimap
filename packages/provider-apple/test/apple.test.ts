import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateAppleTestKeys, setupMock, type MockEnv } from "@unimap/testing";
import { createAppleProvider } from "@unimap/provider-apple";
import { polylineToLatLngs, type Provider } from "@unimap/core";

let env: MockEnv;
let apple: Provider;

beforeAll(async () => {
  env = await setupMock({ requireAppleAuth: true });
  apple = createAppleProvider({
    privateKey: env.apple.privateKeyPem,
    keyId: env.apple.keyId,
    teamId: env.apple.teamId,
    baseUrl: env.appleBaseUrl,
  });
});

afterAll(async () => {
  await env.close();
});

describe("Apple auth", () => {
  it("signs a JWT, exchanges it for an access token, and geocodes", async () => {
    const results = await apple.geocoding!.geocode({ query: "1600 Amphitheatre Parkway" });
    const r = results[0]!;
    expect(r.location.lat).toBeCloseTo(37.4224, 3);
    expect(r.address.locality).toBe("Mountain View");
    expect(r.address.region).toBe("California");
    expect(r.address.countryCode).toBe("US");
    expect(r.attribution.provider).toBe("apple");
  });

  it("rejects a token signed by the wrong key with AuthError", async () => {
    const wrongKeys = await generateAppleTestKeys();
    const badProvider = createAppleProvider({
      privateKey: wrongKeys.privateKeyPem,
      keyId: wrongKeys.keyId,
      teamId: wrongKeys.teamId,
      baseUrl: env.appleBaseUrl,
    });
    await expect(badProvider.geocoding!.geocode({ query: "x" })).rejects.toMatchObject({ code: "AUTH_ERROR" });
  });
});

describe("Apple geocoding", () => {
  it("reverse geocodes", async () => {
    const results = await apple.geocoding!.reverseGeocode({ location: { lat: 37.4224, lng: -122.0841 } });
    expect(results[0]!.address.locality).toBe("Mountain View");
  });
});

describe("Apple routing", () => {
  it("gets directions and assembles an overview polyline", async () => {
    const result = await apple.routing!.route({
      origin: { lat: 37.4224, lng: -122.0841 },
      destination: { lat: 37.7749, lng: -122.4194 },
      waypoints: [],
      travelMode: "DRIVE",
      alternatives: false,
      avoid: [],
    });
    const route = result.routes[0]!;
    expect(route.distanceMeters).toBe(49_000);
    expect(route.durationSeconds).toBe(3_000);
    expect(route.legs[0]!.steps).toHaveLength(2);
    expect(polylineToLatLngs(route.polyline!).length).toBe(3);
  });

  it("builds an ETA matrix (one etas call per origin)", async () => {
    const matrix = await apple.routing!.matrix({
      origins: [
        { lat: 37.42, lng: -122.08 },
        { lat: 37.5, lng: -122.2 },
      ],
      destinations: [
        { lat: 37.77, lng: -122.41 },
        { lat: 37.8, lng: -122.27 },
      ],
      travelMode: "DRIVE",
    });
    expect(matrix.rows).toHaveLength(2);
    expect(matrix.rows[0]).toHaveLength(2);
    expect(matrix.rows[0]![0]!.status).toBe("OK");
    expect(matrix.rows[0]![0]!.durationSeconds).toBeGreaterThan(0);
  });
});

describe("Apple places", () => {
  it("searches", async () => {
    const places = await apple.places!.search({ query: "Googleplex", categories: [] });
    expect(places[0]!.name).toBe("Googleplex");
    expect(places[0]!.id).toMatch(/^apple:/);
    expect(places[0]!.categories[0]!.id).toBe("Business");
  });

  it("autocompletes", async () => {
    const suggestions = await apple.places!.autocomplete({ input: "Google" });
    expect(suggestions[0]!.text).toMatch(/Googleplex/);
  });

  it("gets details by id", async () => {
    const place = await apple.places!.details({ id: "apple:ChIJ2eUgeAK6j4ARbn5u_wAGqWA" });
    expect(place.provider).toBe("apple");
    expect(place.location).toBeDefined();
  });
});

describe("Apple static map", () => {
  it("signs a token and builds a Web Snapshot URL", async () => {
    const result = await apple.staticmap!.staticMap({
      center: { lat: 37.42, lng: -122.08 },
      zoom: 12,
      width: 600,
      height: 400,
      markers: [{ location: { lat: 37.42, lng: -122.08 }, color: "red" }],
    });
    expect(result.url).toContain("snapshot");
    expect(result.url).toContain("size=600x400");
    expect(result.url).toContain("token=");
    expect(result.attribution.provider).toBe("apple");
  });

  it("does not advertise tiles (basemap is MapKit-JS-locked)", () => {
    expect(apple.tiles).toBeUndefined();
  });
});
