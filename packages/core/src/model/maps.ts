import { z } from "zod";
import { AttributionSchema } from "./attribution";

/**
 * A basemap tile/style source descriptor for the render layer. Note Google and
 * Apple basemap tiles are SDK-locked and are NOT represented as raster/vector
 * URLs here; their engines consume native config instead. This abstraction is
 * primarily for OSM / hosted vector-tile providers.
 */
export const TileSourceSchema = z.object({
  kind: z.enum(["raster", "vector", "style"]),
  /** XYZ template (`{z}/{x}/{y}`) for raster/vector, or a style-JSON URL. */
  url: z.string(),
  tileSize: z.number().int().positive().optional(),
  minZoom: z.number().min(0).max(24).optional(),
  maxZoom: z.number().min(0).max(24).optional(),
  attribution: AttributionSchema,
});
export type TileSource = z.infer<typeof TileSourceSchema>;

/** Result of a static-map request: a ready-to-load image URL plus attribution. */
export const StaticMapResultSchema = z.object({
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  attribution: AttributionSchema,
});
export type StaticMapResult = z.infer<typeof StaticMapResultSchema>;
