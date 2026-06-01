import { encodePolyline, type LatLngTuple } from "@unimap/core";

/** Canonical place used across every provider's mock responses. */
export const GEO = {
  lat: 37.4224,
  lng: -122.0841,
  formatted: "1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA",
  streetNumber: "1600",
  street: "Amphitheatre Parkway",
  locality: "Mountain View",
  county: "Santa Clara County",
  region: "California",
  regionCode: "CA",
  postalCode: "94043",
  country: "United States",
  countryCode: "US",
  bbox: { south: 37.4215, north: 37.4235, west: -122.0855, east: -122.0825 },
};

export const DEST = { lat: 37.7749, lng: -122.4194 };

/** A canonical multi-point route (Mountain View → San Francisco-ish). */
export const ROUTE_PATH: LatLngTuple[] = [
  [GEO.lat, GEO.lng],
  [37.5, -122.2],
  [DEST.lat, DEST.lng],
];

export const ROUTE = {
  distanceMeters: 49_000,
  durationSeconds: 3_000,
  polyline: encodePolyline(ROUTE_PATH),
};

export const POI = {
  id: "ChIJ2eUgeAK6j4ARbn5u_wAGqWA",
  name: "Googleplex",
  lat: 37.422,
  lng: -122.0841,
  category: "office",
  rating: 4.5,
  phone: "+1 650-253-0000",
  website: "https://www.google.com",
};

/** A 1×1 transparent PNG, served by the mock tile / static-map endpoints. */
export const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Parse an OSRM `sources`/`destinations` index list ("all" or "0;2;3"). */
export function parseIndices(value: string | undefined, total: number): number[] {
  if (!value || value === "all") return Array.from({ length: total }, (_, i) => i);
  return value.split(";").map((n) => Number(n));
}
