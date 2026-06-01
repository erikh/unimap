import { describe, expect, it } from "vitest";
import {
  MapsClient,
  boundsFromPoints,
  decodePolyline,
  encodePolyline,
  haversineMeters,
  type GeocodeResult,
  type LatLngTuple,
  type Provider,
} from "@unimap/core";

const attribution = { provider: "test", text: "Test" };

describe("polyline codec", () => {
  it("matches the canonical encoded-polyline example", () => {
    const points: LatLngTuple[] = [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ];
    const encoded = encodePolyline(points);
    expect(encoded).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(decodePolyline(encoded)).toEqual(points);
  });
});

describe("geo helpers", () => {
  it("computes haversine distance for one degree of longitude at the equator", () => {
    const meters = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    expect(meters).toBeGreaterThan(111_000);
    expect(meters).toBeLessThan(112_000);
  });

  it("computes a bounding box", () => {
    expect(
      boundsFromPoints([
        { lat: 1, lng: 2 },
        { lat: -3, lng: 5 },
      ]),
    ).toEqual({ south: -3, west: 2, north: 1, east: 5 });
  });
});

describe("MapsClient", () => {
  const result: GeocodeResult = {
    location: { lat: 1, lng: 2 },
    address: { formatted: "somewhere", components: [] },
    attribution,
  };

  it("falls back to the next provider when one throws", async () => {
    const failing: Provider = {
      id: "a",
      attribution,
      geocoding: {
        geocode: async () => {
          throw new Error("boom");
        },
        reverseGeocode: async () => [],
      },
    };
    const working: Provider = {
      id: "b",
      attribution,
      geocoding: { geocode: async () => [result], reverseGeocode: async () => [] },
    };
    const fellBack: string[] = [];
    const client = new MapsClient({
      providers: [failing, working],
      onFallback: (info) => fellBack.push(info.providerId),
    });

    expect(await client.geocode({ query: "x" })).toEqual([result]);
    expect(fellBack).toEqual(["a"]);
  });

  it("respects an explicit per-capability provider order", () => {
    const a: Provider = {
      id: "a",
      attribution,
      geocoding: { geocode: async () => [], reverseGeocode: async () => [] },
    };
    const b: Provider = {
      id: "b",
      attribution,
      geocoding: { geocode: async () => [], reverseGeocode: async () => [] },
    };
    const client = new MapsClient({ providers: [a, b], order: { geocoding: ["b", "a"] } });
    expect(client.capabilities().geocoding).toEqual(["b", "a"]);
  });

  it("throws NotSupported when no provider has the capability", async () => {
    const client = new MapsClient({ providers: [{ id: "a", attribution }] });
    await expect(client.geocode({ query: "x" })).rejects.toThrow(/capability/);
  });
});
