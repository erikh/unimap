export interface GoogleProviderOptions {
  /** API key, injected via header (Routes/Places) or `?key=` (Geocoding/Static). */
  apiKey?: string;
  /** OAuth2 bearer token, used for endpoints that support it (Geocoding v4 / Places). */
  oauthToken?: string;
  /** Override the per-service host roots (point at the mock in tests). */
  baseUrls?: {
    geocode?: string;
    routes?: string;
    places?: string;
    static?: string;
  };
  fetchImpl?: typeof fetch;
}

export interface ResolvedGoogleOptions {
  apiKey?: string;
  oauthToken?: string;
  geocodeUrl: string;
  routesUrl: string;
  placesUrl: string;
  staticUrl: string;
  fetchImpl?: typeof fetch;
}

const trimSlash = (s: string): string => s.replace(/\/+$/, "");

export function resolveGoogleOptions(options: GoogleProviderOptions = {}): ResolvedGoogleOptions {
  const b = options.baseUrls ?? {};
  return {
    apiKey: options.apiKey,
    oauthToken: options.oauthToken,
    geocodeUrl: trimSlash(b.geocode ?? "https://maps.googleapis.com"),
    routesUrl: trimSlash(b.routes ?? "https://routes.googleapis.com"),
    placesUrl: trimSlash(b.places ?? "https://places.googleapis.com"),
    staticUrl: trimSlash(b.static ?? "https://maps.googleapis.com"),
    fetchImpl: options.fetchImpl,
  };
}
