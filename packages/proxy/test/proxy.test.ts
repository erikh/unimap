import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import { setupMock, type MockEnv } from "@unimap/testing";
import { createProxyApp } from "@unimap/proxy";
import { createGoogleProvider } from "@unimap/provider-google";
import { createAppleProvider, signMapsToken } from "@unimap/provider-apple";
import { createOsmProvider } from "@unimap/provider-osm";

let env: MockEnv;
let app: Hono;

beforeAll(async () => {
  env = await setupMock();
  const google = createGoogleProvider({
    apiKey: "test-key",
    baseUrls: {
      geocode: env.googleBaseUrl,
      routes: env.googleBaseUrl,
      places: env.googleBaseUrl,
      static: env.googleBaseUrl,
    },
  });
  const apple = createAppleProvider({
    privateKey: env.apple.privateKeyPem,
    keyId: env.apple.keyId,
    teamId: env.apple.teamId,
    baseUrl: env.appleBaseUrl,
  });
  const osm = createOsmProvider({
    nominatimUrl: env.osm.nominatimUrl,
    osrmUrl: env.osm.osrmUrl,
    photonUrl: env.osm.photonUrl,
    tileUrl: env.osm.tileUrl,
  });
  app = createProxyApp({
    providers: [google, apple, osm],
    order: {
      geocoding: ["google", "apple", "osm"],
      routing: ["google", "apple", "osm"],
      places: ["google", "apple", "osm"],
      staticmap: ["google", "apple"],
      tiles: ["osm"],
    },
    mapkitTokenSigner: () =>
      signMapsToken({ privateKey: env.apple.privateKeyPem, keyId: env.apple.keyId, teamId: env.apple.teamId }),
    sourceUrl: "https://example.com/unimap-source",
  });
});

afterAll(async () => {
  await env.close();
});

const post = async (path: string, body: unknown): Promise<Response> =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("proxy unified REST", () => {
  it("geocodes via the default (first) provider and returns unified results", async () => {
    const res = await post("/v1/geocode", { query: "1600 Amphitheatre Parkway" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].location.lat).toBeCloseTo(37.4224, 3);
    expect(data[0].attribution.provider).toBe("google");
  });

  it("pins each provider via ?provider= and returns its normalized shape", async () => {
    for (const provider of ["google", "apple", "osm"]) {
      const data = await (await post(`/v1/geocode?provider=${provider}`, { query: "x" })).json();
      expect(data[0].attribution.provider).toBe(provider);
      expect(data[0].address.locality).toBe("Mountain View");
    }
  });

  it("routes and returns a unified route", async () => {
    const data = await (
      await post("/v1/route", { origin: { lat: 37.42, lng: -122.08 }, destination: { lat: 37.77, lng: -122.41 } })
    ).json();
    expect(data.routes[0].distanceMeters).toBe(49_000);
  });

  it("computes a matrix", async () => {
    const data = await (
      await post("/v1/matrix", { origins: [{ lat: 1, lng: 1 }], destinations: [{ lat: 2, lng: 2 }] })
    ).json();
    expect(data.rows[0][0].status).toBe("OK");
  });

  it("searches and autocompletes places", async () => {
    const search = await (await post("/v1/places/search?provider=google", { query: "Googleplex" })).json();
    expect(search[0].name).toBe("Googleplex");
    const ac = await (await post("/v1/places/autocomplete?provider=osm", { input: "Google" })).json();
    expect(ac.length).toBeGreaterThan(0);
  });

  it("builds a static map (google) and exposes osm tiles", async () => {
    const stat = await (
      await post("/v1/staticmap?provider=google", { width: 300, height: 200, center: { lat: 1, lng: 2 }, zoom: 10 })
    ).json();
    expect(stat.url).toContain("staticmap");
    const tiles = await (await app.request("/v1/tiles")).json();
    expect(tiles.kind).toBe("raster");
  });

  it("reports capabilities", async () => {
    const caps = await (await app.request("/v1/capabilities")).json();
    expect(caps.geocoding).toEqual(["google", "apple", "osm"]);
    expect(caps.tiles).toEqual(["osm"]);
  });
});

describe("proxy auth proxying + AGPL", () => {
  it("mints a MapKit JS token (JWT) for the render façade", async () => {
    const data = await (await app.request("/v1/auth/apple/mapkit-token")).json();
    expect(typeof data.token).toBe("string");
    expect(data.token.split(".")).toHaveLength(3);
  });

  it("serves an AGPL §13 source notice", async () => {
    const data = await (await app.request("/source")).json();
    expect(data.license).toBe("AGPL-3.0-or-later");
    expect(data.source).toContain("example.com");
  });
});

describe("proxy validation + error mapping", () => {
  it("returns 400 + VALIDATION_ERROR on an invalid body", async () => {
    const res = await post("/v1/geocode", { notQuery: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 501 when forcing a provider that lacks the capability", async () => {
    const res = await post("/v1/staticmap?provider=osm", { width: 100, height: 100 });
    expect(res.status).toBe(501);
  });
});
