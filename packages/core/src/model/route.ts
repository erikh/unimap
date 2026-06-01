import { z } from "zod";
import { LatLngSchema } from "./geo";
import { AttributionSchema } from "./attribution";

/** Neutral travel mode. Adapters map provider-specific modes onto these. */
export const TravelModeSchema = z.enum(["DRIVE", "WALK", "BICYCLE", "TRANSIT"]);
export type TravelMode = z.infer<typeof TravelModeSchema>;

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

export const LegSchema = z.object({
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  start: LatLngSchema.optional(),
  end: LatLngSchema.optional(),
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
