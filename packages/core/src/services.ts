import type {
  Attribution,
  AutocompleteRequest,
  GeocodeQuery,
  GeocodeResult,
  Matrix,
  MatrixRequest,
  Place,
  PlaceDetailsRequest,
  PlaceSearchRequest,
  ReverseGeocodeQuery,
  RouteRequest,
  RouteResult,
  StaticMapRequest,
  StaticMapResult,
  Suggestion,
  TileSource,
  TravelMode,
} from "./model";

/** Address ⇄ coordinates. */
export interface GeocodingService {
  geocode(query: GeocodeQuery): Promise<GeocodeResult[]>;
  reverseGeocode(query: ReverseGeocodeQuery): Promise<GeocodeResult[]>;
}

/** Directions and travel matrices. */
export interface RoutingService {
  route(request: RouteRequest): Promise<RouteResult>;
  matrix(request: MatrixRequest): Promise<Matrix>;
  /**
   * Travel modes this provider can serve. When omitted, the provider is
   * assumed to support every mode. The client uses this to skip providers
   * that cannot satisfy a requested mode (e.g. OSRM has no TRANSIT engine).
   */
  readonly travelModes?: readonly TravelMode[];
}

/** Place search, autocomplete, and details. */
export interface PlacesService {
  search(request: PlaceSearchRequest): Promise<Place[]>;
  autocomplete(request: AutocompleteRequest): Promise<Suggestion[]>;
  details(request: PlaceDetailsRequest): Promise<Place>;
}

/** Static map image URLs. */
export interface StaticMapService {
  staticMap(request: StaticMapRequest): StaticMapResult | Promise<StaticMapResult>;
}

export interface TileOptions {
  /** Named style, e.g. "streets" | "satellite" | "dark". */
  style?: string;
  language?: string;
}

/** Basemap tile/style sources. */
export interface TileService {
  tileSource(options?: TileOptions): TileSource | Promise<TileSource>;
}

export const CAPABILITIES = ["geocoding", "routing", "places", "staticmap", "tiles"] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * A provider exposes any subset of capabilities. Presence of the property means
 * the capability is supported. Each adapter (Google/Apple/OSM/...) implements
 * this; the proxy and MapsClient program against it, never against a concrete
 * provider.
 */
export interface Provider {
  readonly id: string;
  readonly attribution: Attribution;
  readonly geocoding?: GeocodingService;
  readonly routing?: RoutingService;
  readonly places?: PlacesService;
  readonly staticmap?: StaticMapService;
  readonly tiles?: TileService;
}

export function providerSupports(provider: Provider, capability: Capability): boolean {
  return provider[capability] != null;
}
