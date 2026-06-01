import { z } from "zod";
import { LatLngSchema, BoundingBoxSchema } from "./geo";
import { TravelModeSchema } from "./route";

export const GeocodeQuerySchema = z.object({
  query: z.string().min(1),
  language: z.string().optional(),
  /** Region bias, e.g. an ISO country code. */
  region: z.string().optional(),
  /** Bias results toward this box. */
  bounds: BoundingBoxSchema.optional(),
  limit: z.number().int().positive().max(50).optional(),
});
export type GeocodeQuery = z.infer<typeof GeocodeQuerySchema>;

export const ReverseGeocodeQuerySchema = z.object({
  location: LatLngSchema,
  language: z.string().optional(),
  limit: z.number().int().positive().max(50).optional(),
});
export type ReverseGeocodeQuery = z.infer<typeof ReverseGeocodeQuerySchema>;

export const RouteAvoidSchema = z.enum(["tolls", "highways", "ferries"]);

export const RouteRequestSchema = z.object({
  origin: LatLngSchema,
  destination: LatLngSchema,
  waypoints: z.array(LatLngSchema).default([]),
  travelMode: TravelModeSchema.default("DRIVE"),
  alternatives: z.boolean().default(false),
  avoid: z.array(RouteAvoidSchema).default([]),
  /** ISO-8601 departure time for traffic-aware routing. */
  departureTime: z.string().datetime().optional(),
  language: z.string().optional(),
  units: z.enum(["METRIC", "IMPERIAL"]).optional(),
});
export type RouteRequest = z.infer<typeof RouteRequestSchema>;

export const MatrixRequestSchema = z.object({
  origins: z.array(LatLngSchema).min(1),
  destinations: z.array(LatLngSchema).min(1),
  travelMode: TravelModeSchema.default("DRIVE"),
});
export type MatrixRequest = z.infer<typeof MatrixRequestSchema>;

export const PlaceSearchRequestSchema = z.object({
  query: z.string().optional(),
  location: LatLngSchema.optional(),
  radiusMeters: z.number().positive().optional(),
  categories: z.array(z.string()).default([]),
  limit: z.number().int().positive().max(50).optional(),
  language: z.string().optional(),
});
export type PlaceSearchRequest = z.infer<typeof PlaceSearchRequestSchema>;

export const AutocompleteRequestSchema = z.object({
  input: z.string().min(1),
  location: LatLngSchema.optional(),
  language: z.string().optional(),
  limit: z.number().int().positive().max(20).optional(),
});
export type AutocompleteRequest = z.infer<typeof AutocompleteRequestSchema>;

export const PlaceDetailsRequestSchema = z.object({
  id: z.string().min(1),
  language: z.string().optional(),
});
export type PlaceDetailsRequest = z.infer<typeof PlaceDetailsRequestSchema>;

export const StaticMarkerSchema = z.object({
  location: LatLngSchema,
  label: z.string().optional(),
  color: z.string().optional(),
});
export type StaticMarker = z.infer<typeof StaticMarkerSchema>;

export const StaticMapRequestSchema = z.object({
  center: LatLngSchema.optional(),
  zoom: z.number().min(0).max(22).optional(),
  width: z.number().int().positive().max(2048),
  height: z.number().int().positive().max(2048),
  scale: z.union([z.literal(1), z.literal(2)]).optional(),
  markers: z.array(StaticMarkerSchema).default([]),
  path: z.array(LatLngSchema).optional(),
  format: z.enum(["png", "jpg"]).optional(),
});
export type StaticMapRequest = z.infer<typeof StaticMapRequestSchema>;
