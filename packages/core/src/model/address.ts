import { z } from "zod";

/**
 * A single structured address part. `kind` uses our own neutral vocabulary
 * (not any provider's field names) so adapters normalise into a common shape.
 */
export const AddressComponentSchema = z.object({
  kind: z.enum([
    "country",
    "region",
    "subRegion",
    "locality",
    "subLocality",
    "postalCode",
    "street",
    "streetNumber",
    "premise",
    "other",
  ]),
  value: z.string(),
  /** Short code where applicable (e.g. ISO country/region code). */
  code: z.string().optional(),
});
export type AddressComponent = z.infer<typeof AddressComponentSchema>;

/** A normalised postal address. */
export const AddressSchema = z.object({
  /** Single-line formatted address. */
  formatted: z.string(),
  countryCode: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  subRegion: z.string().optional(),
  locality: z.string().optional(),
  subLocality: z.string().optional(),
  postalCode: z.string().optional(),
  street: z.string().optional(),
  streetNumber: z.string().optional(),
  /** Full ordered list of structured components. */
  components: z.array(AddressComponentSchema).default([]),
});
export type Address = z.infer<typeof AddressSchema>;
