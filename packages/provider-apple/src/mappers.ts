import {
  encodePolyline,
  type Address,
  type AddressComponent,
  type Attribution,
  type GeocodeResult,
  type LatLngTuple,
  type Place,
  type Route,
  type RouteResult,
  type Step,
  type Suggestion,
  type TravelMode,
} from "@unimap/core";

export const APPLE_ATTRIBUTION: Attribution = {
  provider: "apple",
  text: "Data from Apple Maps",
  url: "https://www.apple.com/legal/internet-services/maps/terms-en.html",
};

export interface AppleStructuredAddress {
  administrativeArea?: string;
  administrativeAreaCode?: string;
  locality?: string;
  postCode?: string;
  subLocality?: string;
  thoroughfare?: string;
  subThoroughfare?: string;
  fullThoroughfare?: string;
  country?: string;
  countryCode?: string;
}

export interface AppleAddressable {
  name?: string;
  structuredAddress?: AppleStructuredAddress;
  formattedAddressLines?: string[];
  country?: string;
  countryCode?: string;
}

export interface AppleMapRegion {
  southLatitude: number;
  westLongitude: number;
  northLatitude: number;
  eastLongitude: number;
}

export interface AppleGeoResult extends AppleAddressable {
  coordinate: { latitude: number; longitude: number };
  displayMapRegion?: AppleMapRegion;
}
export interface AppleGeocodeResponse {
  results?: AppleGeoResult[];
}

export interface ApplePlace extends AppleAddressable {
  id?: string;
  coordinate: { latitude: number; longitude: number };
  poiCategory?: string;
}
export interface AppleSearchResponse {
  results?: ApplePlace[];
}

export interface AppleAutocompleteResult {
  completionUrl?: string;
  displayLines?: string[];
  location?: { latitude: number; longitude: number };
}
export interface AppleAutocompleteResponse {
  results?: AppleAutocompleteResult[];
}

export interface AppleDirRoute {
  name?: string;
  distanceMeters: number;
  durationSeconds: number;
  transportType?: string;
  hasTolls?: boolean;
  stepIndexes?: number[];
}
export interface AppleDirStep {
  stepPathIndex: number;
  distanceMeters: number;
  durationSeconds: number;
  instructions?: string;
}
export interface AppleDirResponse {
  routes?: AppleDirRoute[];
  steps?: AppleDirStep[];
  stepPaths?: { latitude: number; longitude: number }[][];
}

export interface AppleEta {
  destination: { latitude: number; longitude: number };
  distanceMeters: number;
  expectedTravelTimeSeconds: number;
  staticTravelTimeSeconds?: number;
}
export interface AppleEtasResponse {
  etas?: AppleEta[];
}

// --- mapping ------------------------------------------------------------------

function push(components: AddressComponent[], kind: AddressComponent["kind"], value?: string, code?: string): void {
  if (value) components.push(code ? { kind, value, code } : { kind, value });
}

function appleAddress(item: AppleAddressable): Address {
  const s = item.structuredAddress ?? {};
  const components: AddressComponent[] = [];
  push(components, "streetNumber", s.subThoroughfare);
  push(components, "street", s.thoroughfare);
  push(components, "subLocality", s.subLocality || undefined);
  push(components, "locality", s.locality);
  push(components, "region", s.administrativeArea, s.administrativeAreaCode);
  push(components, "postalCode", s.postCode);
  push(components, "country", s.country ?? item.country, s.countryCode ?? item.countryCode);
  return {
    formatted: item.formattedAddressLines?.join(", ") ?? item.name ?? "",
    country: s.country ?? item.country,
    countryCode: s.countryCode ?? item.countryCode,
    region: s.administrativeArea,
    locality: s.locality,
    subLocality: s.subLocality || undefined,
    postalCode: s.postCode,
    street: s.thoroughfare,
    streetNumber: s.subThoroughfare,
    components,
  };
}

export function appleToGeocode(item: AppleGeoResult): GeocodeResult {
  const r = item.displayMapRegion;
  return {
    location: { lat: item.coordinate.latitude, lng: item.coordinate.longitude },
    address: appleAddress(item),
    bounds: r
      ? { south: r.southLatitude, west: r.westLongitude, north: r.northLatitude, east: r.eastLongitude }
      : undefined,
    attribution: APPLE_ATTRIBUTION,
  };
}

export function appleToPlace(place: ApplePlace): Place {
  return {
    id: `apple:${place.id ?? place.name ?? ""}`,
    provider: "apple",
    name: place.name ?? "Unknown place",
    location: { lat: place.coordinate.latitude, lng: place.coordinate.longitude },
    address: appleAddress(place),
    categories: place.poiCategory ? [{ id: place.poiCategory }] : [],
    attribution: APPLE_ATTRIBUTION,
  };
}

export function appleToSuggestion(result: AppleAutocompleteResult): Suggestion {
  return {
    text: result.displayLines?.join(", ") ?? "",
    location: result.location
      ? { lat: result.location.latitude, lng: result.location.longitude }
      : undefined,
    kind: "place",
    attribution: APPLE_ATTRIBUTION,
  };
}

function concatPaths(paths: { latitude: number; longitude: number }[][]): LatLngTuple[] {
  const points: LatLngTuple[] = [];
  for (const path of paths) {
    for (const p of path) {
      const last = points[points.length - 1];
      if (!last || last[0] !== p.latitude || last[1] !== p.longitude) {
        points.push([p.latitude, p.longitude]);
      }
    }
  }
  return points;
}

export function appleToRouteResult(response: AppleDirResponse): RouteResult {
  const steps = response.steps ?? [];
  const stepPaths = response.stepPaths ?? [];
  const routes: Route[] = (response.routes ?? []).map((route) => {
    const indexes = route.stepIndexes ?? steps.map((_, i) => i);
    const routeSteps: Step[] = [];
    const pathGroups: { latitude: number; longitude: number }[][] = [];
    for (const idx of indexes) {
      const step = steps[idx];
      if (!step) continue;
      const path = stepPaths[step.stepPathIndex] ?? [];
      pathGroups.push(path);
      routeSteps.push({
        distanceMeters: step.distanceMeters,
        durationSeconds: step.durationSeconds,
        polyline: path.length ? encodePolyline(path.map((p): LatLngTuple => [p.latitude, p.longitude])) : undefined,
        maneuver: step.instructions ? { instruction: step.instructions } : undefined,
      });
    }
    const overview = concatPaths(pathGroups);
    return {
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      polyline: overview.length ? encodePolyline(overview) : undefined,
      legs: [{ distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, steps: routeSteps }],
      warnings: route.hasTolls ? ["Route includes tolls"] : [],
      attribution: APPLE_ATTRIBUTION,
    };
  });
  return { routes, attribution: APPLE_ATTRIBUTION };
}

export function appleTransportType(mode: TravelMode): string {
  switch (mode) {
    case "DRIVE":
      return "Automobile";
    case "WALK":
      return "Walking";
    case "BICYCLE":
      return "Cycling";
    case "TRANSIT":
      return "Transit";
  }
}
