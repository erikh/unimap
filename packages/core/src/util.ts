import type { BoundingBox, LatLng, LatLngTuple } from "./model";

// ---------------------------------------------------------------------------
// Encoded Polyline Algorithm Format.
// Clean-room implementation of the publicly documented algorithm (used by both
// Google Directions and OSRM). Algorithms are not copyrightable; this code is
// our own and AGPL-licensed.
// ---------------------------------------------------------------------------

export function decodePolyline(encoded: string, precision = 5): LatLngTuple[] {
  const factor = Math.pow(10, precision);
  const coordinates: LatLngTuple[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 1;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

export function encodePolyline(coordinates: LatLngTuple[], precision = 5): string {
  const factor = Math.pow(10, precision);
  let output = "";
  let prevLat = 0;
  let prevLng = 0;

  const encode = (current: number, previous: number): string => {
    let value = (Math.round(current * factor) - Math.round(previous * factor)) << 1;
    if (value < 0) value = ~value;
    let chunk = "";
    while (value >= 0x20) {
      chunk += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>= 5;
    }
    chunk += String.fromCharCode(value + 63);
    return chunk;
  };

  for (const [lat, lng] of coordinates) {
    output += encode(lat, prevLat);
    output += encode(lng, prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return output;
}

export function polylineToLatLngs(encoded: string, precision = 5): LatLng[] {
  return decodePolyline(encoded, precision).map(([lat, lng]) => ({ lat, lng }));
}

export function latLngsToPolyline(points: LatLng[], precision = 5): string {
  return encodePolyline(
    points.map((p): LatLngTuple => [p.lat, p.lng]),
    precision,
  );
}

// ---------------------------------------------------------------------------
// Geo helpers
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6_371_008.8;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in metres between two coordinates. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Smallest bounding box containing all the given points. */
export function boundsFromPoints(points: LatLng[]): BoundingBox {
  const first = points[0];
  if (!first) throw new Error("boundsFromPoints requires at least one point");
  let south = first.lat;
  let north = first.lat;
  let west = first.lng;
  let east = first.lng;
  for (const { lat, lng } of points) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
  }
  return { south, west, north, east };
}
