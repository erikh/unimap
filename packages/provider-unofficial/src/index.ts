// ===========================================================================
// REVERSE-ENGINEERED / UNOFFICIAL PROVIDER TIER
// ---------------------------------------------------------------------------
// These adapters target UNDOCUMENTED endpoints. They are DISABLED by default
// and only construct when UNIMAP_ENABLE_UNOFFICIAL=1. Using them may VIOLATE
// the relevant provider's Terms of Service and can break without notice. The
// *interface* is clean-room (the shared @unimap/core vocabulary); only the
// transport is unofficial. Ship the official tier in production.
// ===========================================================================
import {
  httpJson,
  NotSupportedError,
  type Attribution,
  type GeocodeQuery,
  type GeocodeResult,
  type Provider,
} from "@unimap/core";
import { assertUnofficialEnabled, isUnofficialEnabled } from "./guard";

export { assertUnofficialEnabled, isUnofficialEnabled } from "./guard";

export interface UnofficialOptions {
  /** Base URL of the (undocumented) endpoint. Point at the mock in tests. */
  baseUrl?: string;
  /** Override the env used for the enablement gate (tests). */
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

const UNOFFICIAL_ATTRIBUTION: Attribution = {
  provider: "google-unofficial",
  text: "Powered by Google (unofficial / reverse-engineered)",
  url: "https://www.google.com/maps",
};

interface InternalGeocodeResponse {
  results?: { loc: { lat: number; lng: number }; addr: string; locality?: string; cc?: string }[];
}

/**
 * Example reverse-engineered Google-style geocoder. Implements the standard
 * clean-room GeocodingService against an undocumented JSON endpoint.
 */
export function createUnofficialGoogleProvider(options: UnofficialOptions = {}): Provider {
  assertUnofficialEnabled(options.env);
  const baseUrl = (options.baseUrl ?? "https://www.google.com/maps").replace(/\/+$/, "");
  return {
    id: "google-unofficial",
    attribution: UNOFFICIAL_ATTRIBUTION,
    geocoding: {
      async geocode(query: GeocodeQuery): Promise<GeocodeResult[]> {
        const url = new URL(`${baseUrl}/geocode`);
        url.searchParams.set("q", query.query);
        const data = await httpJson<InternalGeocodeResponse>(
          url,
          {},
          { providerId: "google-unofficial", fetchImpl: options.fetchImpl },
        );
        return (data.results ?? []).map((r) => ({
          location: { lat: r.loc.lat, lng: r.loc.lng },
          address: { formatted: r.addr, locality: r.locality, countryCode: r.cc, components: [] },
          attribution: UNOFFICIAL_ATTRIBUTION,
        }));
      },
      async reverseGeocode(): Promise<GeocodeResult[]> {
        throw new NotSupportedError("Unofficial reverse geocoding is not implemented", {
          providerId: "google-unofficial",
        });
      },
    },
  };
}

/** Build all enabled unofficial providers. Returns [] when the tier is disabled. */
export function createUnofficialProviders(options: UnofficialOptions = {}): Provider[] {
  if (!isUnofficialEnabled(options.env)) return [];
  return [createUnofficialGoogleProvider(options)];
}
