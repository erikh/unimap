import { NotSupportedError } from "@unimap/core";

type Env = Record<string, string | undefined>;

/** True only when UNIMAP_ENABLE_UNOFFICIAL is explicitly turned on. */
export function isUnofficialEnabled(env: Env = process.env): boolean {
  const value = env.UNIMAP_ENABLE_UNOFFICIAL;
  return value === "1" || value === "true";
}

/**
 * Hard gate for every reverse-engineered adapter. Off by default; the default
 * distribution therefore never calls an undocumented endpoint.
 */
export function assertUnofficialEnabled(env: Env = process.env): void {
  if (!isUnofficialEnabled(env)) {
    throw new NotSupportedError(
      "Unofficial provider tier is disabled. Set UNIMAP_ENABLE_UNOFFICIAL=1 to enable. " +
        "WARNING: these adapters call undocumented endpoints that may violate provider Terms of Service.",
      { providerId: "unofficial" },
    );
  }
}
