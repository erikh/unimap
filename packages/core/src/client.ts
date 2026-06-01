import type { Capability, Provider } from "./services";
import { CAPABILITIES } from "./services";
import type {
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
} from "./model";
import { NotSupportedError, ProviderError } from "./errors";

export interface FallbackInfo {
  capability: Capability;
  providerId: string;
  error: unknown;
}

export interface MapsClientConfig {
  providers: Provider[];
  /**
   * Ordered provider-id fallback chains per capability. When omitted for a
   * capability, the order falls back to provider declaration order.
   */
  order?: Partial<Record<Capability, string[]>>;
  /** Invoked when a provider throws and the client moves to the next one. */
  onFallback?: (info: FallbackInfo) => void;
}

/**
 * The unified, provider-agnostic facade. Routes each capability to the first
 * configured provider that supports it, falling back to the next on error.
 * This is the single object an application programs against.
 */
export class MapsClient {
  readonly providers: Map<string, Provider>;
  private readonly order: Partial<Record<Capability, string[]>>;
  private readonly onFallback?: (info: FallbackInfo) => void;

  constructor(config: MapsClientConfig) {
    if (config.providers.length === 0) {
      throw new ProviderError("MapsClient requires at least one provider");
    }
    this.providers = new Map(config.providers.map((p) => [p.id, p]));
    this.order = config.order ?? {};
    this.onFallback = config.onFallback;
  }

  /** Ordered list of providers that support `capability`. */
  private chain(capability: Capability): Provider[] {
    const ids = this.order[capability] ?? [...this.providers.keys()];
    const chain: Provider[] = [];
    for (const id of ids) {
      const provider = this.providers.get(id);
      if (provider && provider[capability] != null) chain.push(provider);
    }
    return chain;
  }

  private async run<T>(capability: Capability, fn: (provider: Provider) => Promise<T> | T): Promise<T> {
    const chain = this.chain(capability);
    if (chain.length === 0) {
      throw new NotSupportedError(`No configured provider supports capability "${capability}"`);
    }
    let lastError: unknown;
    for (const provider of chain) {
      try {
        return await fn(provider);
      } catch (error) {
        lastError = error;
        this.onFallback?.({ capability, providerId: provider.id, error });
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ProviderError(`All providers failed for capability "${capability}"`);
  }

  geocode(query: GeocodeQuery): Promise<GeocodeResult[]> {
    return this.run("geocoding", (p) => p.geocoding!.geocode(query));
  }
  reverseGeocode(query: ReverseGeocodeQuery): Promise<GeocodeResult[]> {
    return this.run("geocoding", (p) => p.geocoding!.reverseGeocode(query));
  }
  route(request: RouteRequest): Promise<RouteResult> {
    return this.run("routing", (p) => p.routing!.route(request));
  }
  matrix(request: MatrixRequest): Promise<Matrix> {
    return this.run("routing", (p) => p.routing!.matrix(request));
  }
  search(request: PlaceSearchRequest): Promise<Place[]> {
    return this.run("places", (p) => p.places!.search(request));
  }
  autocomplete(request: AutocompleteRequest): Promise<Suggestion[]> {
    return this.run("places", (p) => p.places!.autocomplete(request));
  }
  details(request: PlaceDetailsRequest): Promise<Place> {
    return this.run("places", (p) => p.places!.details(request));
  }
  staticMap(request: StaticMapRequest): Promise<StaticMapResult> {
    return this.run("staticmap", (p) => Promise.resolve(p.staticmap!.staticMap(request)));
  }
  tileSource(): Promise<TileSource> {
    return this.run("tiles", (p) => Promise.resolve(p.tiles!.tileSource()));
  }

  /** Map of capability → ordered ids of providers that can serve it. */
  capabilities(): Record<Capability, string[]> {
    const out = {} as Record<Capability, string[]>;
    for (const capability of CAPABILITIES) {
      out[capability] = this.chain(capability).map((p) => p.id);
    }
    return out;
  }
}
