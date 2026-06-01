import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupMock, type MockEnv } from "@unimap/testing";
import { startProxy, type StartedProxy } from "@unimap/proxy";
import { createGoogleProvider } from "@unimap/provider-google";
import { createAppleProvider } from "@unimap/provider-apple";
import { createOsmProvider } from "@unimap/provider-osm";
import { createUnimapClient, type UnimapClient } from "@unimap/client";

let env: MockEnv;
let proxy: StartedProxy;
let client: UnimapClient;

beforeAll(async () => {
  env = await setupMock();
  const providers = [
    createGoogleProvider({
      apiKey: "test-key",
      baseUrls: {
        geocode: env.googleBaseUrl,
        routes: env.googleBaseUrl,
        places: env.googleBaseUrl,
        static: env.googleBaseUrl,
      },
    }),
    createAppleProvider({
      privateKey: env.apple.privateKeyPem,
      keyId: env.apple.keyId,
      teamId: env.apple.teamId,
      baseUrl: env.appleBaseUrl,
    }),
    createOsmProvider({
      nominatimUrl: env.osm.nominatimUrl,
      osrmUrl: env.osm.osrmUrl,
      photonUrl: env.osm.photonUrl,
      tileUrl: env.osm.tileUrl,
    }),
  ];
  proxy = await startProxy({
    providers,
    order: { geocoding: ["google", "apple", "osm"], tiles: ["osm"], staticmap: ["google", "apple"] },
  });
  client = createUnimapClient({ baseUrl: proxy.url });
});

afterAll(async () => {
  await proxy.close();
  await env.close();
});

describe("client → proxy → adapter → mock (full stack over HTTP)", () => {
  it("geocodes and validates the response against the shared schema", async () => {
    const results = await client.geocode({ query: "1600 Amphitheatre Parkway" });
    expect(results[0]!.location.lat).toBeCloseTo(37.4224, 3);
    expect(results[0]!.attribution.provider).toBe("google");
  });

  it("honours a pinned provider", async () => {
    const osmClient = createUnimapClient({ baseUrl: proxy.url, provider: "osm" });
    const results = await osmClient.geocode({ query: "x" });
    expect(results[0]!.attribution.provider).toBe("osm");
    expect(results[0]!.placeId).toBe("osm:N2192620");
  });

  it("routes and computes a matrix", async () => {
    const route = await client.route({
      origin: { lat: 37.42, lng: -122.08 },
      destination: { lat: 37.77, lng: -122.41 },
      waypoints: [],
      travelMode: "DRIVE",
      alternatives: false,
      avoid: [],
    });
    expect(route.routes[0]!.distanceMeters).toBe(49_000);

    const matrix = await client.matrix({
      origins: [{ lat: 1, lng: 1 }],
      destinations: [{ lat: 2, lng: 2 }],
      travelMode: "DRIVE",
    });
    expect(matrix.rows[0]![0]!.status).toBe("OK");
  });

  it("searches and autocompletes places", async () => {
    const search = await client.search({ query: "Googleplex", categories: [] });
    expect(search[0]!.name).toBe("Googleplex");
    const suggestions = await client.autocomplete({ input: "Google" });
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("fetches tiles and capabilities", async () => {
    const tiles = await client.tileSource();
    expect(tiles.kind).toBe("raster");
    const caps = await client.capabilities();
    expect(caps.geocoding).toContain("google");
  });

  it("maps proxy error responses back to typed SDK errors", async () => {
    const osmClient = createUnimapClient({ baseUrl: proxy.url, provider: "osm" });
    await expect(osmClient.staticMap({ width: 100, height: 100, markers: [] })).rejects.toMatchObject({
      code: "NOT_SUPPORTED",
    });
  });

  it("never invokes fetch with the client as `this` (browser Illegal-invocation guard)", async () => {
    let capturedThis: unknown = "unset";
    function probeFetch(this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      capturedThis = this;
      return fetch(input, init);
    }
    const probed = createUnimapClient({ baseUrl: proxy.url, provider: "osm", fetchImpl: probeFetch as typeof fetch });
    await probed.geocode({ query: "x" });
    // A browser throws "Illegal invocation" if fetch runs with `this` === the client instance.
    expect(capturedThis).not.toBe(probed);
    expect(capturedThis).toBe(globalThis);
  });
});
