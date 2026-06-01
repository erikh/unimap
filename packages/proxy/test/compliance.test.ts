import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GeocodeResultSchema } from "@unimap/core";
import { setupMock, type MockEnv } from "@unimap/testing";
import { createGoogleProvider } from "@unimap/provider-google";
import { createAppleProvider } from "@unimap/provider-apple";
import { createOsmProvider } from "@unimap/provider-osm";
import type { Provider } from "@unimap/core";

let env: MockEnv;
let providers: { id: string; provider: Provider }[];

beforeAll(async () => {
  env = await setupMock();
  providers = [
    { id: "google", provider: createGoogleProvider({ apiKey: "test-key", baseUrls: { geocode: env.googleBaseUrl } }) },
    {
      id: "apple",
      provider: createAppleProvider({
        privateKey: env.apple.privateKeyPem,
        keyId: env.apple.keyId,
        teamId: env.apple.teamId,
        baseUrl: env.appleBaseUrl,
      }),
    },
    { id: "osm", provider: createOsmProvider({ nominatimUrl: env.osm.nominatimUrl }) },
  ];
});
afterAll(async () => {
  await env.close();
});

describe("compliance invariants", () => {
  it("every provider attaches its own attribution to results", async () => {
    for (const { id, provider } of providers) {
      const [result] = await provider.geocoding!.geocode({ query: "1600 Amphitheatre Parkway" });
      expect(result, `${id} returned a result`).toBeDefined();
      expect(result!.attribution.provider).toBe(id);
      expect(result!.attribution.text.length).toBeGreaterThan(0);
    }
  });

  it("clean-room boundary: results match the canonical schema with no extra top-level keys", async () => {
    const strict = GeocodeResultSchema.strict();
    for (const { id, provider } of providers) {
      const [result] = await provider.geocoding!.geocode({ query: "1600 Amphitheatre Parkway" });
      expect(() => strict.parse(result), `${id} stays within the clean-room vocabulary`).not.toThrow();
    }
  });
});
