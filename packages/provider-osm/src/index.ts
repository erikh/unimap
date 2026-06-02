import {
  httpJson,
  NotFoundError,
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
  type Suggestion,
  type AutocompleteRequest,
  type TileService,
  type TileSource,
} from "@unimap/core";
import { resolveOsmOptions, type OsmProviderOptions, type ResolvedOsmOptions } from "./options";
import {
  nominatimToGeocode,
  nominatimToPlace,
  osrmProfile,
  osrmToRoute,
  photonToPlace,
  photonToSuggestion,
  OSM_ATTRIBUTION,
  type NominatimItem,
  type OsrmRouteResponse,
  type OsrmTableResponse,
  type PhotonResponse,
} from "./mappers";

export * from "./options";
export {
  OSM_ATTRIBUTION,
  nominatimToGeocode,
  nominatimToPlace,
  osrmToRoute,
  photonToPlace,
} from "./mappers";

function headers(opts: ResolvedOsmOptions): Record<string, string> {
  return { "User-Agent": opts.userAgent, Accept: "application/json" };
}

class OsmGeocoding implements GeocodingService {
  constructor(private readonly opts: ResolvedOsmOptions) {}

  async geocode(query: GeocodeQuery): Promise<GeocodeResult[]> {
    const url = new URL(`${this.opts.nominatimUrl}/search`);
    url.searchParams.set("q", query.query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    if (query.limit) url.searchParams.set("limit", String(query.limit));
    if (query.language) url.searchParams.set("accept-language", query.language);
    if (query.region) url.searchParams.set("countrycodes", query.region);
    if (query.bounds) {
      const b = query.bounds;
      url.searchParams.set("viewbox", `${b.west},${b.north},${b.east},${b.south}`);
    }
    const items = await httpJson<NominatimItem[]>(url, { headers: headers(this.opts) }, this.ctx());
    return items.map(nominatimToGeocode);
  }

  async reverseGeocode(query: ReverseGeocodeQuery): Promise<GeocodeResult[]> {
    const url = new URL(`${this.opts.nominatimUrl}/reverse`);
    url.searchParams.set("lat", String(query.location.lat));
    url.searchParams.set("lon", String(query.location.lng));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    if (query.language) url.searchParams.set("accept-language", query.language);
    const item = await httpJson<NominatimItem>(url, { headers: headers(this.opts) }, this.ctx());
    if (item.error || !item.lat) return [];
    return [nominatimToGeocode(item)];
  }

  private ctx() {
    return { providerId: "osm", fetchImpl: this.opts.fetchImpl };
  }
}

class OsmRouting implements RoutingService {
  // OSRM has driving/foot/bike profiles only — no public-transit engine.
  readonly travelModes = ["DRIVE", "WALK", "BICYCLE"] as const;

  constructor(private readonly opts: ResolvedOsmOptions) {}

  async route(request: RouteRequest): Promise<RouteResult> {
    const profile = osrmProfile(request.travelMode);
    const points = [request.origin, ...request.waypoints, request.destination];
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = new URL(`${this.opts.osrmUrl}/route/v1/${profile}/${coords}`);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "polyline");
    url.searchParams.set("steps", "true");
    const data = await httpJson<OsrmRouteResponse>(url, { headers: headers(this.opts) }, this.ctx());
    if (data.code !== "Ok" || !data.routes?.length) {
      throw new NotFoundError("No route found", { providerId: "osm" });
    }
    return { routes: data.routes.map(osrmToRoute), attribution: OSM_ATTRIBUTION };
  }

  async matrix(request: MatrixRequest): Promise<Matrix> {
    const profile = osrmProfile(request.travelMode);
    const all = [...request.origins, ...request.destinations];
    const coords = all.map((p) => `${p.lng},${p.lat}`).join(";");
    const sources = request.origins.map((_, i) => i).join(";");
    const destinations = request.destinations.map((_, i) => request.origins.length + i).join(";");
    const url = new URL(`${this.opts.osrmUrl}/table/v1/${profile}/${coords}`);
    url.searchParams.set("sources", sources);
    url.searchParams.set("destinations", destinations);
    url.searchParams.set("annotations", "duration,distance");
    const data = await httpJson<OsrmTableResponse>(url, { headers: headers(this.opts) }, this.ctx());
    const durations = data.durations ?? [];
    const distances = data.distances ?? [];
    return {
      origins: request.origins,
      destinations: request.destinations,
      rows: request.origins.map((_, o) =>
        request.destinations.map((_, d): MatrixCell => {
          const duration = durations[o]?.[d];
          const distance = distances[o]?.[d];
          return {
            durationSeconds: duration ?? undefined,
            distanceMeters: distance ?? undefined,
            status: duration == null ? "NOT_FOUND" : "OK",
          };
        }),
      ),
      attribution: OSM_ATTRIBUTION,
    };
  }

  private ctx() {
    return { providerId: "osm", fetchImpl: this.opts.fetchImpl };
  }
}

class OsmPlaces implements PlacesService {
  constructor(private readonly opts: ResolvedOsmOptions) {}

  async search(request: PlaceSearchRequest): Promise<Place[]> {
    const url = new URL(`${this.opts.photonUrl}/api`);
    url.searchParams.set("q", request.query ?? "");
    if (request.location) {
      url.searchParams.set("lat", String(request.location.lat));
      url.searchParams.set("lon", String(request.location.lng));
    }
    if (request.limit) url.searchParams.set("limit", String(request.limit));
    if (request.language) url.searchParams.set("lang", request.language);
    const data = await httpJson<PhotonResponse>(url, { headers: headers(this.opts) }, this.ctx());
    return (data.features ?? []).map(photonToPlace);
  }

  async autocomplete(request: AutocompleteRequest): Promise<Suggestion[]> {
    const url = new URL(`${this.opts.photonUrl}/api`);
    url.searchParams.set("q", request.input);
    url.searchParams.set("limit", String(request.limit ?? 5));
    if (request.location) {
      url.searchParams.set("lat", String(request.location.lat));
      url.searchParams.set("lon", String(request.location.lng));
    }
    if (request.language) url.searchParams.set("lang", request.language);
    const data = await httpJson<PhotonResponse>(url, { headers: headers(this.opts) }, this.ctx());
    return (data.features ?? []).map(photonToSuggestion);
  }

  async details(request: PlaceDetailsRequest): Promise<Place> {
    const osmIds = request.id.replace(/^osm:/, "");
    const url = new URL(`${this.opts.nominatimUrl}/lookup`);
    url.searchParams.set("osm_ids", osmIds);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    const items = await httpJson<NominatimItem[]>(url, { headers: headers(this.opts) }, this.ctx());
    const item = items[0];
    if (!item) throw new NotFoundError(`No place for id ${request.id}`, { providerId: "osm" });
    return nominatimToPlace(item, request.id);
  }

  private ctx() {
    return { providerId: "osm", fetchImpl: this.opts.fetchImpl };
  }
}

class OsmTiles implements TileService {
  constructor(private readonly opts: ResolvedOsmOptions) {}
  tileSource(): TileSource {
    return {
      kind: "raster",
      url: this.opts.tileUrl,
      tileSize: 256,
      minZoom: 0,
      maxZoom: 19,
      attribution: OSM_ATTRIBUTION,
    };
  }
}

/**
 * OpenStreetMap provider. Exposes geocoding (Nominatim), routing (OSRM),
 * places (Photon + Nominatim lookup) and tiles. There is no official OSM
 * static-map API, so `staticmap` is intentionally absent.
 */
export function createOsmProvider(options: OsmProviderOptions = {}): Provider {
  const opts = resolveOsmOptions(options);
  return {
    id: "osm",
    attribution: OSM_ATTRIBUTION,
    geocoding: new OsmGeocoding(opts),
    routing: new OsmRouting(opts),
    places: new OsmPlaces(opts),
    tiles: new OsmTiles(opts),
  };
}
