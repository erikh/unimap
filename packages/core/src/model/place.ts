import { z } from "zod";
import { LatLngSchema } from "./geo";
import { AddressSchema } from "./address";
import { AttributionSchema } from "./attribution";

/** A neutral POI category. `id` is our own taxonomy; `label` is display text. */
export const PlaceCategorySchema = z.object({
  id: z.string(),
  label: z.string().optional(),
});
export type PlaceCategory = z.infer<typeof PlaceCategorySchema>;

/** A point of interest / place. */
export const PlaceSchema = z.object({
  /** Provider-namespaced id, e.g. "google:ChIJ...", "apple:...", "osm:node/123". */
  id: z.string(),
  provider: z.string(),
  name: z.string(),
  location: LatLngSchema.optional(),
  address: AddressSchema.optional(),
  categories: z.array(PlaceCategorySchema).default([]),
  phone: z.string().optional(),
  website: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  attribution: AttributionSchema,
  /** Untouched provider payload, opt-in. Keeps the canonical surface clean. */
  raw: z.unknown().optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

/** An autocomplete suggestion. */
export const SuggestionSchema = z.object({
  text: z.string(),
  placeId: z.string().optional(),
  location: LatLngSchema.optional(),
  kind: z.enum(["place", "query", "address"]).default("place"),
  attribution: AttributionSchema,
  raw: z.unknown().optional(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;
