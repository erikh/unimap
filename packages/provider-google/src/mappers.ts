import {
  type Address,
  type AddressComponent,
  type Attribution,
  type GeocodeResult,
  type Place,
  type Route,
  type Suggestion,
  type TravelMode,
} from "@unimap/core";

export const GOOGLE_ATTRIBUTION: Attribution = {
  provider: "google",
  text: "Powered by Google",
  url: "https://www.google.com/maps",
};

// --- Upstream shapes ----------------------------------------------------------

export interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}
export interface GoogleGeocodeItem {
  formatted_address: string;
  geometry: {
    location: { lat: number; lng: number };
    location_type?: string;
    viewport?: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } };
  };
  place_id?: string;
  types?: string[];
  address_components: GoogleAddressComponent[];
}
export interface GoogleGeocodeResponse {
  status: string;
  results?: GoogleGeocodeItem[];
  error_message?: string;
}

export interface GoogleRouteStep {
  distanceMeters?: number;
  staticDuration?: string;
  duration?: string;
  polyline?: { encodedPolyline?: string };
  navigationInstruction?: { maneuver?: string; instructions?: string };
}
export interface GoogleRouteLeg {
  distanceMeters?: number;
  duration?: string;
  polyline?: { encodedPolyline?: string };
  steps?: GoogleRouteStep[];
}
export interface GoogleRoute {
  distanceMeters?: number;
  duration?: string;
  polyline?: { encodedPolyline?: string };
  legs?: GoogleRouteLeg[];
}
export interface GoogleComputeRoutesResponse {
  routes?: GoogleRoute[];
}
export interface GoogleMatrixCell {
  originIndex: number;
  destinationIndex: number;
  distanceMeters?: number;
  duration?: string;
  condition?: string;
}

export interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  rating?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
}
export interface GoogleSearchResponse {
  places?: GooglePlace[];
}
export interface GoogleAutocompleteResponse {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }[];
}

// --- Helpers ------------------------------------------------------------------

/** "900s" -> 900. Google encodes durations as a seconds string. */
export function parseGoogleDuration(value: string | undefined): number {
  if (!value) return 0;
  return Number.parseFloat(value.replace(/s$/, "")) || 0;
}

const LOCATION_TYPE_CONFIDENCE: Record<string, number> = {
  ROOFTOP: 1,
  RANGE_INTERPOLATED: 0.8,
  GEOMETRIC_CENTER: 0.6,
  APPROXIMATE: 0.4,
};

const COMPONENT_KIND: Record<string, AddressComponent["kind"]> = {
  street_number: "streetNumber",
  route: "street",
  locality: "locality",
  postal_town: "locality",
  sublocality: "subLocality",
  neighborhood: "subLocality",
  administrative_area_level_2: "subRegion",
  administrative_area_level_1: "region",
  country: "country",
  postal_code: "postalCode",
};

function googleAddress(item: GoogleGeocodeItem): Address {
  const find = (type: string): GoogleAddressComponent | undefined =>
    item.address_components.find((c) => c.types.includes(type));
  const components: AddressComponent[] = [];
  for (const c of item.address_components) {
    const kind = c.types.map((t) => COMPONENT_KIND[t]).find((k): k is AddressComponent["kind"] => Boolean(k));
    if (kind) {
      components.push(
        c.short_name !== c.long_name
          ? { kind, value: c.long_name, code: c.short_name }
          : { kind, value: c.long_name },
      );
    }
  }
  const country = find("country");
  return {
    formatted: item.formatted_address,
    country: country?.long_name,
    countryCode: country?.short_name,
    region: find("administrative_area_level_1")?.long_name,
    subRegion: find("administrative_area_level_2")?.long_name,
    locality: (find("locality") ?? find("postal_town"))?.long_name,
    subLocality: (find("sublocality") ?? find("neighborhood"))?.long_name,
    postalCode: find("postal_code")?.long_name,
    street: find("route")?.long_name,
    streetNumber: find("street_number")?.long_name,
    components,
  };
}

export function googleToGeocode(item: GoogleGeocodeItem): GeocodeResult {
  const vp = item.geometry.viewport;
  return {
    location: { lat: item.geometry.location.lat, lng: item.geometry.location.lng },
    address: googleAddress(item),
    bounds: vp
      ? { south: vp.southwest.lat, west: vp.southwest.lng, north: vp.northeast.lat, east: vp.northeast.lng }
      : undefined,
    confidence: item.geometry.location_type ? LOCATION_TYPE_CONFIDENCE[item.geometry.location_type] : undefined,
    placeId: item.place_id ? `google:${item.place_id}` : undefined,
    attribution: GOOGLE_ATTRIBUTION,
  };
}

export function googleToRoute(route: GoogleRoute): Route {
  return {
    distanceMeters: route.distanceMeters ?? 0,
    durationSeconds: parseGoogleDuration(route.duration),
    polyline: route.polyline?.encodedPolyline,
    legs: (route.legs ?? []).map((leg) => ({
      distanceMeters: leg.distanceMeters ?? 0,
      durationSeconds: parseGoogleDuration(leg.duration),
      steps: (leg.steps ?? []).map((step) => ({
        distanceMeters: step.distanceMeters ?? 0,
        durationSeconds: parseGoogleDuration(step.staticDuration ?? step.duration),
        polyline: step.polyline?.encodedPolyline,
        maneuver: step.navigationInstruction
          ? { type: step.navigationInstruction.maneuver, instruction: step.navigationInstruction.instructions }
          : undefined,
      })),
    })),
    warnings: [],
    attribution: GOOGLE_ATTRIBUTION,
  };
}

export function googleToPlace(place: GooglePlace): Place {
  return {
    id: `google:${place.id ?? ""}`,
    provider: "google",
    name: place.displayName?.text ?? "Unknown place",
    location: place.location ? { lat: place.location.latitude, lng: place.location.longitude } : undefined,
    address: place.formattedAddress ? { formatted: place.formattedAddress, components: [] } : undefined,
    categories: (place.types ?? []).map((t) => ({ id: t })),
    phone: place.nationalPhoneNumber,
    website: place.websiteUri,
    rating: place.rating,
    attribution: GOOGLE_ATTRIBUTION,
  };
}

export function googleToSuggestion(
  suggestion: NonNullable<GoogleAutocompleteResponse["suggestions"]>[number],
): Suggestion {
  const prediction = suggestion.placePrediction;
  return {
    text: prediction?.text?.text ?? prediction?.structuredFormat?.mainText?.text ?? "",
    placeId: prediction?.placeId ? `google:${prediction.placeId}` : undefined,
    kind: "place",
    attribution: GOOGLE_ATTRIBUTION,
  };
}

export function googleTravelMode(mode: TravelMode): string {
  // Google's Routes API uses the same identifiers as our neutral enum.
  return mode;
}
