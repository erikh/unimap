import {
  NotSupportedError,
  decodePolyline,
  encodePolyline,
  haversineMeters,
  type Address,
  type AddressComponent,
  type Attribution,
  type GeocodeResult,
  type LatLngTuple,
  type Leg,
  type LegMode,
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

// --- MOTIS transit (the public Transitous engine) ----------------------------

export interface MotisPlace {
  name?: string;
  stopId?: string;
  lat: number;
  lon: number;
  departure?: string;
  arrival?: string;
}
export interface MotisLegGeometry {
  points: string;
  length?: number;
  precision?: number;
}
export interface MotisLeg {
  mode: string;
  from?: MotisPlace;
  to?: MotisPlace;
  duration?: number;
  startTime?: string;
  endTime?: string;
  distance?: number;
  headsign?: string;
  routeShortName?: string;
  routeLongName?: string;
  routeColor?: string;
  agencyName?: string;
  tripId?: string;
  intermediateStops?: MotisPlace[];
  legGeometry?: MotisLegGeometry;
}
export interface MotisItinerary {
  duration?: number;
  startTime?: string;
  endTime?: string;
  transfers?: number;
  legs?: MotisLeg[];
}
export interface MotisPlanResponse {
  itineraries?: MotisItinerary[];
}

/** MOTIS surfaces many GTFS vehicle types; fold them onto our neutral leg modes. */
const MOTIS_MODE_TO_LEG: Record<string, LegMode> = {
  WALK: "WALK",
  BIKE: "BICYCLE",
  BICYCLE: "BICYCLE",
  CAR: "DRIVE",
  BUS: "BUS",
  COACH: "BUS",
  TRAM: "TRAM",
  STREETCAR: "TRAM",
  SUBWAY: "SUBWAY",
  METRO: "SUBWAY",
  FERRY: "FERRY",
  RAIL: "RAIL",
  SUBURBAN: "RAIL",
  REGIONAL_RAIL: "RAIL",
  REGIONAL_FAST_RAIL: "RAIL",
  HIGHSPEED_RAIL: "RAIL",
  LONG_DISTANCE: "RAIL",
  NIGHT_RAIL: "RAIL",
};

export function motisModeToLegMode(mode: string): LegMode {
  return MOTIS_MODE_TO_LEG[mode.toUpperCase()] ?? "OTHER";
}

const isTransitLeg = (mode: LegMode): boolean =>
  mode !== "WALK" && mode !== "BICYCLE" && mode !== "DRIVE";

function pathLengthMeters(points: LatLngTuple[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += haversineMeters({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
  }
  return total;
}

/**
 * The ordered transit-line signature of an itinerary — its sequence of
 * `mode:line` for non-walk legs (e.g. "BUS:72>SUBWAY:Red"). Walk legs and times
 * are ignored, so two departures of the same trip share a signature.
 */
function itinerarySignature(it: MotisItinerary): string {
  return (it.legs ?? [])
    .filter((l) => l.mode && l.mode.toUpperCase() !== "WALK")
    .map((l) => `${l.mode}:${l.routeShortName ?? ""}`)
    .join(">");
}

/**
 * Collapse near-identical itineraries — same line/mode signature, differing only
 * by departure time — keeping the fastest of each, sorted fastest-first and
 * capped. Generic: no mode/region constants, so it behaves the same anywhere
 * (e.g. five "bus 72" departures → one; a distinct train option stays a peer).
 */
export function dedupeItineraries(itineraries: MotisItinerary[], cap = 6): MotisItinerary[] {
  const best = new Map<string, MotisItinerary>();
  for (const it of itineraries) {
    const sig = itinerarySignature(it);
    const seen = best.get(sig);
    if (!seen || (it.duration ?? Infinity) < (seen.duration ?? Infinity)) best.set(sig, it);
  }
  return [...best.values()].sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0)).slice(0, cap);
}

/** Map one MOTIS itinerary onto a canonical multimodal Route. */
export function motisToRoute(itinerary: MotisItinerary): Route {
  const motisLegs = itinerary.legs ?? [];
  const legPoints = motisLegs.map((leg) =>
    leg.legGeometry?.points ? decodePolyline(leg.legGeometry.points, leg.legGeometry.precision ?? 5) : [],
  );

  const legs: Leg[] = motisLegs.map((leg, i) => {
    const points = legPoints[i]!;
    const mode = motisModeToLegMode(leg.mode);
    // MOTIS omits leg distance — derive it from the decoded geometry.
    const distanceMeters = leg.distance ?? pathLengthMeters(points);
    return {
      distanceMeters,
      durationSeconds: leg.duration ?? 0,
      start: leg.from ? { lat: leg.from.lat, lng: leg.from.lon } : undefined,
      end: leg.to ? { lat: leg.to.lat, lng: leg.to.lon } : undefined,
      mode,
      transit: isTransitLeg(mode)
        ? {
            line: leg.routeShortName || undefined,
            lineName: leg.routeLongName || undefined,
            headsign: leg.headsign || undefined,
            agency: leg.agencyName || undefined,
            color: leg.routeColor || undefined,
            departureTime: leg.startTime,
            arrivalTime: leg.endTime,
            fromStop: leg.from?.name,
            toStop: leg.to?.name,
            numStops: leg.intermediateStops?.length,
          }
        : undefined,
      polyline: points.length ? encodePolyline(points) : undefined,
      steps: [],
    };
  });

  const allPoints = legPoints.flat();
  const distanceMeters = legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
  const durationSeconds =
    itinerary.duration ?? legs.reduce((sum, leg) => sum + leg.durationSeconds, 0);

  return {
    distanceMeters,
    durationSeconds,
    polyline: allPoints.length ? encodePolyline(allPoints) : undefined,
    legs,
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
