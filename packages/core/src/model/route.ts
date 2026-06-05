import { z } from "zod";
import { LatLngSchema } from "./geo";
import { AttributionSchema } from "./attribution";

/** Neutral travel mode. Adapters map provider-specific modes onto these. */
export const TravelModeSchema = z.enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"]);
export type TravelMode = z.infer<typeof TravelModeSchema>;

/** All neutral travel modes, in canonical order. */
export const TRAVEL_MODES = TravelModeSchema.options;

export const ManeuverSchema = z.object({
  instruction: z.string().optional(),
  type: z.string().optional(),
  location: LatLngSchema.optional(),
});
export type Maneuver = z.infer<typeof ManeuverSchema>;

export const StepSchema = z.object({
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  /** Encoded polyline (precision 5) for this step. */
  polyline: z.string().optional(),
  maneuver: ManeuverSchema.optional(),
});
export type Step = z.infer<typeof StepSchema>;

/** Neutral per-leg travel mode. Transit engines surface many vehicle types; we
 * fold them onto this small set. A leg with no `mode` predates transit support. */
export const LegModeSchema = z.enum([
  "WALK",
  "BICYCLE",
  "DRIVE",
  "BUS",
  "TRAM",
  "SUBWAY",
  "RAIL",
  "FERRY",
  "OTHER",
]);
export type LegMode = z.infer<typeof LegModeSchema>;

/** Transit-specific detail for a public-transport leg (bus/train/etc.). Absent
 * on road legs. Times are ISO-8601 strings as reported by the transit engine. */
export const TransitLegSchema = z.object({
  /** Short public-facing line name, e.g. "S7", "M14". */
  line: z.string().optional(),
  /** Long route name, e.g. "Bakerloo line". */
  lineName: z.string().optional(),
  /** Destination sign on the vehicle. */
  headsign: z.string().optional(),
  /** Operating agency, e.g. "S-Bahn Berlin GmbH". */
  agency: z.string().optional(),
  /** Route colour as a hex string without `#`, e.g. "816da6". */
  color: z.string().optional(),
  departureTime: z.string().optional(),
  arrivalTime: z.string().optional(),
  /** Boarding stop name. */
  fromStop: z.string().optional(),
  /** Alighting stop name. */
  toStop: z.string().optional(),
  /** Number of intermediate stops between board and alight. */
  numStops: z.number().int().nonnegative().optional(),
});
export type TransitLeg = z.infer<typeof TransitLegSchema>;

export const LegSchema = z.object({
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  start: LatLngSchema.optional(),
  end: LatLngSchema.optional(),
  /** Travel mode for this leg. A multimodal route mixes modes across legs. */
  mode: LegModeSchema.optional(),
  /** Present only when `mode` is a public-transport vehicle. */
  transit: TransitLegSchema.optional(),
  steps: z.array(StepSchema).default([]),
});
export type Leg = z.infer<typeof LegSchema>;

export const RouteSchema = z.object({
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  /** Encoded overview polyline (precision 5). */
  polyline: z.string().optional(),
  legs: z.array(LegSchema).default([]),
  warnings: z.array(z.string()).default([]),
  attribution: AttributionSchema,
  raw: z.unknown().optional(),
});
export type Route = z.infer<typeof RouteSchema>;

export const RouteResultSchema = z.object({
  routes: z.array(RouteSchema),
  attribution: AttributionSchema,
});
export type RouteResult = z.infer<typeof RouteResultSchema>;

export const MatrixCellStatusSchema = z.enum(["OK", "NOT_FOUND", "ZERO_RESULTS", "ERROR"]);
export type MatrixCellStatus = z.infer<typeof MatrixCellStatusSchema>;

export const MatrixCellSchema = z.object({
  durationSeconds: z.number().nonnegative().optional(),
  distanceMeters: z.number().nonnegative().optional(),
  status: MatrixCellStatusSchema.default("OK"),
});
export type MatrixCell = z.infer<typeof MatrixCellSchema>;

/** An origins × destinations travel matrix. `rows[o][d]` is origin o → dest d. */
export const MatrixSchema = z.object({
  origins: z.array(LatLngSchema),
  destinations: z.array(LatLngSchema),
  rows: z.array(z.array(MatrixCellSchema)),
  attribution: AttributionSchema,
});
export type Matrix = z.infer<typeof MatrixSchema>;
