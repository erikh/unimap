import { readFileSync } from "node:fs";
import type { Capability, Provider } from "@unimap/core";
import { createGoogleProvider } from "@unimap/provider-google";
import { createAppleProvider, signMapsToken } from "@unimap/provider-apple";
import { createOsmProvider } from "@unimap/provider-osm";

export interface BuiltProviders {
  providers: Provider[];
  order?: Partial<Record<Capability, string[]>>;
  /** Mints a MapKit JS token for the render façade, when Apple creds are present. */
  mapkitTokenSigner?: () => Promise<string>;
  /** Whether the reverse-engineered tier was requested but not yet wired in. */
  unofficialRequested: boolean;
}

type Env = Record<string, string | undefined>;

function applePrivateKey(env: Env): string | undefined {
  if (env.APPLE_MAPS_PRIVATE_KEY) return env.APPLE_MAPS_PRIVATE_KEY;
  if (env.APPLE_MAPS_PRIVATE_KEY_PATH) return readFileSync(env.APPLE_MAPS_PRIVATE_KEY_PATH, "utf8");
  return undefined;
}

/**
 * Construct the provider set from environment variables. OSM is always present
 * (open, no key required); Google and Apple are added when their credentials
 * are configured. Credentials never leave this process.
 */
export function buildProvidersFromEnv(env: Env = process.env): BuiltProviders {
  const providers: Provider[] = [];
  let mapkitTokenSigner: (() => Promise<string>) | undefined;

  if (env.GOOGLE_MAPS_API_KEY || env.GOOGLE_MAPS_OAUTH_TOKEN) {
    providers.push(
      createGoogleProvider({ apiKey: env.GOOGLE_MAPS_API_KEY, oauthToken: env.GOOGLE_MAPS_OAUTH_TOKEN }),
    );
  }

  const appleKey = applePrivateKey(env);
  if (appleKey && env.APPLE_MAPS_KEY_ID && env.APPLE_MAPS_TEAM_ID) {
    const creds = {
      privateKey: appleKey,
      keyId: env.APPLE_MAPS_KEY_ID,
      teamId: env.APPLE_MAPS_TEAM_ID,
      origin: env.APPLE_MAPS_ORIGIN,
    };
    providers.push(createAppleProvider(creds));
    mapkitTokenSigner = () => signMapsToken(creds);
  }

  providers.push(
    createOsmProvider({
      nominatimUrl: env.OSM_NOMINATIM_URL,
      osrmUrl: env.OSM_OSRM_URL,
      photonUrl: env.OSM_PHOTON_URL,
      overpassUrl: env.OSM_OVERPASS_URL,
      tileUrl: env.OSM_TILE_URL,
      motisUrl: env.TRANSIT_URL,
      userAgent: env.OSM_USER_AGENT,
    }),
  );

  return {
    providers,
    mapkitTokenSigner,
    unofficialRequested: env.UNIMAP_ENABLE_UNOFFICIAL === "1" || env.UNIMAP_ENABLE_UNOFFICIAL === "true",
  };
}
