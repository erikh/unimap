import {
  httpJson,
  AuthError,
  NotFoundError,
  ProviderError,
  RateLimitError,
  ValidationError,
  type AutocompleteRequest,
  type GeocodeQuery,
  type GeocodeResult,
  type GeocodingService,
  type LatLng,
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
import { resolveGoogleOptions, type GoogleProviderOptions, type ResolvedGoogleOptions } from "./options";
import {
  GOOGLE_ATTRIBUTION,
  googleToGeocode,
  googleToPlace,
  googleToRoute,
  googleToSuggestion,
  googleTravelMode,
  parseGoogleDuration,
  type GoogleAutocompleteResponse,
  type GoogleComputeRoutesResponse,
  type GoogleGeocodeResponse,
  type GoogleMatrixCell,
  type GooglePlace,
  type GoogleSearchResponse,
} from "./mappers";

export * from "./options";
export {
  GOOGLE_ATTRIBUTION,
  googleToGeocode,
  googleToRoute,
  googleToPlace,
  parseGoogleDuration,
} from "./mappers";

const latLng = (p: LatLng) => ({ latLng: { latitude: p.lat, longitude: p.lng } });

class GoogleGeocoding implements GeocodingService {
  constructor(private readonly opts: ResolvedGoogleOptions) {}

  async geocode(query: GeocodeQuery): Promise<GeocodeResult[]> {
    const url = new URL(`${this.opts.geocodeUrl}/maps/api/geocode/json`);
    url.searchParams.set("address", query.query);
    if (query.language) url.searchParams.set("language", query.language);
    if (query.region) url.searchParams.set("region", query.region);
    if (query.bounds) {
      const b = query.bounds;
      url.searchParams.set("bounds", `${b.south},${b.west}|${b.north},${b.east}`);
    }
    return this.request(url, query.limit);
  }

  async reverseGeocode(query: ReverseGeocodeQuery): Promise<GeocodeResult[]> {
    const url = new URL(`${this.opts.geocodeUrl}/maps/api/geocode/json`);
    url.searchParams.set("latlng", `${query.location.lat},${query.location.lng}`);
    if (query.language) url.searchParams.set("language", query.language);
    return this.request(url, query.limit);
  }

  private async request(url: URL, limit?: number): Promise<GeocodeResult[]> {
    if (this.opts.apiKey) url.searchParams.set("key", this.opts.apiKey);
    const headers: Record<string, string> = {};
    if (this.opts.oauthToken) headers["Authorization"] = `Bearer ${this.opts.oauthToken}`;
    const data = await httpJson<GoogleGeocodeResponse>(url, { headers }, this.ctx());
    switch (data.status) {
      case "OK": {
        const results = (data.results ?? []).map(googleToGeocode);
        return limit ? results.slice(0, limit) : results;
      }
      case "ZERO_RESULTS":
        return [];
      case "REQUEST_DENIED":
        throw new AuthError(data.error_message ?? "Google request denied", { providerId: "google" });
      case "OVER_QUERY_LIMIT":
        throw new RateLimitError("Google query limit exceeded", { providerId: "google" });
      case "INVALID_REQUEST":
        throw new ValidationError(data.error_message ?? "Invalid Google request", { providerId: "google" });
      default:
        throw new ProviderError(`Google geocoding failed: ${data.status}`, { providerId: "google" });
    }
  }

  private ctx() {
    return { providerId: "google", fetchImpl: this.opts.fetchImpl };
  }
}

class GoogleRouting implements RoutingService {
  constructor(private readonly opts: ResolvedGoogleOptions) {}

  async route(request: RouteRequest): Promise<RouteResult> {
    const mask = [
      "routes.distanceMeters",
      "routes.duration",
      "routes.polyline.encodedPolyline",
      "routes.legs.distanceMeters",
      "routes.legs.duration",
      "routes.legs.polyline.encodedPolyline",
      "routes.legs.steps.distanceMeters",
      "routes.legs.steps.staticDuration",
      "routes.legs.steps.navigationInstruction",
      "routes.legs.steps.polyline.encodedPolyline",
    ].join(",");
    const body: Record<string, unknown> = {
      origin: { location: latLng(request.origin) },
      destination: { location: latLng(request.destination) },
      intermediates: request.waypoints.map((w) => ({ location: latLng(w) })),
      travelMode: googleTravelMode(request.travelMode),
      polylineEncoding: "ENCODED_POLYLINE",
      computeAlternativeRoutes: request.alternatives,
      routeModifiers: {
        avoidTolls: request.avoid.includes("tolls"),
        avoidHighways: request.avoid.includes("highways"),
        avoidFerries: request.avoid.includes("ferries"),
      },
      languageCode: request.language,
      units: request.units,
    };
    if (request.travelMode === "DRIVE") body["routingPreference"] = "TRAFFIC_AWARE";
    if (request.departureTime) body["departureTime"] = request.departureTime;

    const data = await httpJson<GoogleComputeRoutesResponse>(
      `${this.opts.routesUrl}/directions/v2:computeRoutes`,
      { method: "POST", headers: this.postHeaders(mask), body: JSON.stringify(body) },
      this.ctx(),
    );
    if (!data.routes?.length) throw new NotFoundError("No route found", { providerId: "google" });
    return { routes: data.routes.map(googleToRoute), attribution: GOOGLE_ATTRIBUTION };
  }

  async matrix(request: MatrixRequest): Promise<Matrix> {
    const mask = "originIndex,destinationIndex,distanceMeters,duration,condition";
    const body = {
      origins: request.origins.map((o) => ({ waypoint: { location: latLng(o) } })),
      destinations: request.destinations.map((d) => ({ waypoint: { location: latLng(d) } })),
      travelMode: googleTravelMode(request.travelMode),
    };
    const cells = await httpJson<GoogleMatrixCell[]>(
      `${this.opts.routesUrl}/distanceMatrix/v2:computeRouteMatrix`,
      { method: "POST", headers: this.postHeaders(mask), body: JSON.stringify(body) },
      this.ctx(),
    );
    const rows: MatrixCell[][] = request.origins.map(() =>
      request.destinations.map((): MatrixCell => ({ status: "NOT_FOUND" })),
    );
    for (const cell of cells) {
      const row = rows[cell.originIndex];
      if (row && cell.destinationIndex < row.length) {
        row[cell.destinationIndex] = {
          durationSeconds: parseGoogleDuration(cell.duration),
          distanceMeters: cell.distanceMeters,
          status: cell.condition === "ROUTE_EXISTS" ? "OK" : "NOT_FOUND",
        };
      }
    }
    return { origins: request.origins, destinations: request.destinations, rows, attribution: GOOGLE_ATTRIBUTION };
  }

  private postHeaders(fieldMask: string): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-Goog-FieldMask": fieldMask };
    if (this.opts.apiKey) headers["X-Goog-Api-Key"] = this.opts.apiKey;
    if (this.opts.oauthToken) headers["Authorization"] = `Bearer ${this.opts.oauthToken}`;
    return headers;
  }

  private ctx() {
    return { providerId: "google", fetchImpl: this.opts.fetchImpl };
  }
}

class GooglePlaces implements PlacesService {
  constructor(private readonly opts: ResolvedGoogleOptions) {}

  async search(request: PlaceSearchRequest): Promise<Place[]> {
    const body: Record<string, unknown> = { textQuery: request.query ?? "" };
    if (request.limit) body["maxResultCount"] = request.limit;
    if (request.language) body["languageCode"] = request.language;
    if (request.location && request.radiusMeters) {
      body["locationBias"] = { circle: { center: latLng(request.location).latLng, radius: request.radiusMeters } };
    }
    const mask =
      "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.rating,places.nationalPhoneNumber,places.websiteUri";
    const data = await httpJson<GoogleSearchResponse>(
      `${this.opts.placesUrl}/v1/places:searchText`,
      { method: "POST", headers: this.postHeaders(mask), body: JSON.stringify(body) },
      this.ctx(),
    );
    return (data.places ?? []).map(googleToPlace);
  }

  async autocomplete(request: AutocompleteRequest): Promise<Suggestion[]> {
    const body: Record<string, unknown> = { input: request.input };
    if (request.language) body["languageCode"] = request.language;
    if (request.location) {
      body["locationBias"] = { circle: { center: latLng(request.location).latLng, radius: 50_000 } };
    }
    const mask =
      "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat";
    const data = await httpJson<GoogleAutocompleteResponse>(
      `${this.opts.placesUrl}/v1/places:autocomplete`,
      { method: "POST", headers: this.postHeaders(mask), body: JSON.stringify(body) },
      this.ctx(),
    );
    return (data.suggestions ?? []).map(googleToSuggestion);
  }

  async details(request: PlaceDetailsRequest): Promise<Place> {
    const id = request.id.replace(/^google:/, "");
    const mask =
      "id,displayName,formattedAddress,location,types,primaryType,rating,nationalPhoneNumber,websiteUri";
    const headers: Record<string, string> = { "X-Goog-FieldMask": mask };
    if (this.opts.apiKey) headers["X-Goog-Api-Key"] = this.opts.apiKey;
    if (this.opts.oauthToken) headers["Authorization"] = `Bearer ${this.opts.oauthToken}`;
    const data = await httpJson<GooglePlace>(
      `${this.opts.placesUrl}/v1/places/${encodeURIComponent(id)}`,
      { headers },
      this.ctx(),
    );
    return googleToPlace(data);
  }

  private postHeaders(fieldMask: string): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-Goog-FieldMask": fieldMask };
    if (this.opts.apiKey) headers["X-Goog-Api-Key"] = this.opts.apiKey;
    if (this.opts.oauthToken) headers["Authorization"] = `Bearer ${this.opts.oauthToken}`;
    return headers;
  }

  private ctx() {
    return { providerId: "google", fetchImpl: this.opts.fetchImpl };
  }
}

class GoogleStaticMap implements StaticMapService {
  constructor(private readonly opts: ResolvedGoogleOptions) {}

  staticMap(request: StaticMapRequest): StaticMapResult {
    const url = new URL(`${this.opts.staticUrl}/maps/api/staticmap`);
    if (request.center) url.searchParams.set("center", `${request.center.lat},${request.center.lng}`);
    if (request.zoom != null) url.searchParams.set("zoom", String(request.zoom));
    url.searchParams.set("size", `${request.width}x${request.height}`);
    if (request.scale) url.searchParams.set("scale", String(request.scale));
    if (request.format) url.searchParams.set("format", request.format);
    for (const m of request.markers) {
      const prefix = `${m.color ? `color:${m.color}|` : ""}${m.label ? `label:${m.label}|` : ""}`;
      url.searchParams.append("markers", `${prefix}${m.location.lat},${m.location.lng}`);
    }
    if (request.path?.length) {
      url.searchParams.set("path", request.path.map((p) => `${p.lat},${p.lng}`).join("|"));
    }
    if (this.opts.apiKey) url.searchParams.set("key", this.opts.apiKey);
    return { url: url.toString(), width: request.width, height: request.height, attribution: GOOGLE_ATTRIBUTION };
  }
}

/**
 * Google Maps Platform provider. Exposes geocoding, routing (Routes API),
 * places (Places API New) and static maps. Basemap tiles are SDK-locked to the
 * Maps JS API, so there is no `tiles` capability here — the render façade's
 * GoogleEngine handles interactive Google basemaps.
 */
export function createGoogleProvider(options: GoogleProviderOptions = {}): Provider {
  const opts = resolveGoogleOptions(options);
  return {
    id: "google",
    attribution: GOOGLE_ATTRIBUTION,
    geocoding: new GoogleGeocoding(opts),
    routing: new GoogleRouting(opts),
    places: new GooglePlaces(opts),
    staticmap: new GoogleStaticMap(opts),
  };
}
