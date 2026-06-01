export interface OsmProviderOptions {
  /** Nominatim base, default https://nominatim.openstreetmap.org */
  nominatimUrl?: string;
  /** OSRM base, default https://router.project-osrm.org */
  osrmUrl?: string;
  /** Photon base, default https://photon.komoot.io */
  photonUrl?: string;
  /** Overpass base, default https://overpass-api.de/api */
  overpassUrl?: string;
  /** Raster tile XYZ template, default OSM standard tiles. */
  tileUrl?: string;
  /** Identifies your app — required by the OSM/Nominatim usage policies. */
  userAgent?: string;
  /** Injectable fetch for tests / non-global environments. */
  fetchImpl?: typeof fetch;
}

export interface ResolvedOsmOptions {
  nominatimUrl: string;
  osrmUrl: string;
  photonUrl: string;
  overpassUrl: string;
  tileUrl: string;
  userAgent: string;
  fetchImpl?: typeof fetch;
}

const trimSlash = (s: string): string => s.replace(/\/+$/, "");

export function resolveOsmOptions(options: OsmProviderOptions = {}): ResolvedOsmOptions {
  return {
    nominatimUrl: trimSlash(options.nominatimUrl ?? "https://nominatim.openstreetmap.org"),
    osrmUrl: trimSlash(options.osrmUrl ?? "https://router.project-osrm.org"),
    photonUrl: trimSlash(options.photonUrl ?? "https://photon.komoot.io"),
    overpassUrl: trimSlash(options.overpassUrl ?? "https://overpass-api.de/api"),
    tileUrl: options.tileUrl ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    userAgent: options.userAgent ?? "unimap/0.1 (+https://github.com/unimap)",
    fetchImpl: options.fetchImpl,
  };
}
