import { z } from "zod";

/**
 * Attribution that MUST accompany any data/tiles returned by a provider.
 * Every result in the SDK carries one of these; the render layer and the
 * proxy are responsible for surfacing it. Required by Google/Apple Terms of
 * Service and by the OpenStreetMap ODbL.
 */
export const AttributionSchema = z.object({
  /** Stable provider id, e.g. "google" | "apple" | "osm". */
  provider: z.string(),
  /** Human-readable notice, e.g. "© OpenStreetMap contributors". */
  text: z.string(),
  /** Link the notice should point to. */
  url: z.string().url().optional(),
  /** Optional logo to render next to the notice. */
  logoUrl: z.string().optional(),
});
export type Attribution = z.infer<typeof AttributionSchema>;
