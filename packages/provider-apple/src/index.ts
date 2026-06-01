import {
  httpJson,
  NotFoundError,
  NotSupportedError,
  type AutocompleteRequest,
  type GeocodeQuery,
  type GeocodeResult,
  type GeocodingService,
  type Matrix,
  type MatrixCell,
  type MatrixRequest,
  type Place,
  type PlaceDetailsRequest,
  type PlaceSearchRequest,
  type PlacesService,
  type Provider,
  type ReverseGeocodeQuery,
  type RouteRequest,
  type RouteResult,
  type RoutingService,
  type StaticMapRequest,
  type StaticMapResult,
  type StaticMapService,
  type Suggestion,
} from "@unimap/core";
import { resolveAppleOptions, type AppleProviderOptions, type ResolvedAppleOptions } from "./options";
import {
  APPLE_ATTRIBUTION,
  appleToGeocode,
  appleToPlace,
  appleToRouteResult,
  appleToSuggestion,
  appleTransportType,
  type AppleAutocompleteResponse,
  type AppleDirResponse,
  type AppleEtasResponse,
  type AppleGeocodeResponse,
  type ApplePlace,
  type AppleSearchResponse,
} from "./mappers";

export * from "./options";
export { signMapsToken, createAppleTokenProvider } from "./auth";
export { APPLE_ATTRIBUTION, appleToGeocode, appleToPlace, appleToRouteResult } from "./mappers";

abstract class AppleService {
  constructor(protected readonly opts: ResolvedAppleOptions) {}
  protected async authHeaders(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.opts.getAccessToken()}` };
  }
  protected ctx() {
    return { providerId: "apple", fetchImpl: this.opts.fetchImpl };
  }
}

class AppleGeocoding extends AppleService implements GeocodingService {
  async geocode(query: GeocodeQuery): Promise<GeocodeResult[]> {
    const url = new URL(`${this.opts.baseUrl}/v1/geocode`);
    url.searchParams.set("q", query.query);
    if (query.language) url.searchParams.set("lang", query.language);
    if (query.limit) url.searchParams.set("limitToCountries", "");
    const data = await httpJson<AppleGeocodeResponse>(url, { headers: await this.authHeaders() }, this.ctx());
    return (data.results ?? []).map(appleToGeocode);
  }

  async reverseGeocode(query: ReverseGeocodeQuery): Promise<GeocodeResult[]> {
    const url = new URL(`${this.opts.baseUrl}/v1/reverseGeocode`);
    url.searchParams.set("loc", `${query.location.lat},${query.location.lng}`);
    if (query.language) url.searchParams.set("lang", query.language);
    const data = await httpJson<AppleGeocodeResponse>(url, { headers: await this.authHeaders() }, this.ctx());
    return (data.results ?? []).map(appleToGeocode);
  }
}

class AppleRouting extends AppleService implements RoutingService {
  async route(request: RouteRequest): Promise<RouteResult> {
    const url = new URL(`${this.opts.baseUrl}/v1/directions`);
    url.searchParams.set("origin", `${request.origin.lat},${request.origin.lng}`);
    url.searchParams.set("destination", `${request.destination.lat},${request.destination.lng}`);
    url.searchParams.set("transportType", appleTransportType(request.travelMode));
    if (request.language) url.searchParams.set("lang", request.language);
    const data = await httpJson<AppleDirResponse>(url, { headers: await this.authHeaders() }, this.ctx());
    const result = appleToRouteResult(data);
    if (!result.routes.length) throw new NotFoundError("No route found", { providerId: "apple" });
    return result;
  }

  async matrix(request: MatrixRequest): Promise<Matrix> {
    const headers = await this.authHeaders();
    const destinationsParam = request.destinations.map((d) => `${d.lat},${d.lng}`).join("|");
    const rows: MatrixCell[][] = [];
    for (const origin of request.origins) {
      const url = new URL(`${this.opts.baseUrl}/v1/etas`);
      url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
      url.searchParams.set("destinations", destinationsParam);
      url.searchParams.set("transportType", appleTransportType(request.travelMode));
      const data = await httpJson<AppleEtasResponse>(url, { headers }, this.ctx());
      const etas = data.etas ?? [];
      rows.push(
        request.destinations.map((_, i): MatrixCell => {
          const eta = etas[i];
          return eta
            ? { durationSeconds: eta.expectedTravelTimeSeconds, distanceMeters: eta.distanceMeters, status: "OK" }
            : { status: "NOT_FOUND" };
        }),
      );
    }
    return { origins: request.origins, destinations: request.destinations, rows, attribution: APPLE_ATTRIBUTION };
  }
}

class ApplePlaces extends AppleService implements PlacesService {
  async search(request: PlaceSearchRequest): Promise<Place[]> {
    const url = new URL(`${this.opts.baseUrl}/v1/search`);
    url.searchParams.set("q", request.query ?? "");
    if (request.location) url.searchParams.set("searchLocation", `${request.location.lat},${request.location.lng}`);
    if (request.language) url.searchParams.set("lang", request.language);
    const data = await httpJson<AppleSearchResponse>(url, { headers: await this.authHeaders() }, this.ctx());
    return (data.results ?? []).map(appleToPlace);
  }

  async autocomplete(request: AutocompleteRequest): Promise<Suggestion[]> {
    const url = new URL(`${this.opts.baseUrl}/v1/searchAutocomplete`);
    url.searchParams.set("q", request.input);
    if (request.location) url.searchParams.set("searchLocation", `${request.location.lat},${request.location.lng}`);
    if (request.language) url.searchParams.set("lang", request.language);
    const data = await httpJson<AppleAutocompleteResponse>(url, { headers: await this.authHeaders() }, this.ctx());
    return (data.results ?? []).map(appleToSuggestion);
  }

  async details(request: PlaceDetailsRequest): Promise<Place> {
    const id = request.id.replace(/^apple:/, "");
    const url = `${this.opts.baseUrl}/v1/place/${encodeURIComponent(id)}`;
    const data = await httpJson<ApplePlace>(url, { headers: await this.authHeaders() }, this.ctx());
    return appleToPlace(data);
  }
}

class AppleStaticMap extends AppleService implements StaticMapService {
  async staticMap(request: StaticMapRequest): Promise<StaticMapResult> {
    if (!this.opts.signToken) {
      throw new NotSupportedError("Apple Web Snapshots require MapKit credentials", { providerId: "apple" });
    }
    const token = await this.opts.signToken();
    const url = new URL(this.opts.snapshotUrl);
    if (request.center) url.searchParams.set("center", `${request.center.lat},${request.center.lng}`);
    if (request.zoom != null) url.searchParams.set("z", String(request.zoom));
    url.searchParams.set("size", `${request.width}x${request.height}`);
    if (request.scale) url.searchParams.set("scale", String(request.scale));
    if (request.markers.length) {
      url.searchParams.set(
        "annotations",
        JSON.stringify(
          request.markers.map((m) => ({
            point: `${m.location.lat},${m.location.lng}`,
            color: m.color,
            glyphText: m.label,
          })),
        ),
      );
    }
    url.searchParams.set("token", token);
    return { url: url.toString(), width: request.width, height: request.height, attribution: APPLE_ATTRIBUTION };
  }
}

/**
 * Apple Maps provider over the Maps Server API. Geocoding, routing (directions
 * + ETA matrix), places, and static maps (Web Snapshots). Auth is an ES256 JWT
 * exchanged for a ~30-minute access token. Basemap tiles are MapKit-JS-locked,
 * so there is no `tiles` capability — the render façade's AppleEngine handles
 * interactive Apple basemaps.
 */
export function createAppleProvider(options: AppleProviderOptions = {}): Provider {
  const opts = resolveAppleOptions(options);
  return {
    id: "apple",
    attribution: APPLE_ATTRIBUTION,
    geocoding: new AppleGeocoding(opts),
    routing: new AppleRouting(opts),
    places: new ApplePlaces(opts),
    staticmap: new AppleStaticMap(opts),
  };
}
