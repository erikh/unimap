import { z, type ZodTypeAny } from "zod";
import {
  AuthError,
  GeocodeResultSchema,
  MatrixSchema,
  NotFoundError,
  NotSupportedError,
  PlaceSchema,
  ProviderError,
  QuotaError,
  RateLimitError,
  StaticMapResultSchema,
  SuggestionSchema,
  TileSourceSchema,
  RouteResultSchema,
  TravelModeSchema,
  ValidationError,
  type AutocompleteRequest,
  type Capability,
  type TravelMode,
  type GeocodeQuery,
  type GeocodeResult,
  type GeocodingService,
  type Matrix,
  type MatrixRequest,
  type Place,
  type PlaceDetailsRequest,
  type PlaceSearchRequest,
  type PlacesService,
  type ReverseGeocodeQuery,
  type RouteRequest,
  type RouteResult,
  type RoutingService,
  type StaticMapRequest,
  type StaticMapResult,
  type Suggestion,
  type TileSource,
} from "@unimap/core";

export interface UnimapClientOptions {
  /** Base URL of the UniMap proxy, e.g. https://maps.example.com */
  baseUrl: string;
  /** Pin a specific provider for every request (else the proxy's fallback order applies). */
  provider?: string;
  /** Extra headers (auth cookies/tokens to the proxy, request ids, …). */
  headers?: Record<string, string>;
  /** Validate responses against the shared schemas (default true). */
  validate?: boolean;
  fetchImpl?: typeof fetch;
}

/**
 * Tidy a free-typed place query before geocoding. Notably rewrites the
 * connector " in " to a comma ("801 Broadway in Oakland" → "801 Broadway,
 * Oakland") — Nominatim otherwise matches "in Oakland" against the *town named*
 * "Oakland City" (e.g. in Indiana) instead of the Oakland the user meant. Also
 * collapses repeated commas/whitespace. Idempotent; safe on already-clean input.
 */
export function normalizeGeocodeQuery(text: string): string {
  return text
    .replace(/\s+in\s+/gi, ", ")
    .replace(/\s*,\s*(?:,\s*)+/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
}

interface ProxyErrorBody {
  error?: { code?: string; message?: string };
}

function toError(status: number, body: unknown): Error {
  const error = (body as ProxyErrorBody | undefined)?.error;
  const message = error?.message ?? `Proxy returned HTTP ${status}`;
  switch (error?.code) {
    case "AUTH_ERROR":
      return new AuthError(message, { status });
    case "RATE_LIMITED":
      return new RateLimitError(message, { status });
    case "QUOTA_ERROR":
      return new QuotaError(message, { status });
    case "NOT_SUPPORTED":
      return new NotSupportedError(message, { status });
    case "NOT_FOUND":
      return new NotFoundError(message, { status });
    case "VALIDATION_ERROR":
      return new ValidationError(message, { status });
    default:
      return new ProviderError(message, { status });
  }
}

/**
 * The browser/Node services SDK (Component B). Mirrors the core service
 * interfaces, so application code written against MapsClient (server-side) ports
 * verbatim to the proxy-backed client. Never holds any provider credentials.
 */
export class UnimapClient implements GeocodingService, RoutingService, PlacesService {
  private readonly baseUrl: string;
  private readonly provider?: string;
  private readonly headers: Record<string, string>;
  private readonly validate: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(options: UnimapClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.provider = options.provider;
    this.headers = options.headers ?? {};
    this.validate = options.validate ?? true;
    // Bind to globalThis so the global fetch isn't invoked as a method of this
    // client instance — browsers throw "Illegal invocation" / "'fetch' called on
    // an object that does not implement interface Window" otherwise. (Node is lenient.)
    this.fetchImpl = (options.fetchImpl ?? fetch).bind(globalThis);
  }

  geocode(query: GeocodeQuery): Promise<GeocodeResult[]> {
    return this.send("POST", "/v1/geocode", z.array(GeocodeResultSchema), query);
  }
  reverseGeocode(query: ReverseGeocodeQuery): Promise<GeocodeResult[]> {
    return this.send("POST", "/v1/reverse-geocode", z.array(GeocodeResultSchema), query);
  }
  route(request: RouteRequest): Promise<RouteResult> {
    return this.send("POST", "/v1/route", RouteResultSchema, request);
  }
  matrix(request: MatrixRequest): Promise<Matrix> {
    return this.send("POST", "/v1/matrix", MatrixSchema, request);
  }
  search(request: PlaceSearchRequest): Promise<Place[]> {
    return this.send("POST", "/v1/places/search", z.array(PlaceSchema), request);
  }
  autocomplete(request: AutocompleteRequest): Promise<Suggestion[]> {
    return this.send("POST", "/v1/places/autocomplete", z.array(SuggestionSchema), request);
  }
  details(request: PlaceDetailsRequest): Promise<Place> {
    return this.send("POST", "/v1/places/details", PlaceSchema, request);
  }
  staticMap(request: StaticMapRequest): Promise<StaticMapResult> {
    return this.send("POST", "/v1/staticmap", StaticMapResultSchema, request);
  }
  tileSource(): Promise<TileSource> {
    return this.send("GET", "/v1/tiles", TileSourceSchema);
  }
  capabilities(): Promise<Record<Capability, string[]>> {
    return this.send("GET", "/v1/capabilities", z.record(z.array(z.string()))) as Promise<
      Record<Capability, string[]>
    >;
  }
  /** Travel modes at least one configured provider can serve. */
  routingModes(): Promise<TravelMode[]> {
    return this.send("GET", "/v1/routing-modes", z.array(TravelModeSchema));
  }

  private async send<S extends ZodTypeAny>(
    method: "GET" | "POST",
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<z.infer<S>> {
    const url = new URL(this.baseUrl + path);
    if (this.provider) url.searchParams.set("provider", this.provider);
    const init: RequestInit = { method, headers: { ...this.headers } };
    if (body !== undefined) {
      (init.headers as Record<string, string>)["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await this.fetchImpl(url, init);
    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      throw new ProviderError("Invalid JSON from proxy", { status: response.status });
    }
    if (!response.ok) throw toError(response.status, json);
    return this.validate ? (schema.parse(json) as z.infer<S>) : (json as z.infer<S>);
  }
}

export function createUnimapClient(options: UnimapClientOptions): UnimapClient {
  return new UnimapClient(options);
}
