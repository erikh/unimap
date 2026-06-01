import { z } from "zod";

/** A WGS84 coordinate. The canonical position type across the whole SDK. */
export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLngSchema>;

/** An axis-aligned geographic bounding box. */
export const BoundingBoxSchema = z.object({
  south: z.number().min(-90).max(90),
  west: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

/** `[lat, lng]` tuple, used by the polyline codec. */
export type LatLngTuple = [lat: number, lng: number];
