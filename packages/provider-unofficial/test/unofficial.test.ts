import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupMock, type MockEnv } from "@unimap/testing";
import { buildProvidersFromEnv } from "@unimap/proxy";
import {
  createUnofficialGoogleProvider,
  createUnofficialProviders,
  isUnofficialEnabled,
} from "@unimap/provider-unofficial";

let env: MockEnv;

beforeAll(async () => {
  env = await setupMock();
});
afterAll(async () => {
  await env.close();
});

const ENABLED = { UNIMAP_ENABLE_UNOFFICIAL: "1" };

describe("unofficial tier gating (compliance)", () => {
  it("throws when constructed with the flag off", () => {
    expect(() => createUnofficialGoogleProvider({ env: {} })).toThrow(/disabled/i);
  });

  it("isUnofficialEnabled reflects the env flag", () => {
    expect(isUnofficialEnabled({})).toBe(false);
    expect(isUnofficialEnabled(ENABLED)).toBe(true);
  });

  it("createUnofficialProviders returns [] when disabled", () => {
    expect(createUnofficialProviders({ env: {} })).toEqual([]);
  });

  it("the proxy's env builder never includes the unofficial tier by default", () => {
    const built = buildProvidersFromEnv({});
    expect(built.providers.some((p) => p.id.includes("unofficial"))).toBe(false);
    expect(built.unofficialRequested).toBe(false);
    expect(buildProvidersFromEnv(ENABLED).unofficialRequested).toBe(true);
  });
});

describe("unofficial adapter (when explicitly enabled)", () => {
  it("geocodes against the (mock) undocumented endpoint", async () => {
    const provider = createUnofficialGoogleProvider({ baseUrl: env.unofficialBaseUrl, env: ENABLED });
    const results = await provider.geocoding!.geocode({ query: "1600 Amphitheatre Parkway" });
    expect(results[0]!.location.lat).toBeCloseTo(37.4224, 3);
    expect(results[0]!.attribution.provider).toBe("google-unofficial");
  });
});
