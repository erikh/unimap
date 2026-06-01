import {
  NotSupportedError,
  type Address,
  type AddressComponent,
  type Attribution,
  type GeocodeResult,
  type Place,
  type Route,
  type Suggestion,
  type TravelMode,
} from "@unimap/core";

export const OSM_ATTRIBUTION: Attribution = {
  provider: "osm",
  text: "© OpenStreetMap contributors",
  url: "https://www.openstreetmap.org/copyright",
};

// --- Upstream response shapes -------------------------------------------------

export interface NominatimAddress {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
}

export interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
  boundingbox?: [string, string, string, string];
  importance?: number;
  osm_type?: string;
  osm_id?: number;
  place_id?: number;
  error?: string;
}

export interface OsrmManeuver {
  type?: string;
  modifier?: string;
  location?: [number, number];
}
export interface OsrmStep {
  distance: number;
  duration: number;
  geometry?: string;
  name?: string;
  maneuver?: OsrmManeuver;
}
export interface OsrmLeg {
  distance: number;
  duration: number;
  summary?: string;
  steps?: OsrmStep[];
}
export interface OsrmRoute {
  distance: number;
  duration: number;
  geometry?: string;
  legs?: OsrmLeg[];
}
export interface OsrmRouteResponse {
  code: string;
  routes?: OsrmRoute[];
}
export interface OsrmTableResponse {
  code: string;
  durations?: (number | null)[][];
  distances?: (number | null)[][];
}

export interface PhotonProps {
  osm_id?: number;
  osm_type?: string;
  osm_key?: string;
  osm_value?: string;
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  countrycode?: string;
}
export interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: PhotonProps;
}
export interface PhotonResponse {
  features?: PhotonFeature[];
}

// --- Helpers -----------------------------------------------------------------

const TYPE_LETTER: Record<string, string> = { node: "N", way: "W", relation: "R" };

function osmRef(type: string | undefined, id: number | undefined): string | undefined {
  if (!type || id == null) return undefined;
  const letter = TYPE_LETTER[type] ?? type.charAt(0).toUpperCase();
  return `${letter}${id}`;
}

function push(components: AddressComponent[], kind: AddressComponent["kind"], value?: string, code?: string): void {
  if (value) components.push(code ? { kind, value, code } : { kind, value });
}

function nominatimAddress(item: NominatimItem): Address {
  const a = item.address ?? {};
  const locality = a.city ?? a.town ?? a.village;
  const components: AddressComponent[] = [];
  push(components, "streetNumber", a.house_number);
  push(components, "street", a.road);
  push(components, "subLocality", a.suburb ?? a.neighbourhood);
  push(components, "locality", locality);
  push(components, "subRegion", a.county);
  push(components, "region", a.state);
  push(components, "postalCode", a.postcode);
  push(components, "country", a.country, a.country_code?.toUpperCase());
  return {
    formatted: item.display_name,
    country: a.country,
    countryCode: a.country_code?.toUpperCase(),
    region: a.state,
    subRegion: a.county,
    locality,
    subLocality: a.suburb ?? a.neighbourhood,
    postalCode: a.postcode,
    street: a.road,
    streetNumber: a.house_number,
    components,
  };
}

export function nominatimToGeocode(item: NominatimItem): GeocodeResult {
  const bb = item.boundingbox;
  return {
    location: { lat: Number(item.lat), lng: Number(item.lon) },
    address: nominatimAddress(item),
    bounds: bb
      ? { south: Number(bb[0]), north: Number(bb[1]), west: Number(bb[2]), east: Number(bb[3]) }
      : undefined,
    confidence: item.importance != null ? Math.max(0, Math.min(1, item.importance)) : undefined,
    placeId: osmRef(item.osm_type, item.osm_id) ? `osm:${osmRef(item.osm_type, item.osm_id)}` : undefined,
    attribution: OSM_ATTRIBUTION,
  };
}

export function nominatimToPlace(item: NominatimItem, id: string): Place {
  const address = nominatimAddress(item);
  return {
    id,
    provider: "osm",
    name: address.street
      ? `${address.streetNumber ?? ""} ${address.street}`.trim()
      : item.display_name.split(",")[0]!,
    location: { lat: Number(item.lat), lng: Number(item.lon) },
    address,
    categories: [],
    attribution: OSM_ATTRIBUTION,
  };
}

function stepInstruction(step: OsrmStep): string | undefined {
  const type = step.maneuver?.type;
  if (!type) return undefined;
  return step.name ? `${type} onto ${step.name}` : type;
}

export function osrmToRoute(route: OsrmRoute): Route {
  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    polyline: route.geometry,
    legs: (route.legs ?? []).map((leg) => ({
      distanceMeters: leg.distance,
      durationSeconds: leg.duration,
      steps: (leg.steps ?? []).map((step) => ({
        distanceMeters: step.distance,
        durationSeconds: step.duration,
        polyline: step.geometry,
        maneuver: step.maneuver
          ? {
              type: step.maneuver.type,
              instruction: stepInstruction(step),
              location: step.maneuver.location
                ? { lat: step.maneuver.location[1], lng: step.maneuver.location[0] }
                : undefined,
            }
          : undefined,
      })),
    })),
    warnings: [],
    attribution: OSM_ATTRIBUTION,
  };
}

function photonName(f: PhotonFeature): string {
  const p = f.properties;
  return p.name ?? ([p.housenumber, p.street].filter(Boolean).join(" ") || p.city || "Unknown place");
}

function photonAddress(f: PhotonFeature): Address {
  const p = f.properties;
  const components: AddressComponent[] = [];
  push(components, "streetNumber", p.housenumber);
  push(components, "street", p.street);
  push(components, "locality", p.city);
  push(components, "region", p.state);
  push(components, "postalCode", p.postcode);
  push(components, "country", p.country, p.countrycode?.toUpperCase());
  return {
    formatted: [photonName(f), p.city, p.state, p.postcode, p.country].filter(Boolean).join(", "),
    country: p.country,
    countryCode: p.countrycode?.toUpperCase(),
    region: p.state,
    locality: p.city,
    postalCode: p.postcode,
    street: p.street,
    streetNumber: p.housenumber,
    components,
  };
}

export function photonToPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const ref = osmRef(p.osm_type, p.osm_id);
  const category =
    p.osm_key && p.osm_value ? [{ id: `${p.osm_key}:${p.osm_value}`, label: p.osm_value }] : [];
  return {
    id: ref ? `osm:${ref}` : `osm:${f.geometry.coordinates.join(",")}`,
    provider: "osm",
    name: photonName(f),
    location: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
    address: photonAddress(f),
    categories: category,
    attribution: OSM_ATTRIBUTION,
  };
}

export function photonToSuggestion(f: PhotonFeature): Suggestion {
  const ref = osmRef(f.properties.osm_type, f.properties.osm_id);
  return {
    text: photonAddress(f).formatted,
    placeId: ref ? `osm:${ref}` : undefined,
    location: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
    kind: "place",
    attribution: OSM_ATTRIBUTION,
  };
}

/** Map our neutral travel mode onto an OSRM profile. TRANSIT is unsupported. */
export function osrmProfile(mode: TravelMode): string {
  switch (mode) {
    case "DRIVE":
      return "driving";
    case "WALK":
      return "foot";
    case "BICYCLE":
      return "bike";
    case "TRANSIT":
      throw new NotSupportedError("OSRM does not support TRANSIT routing", { providerId: "osm" });
  }
}
