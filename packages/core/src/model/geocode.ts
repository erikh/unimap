import { z } from "zod";
import { LatLngSchema, BoundingBoxSchema } from "./geo";
import { AddressSchema } from "./address";
import { AttributionSchema } from "./attribution";

/** A single geocoding / reverse-geocoding result. */
export const GeocodeResultSchema = z.object({
  location: LatLngSchema,
  address: AddressSchema,
  /** Recommended viewport / bounds for the result, where available. */
  bounds: BoundingBoxSchema.optional(),
  /** Normalised 0..1 confidence, where the provider exposes one. */
  confidence: z.number().min(0).max(1).optional(),
  /** Provider-namespaced place id, where available. */
  placeId: z.string().optional(),
  attribution: AttributionSchema,
  raw: z.unknown().optional(),
});
export type GeocodeResult = z.infer<typeof GeocodeResultSchema>;
