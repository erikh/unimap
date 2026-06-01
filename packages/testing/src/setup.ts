import { startMockServer, type StartedServer } from "@unimap/mock-server";
import { generateAppleTestKeys, type AppleTestKeys } from "./keys";

export interface MockEnv {
  url: string;
  close: () => Promise<void>;
  apple: AppleTestKeys;
  /** Base URLs ready to drop into each provider adapter's options. */
  googleBaseUrl: string;
  appleBaseUrl: string;
  unofficialBaseUrl: string;
  osm: {
    nominatimUrl: string;
    osrmUrl: string;
    photonUrl: string;
    overpassUrl: string;
    tileUrl: string;
  };
}

export interface SetupOptions {
  /** Whether the Apple mock verifies the signed JWT and gates endpoints (default true). */
  requireAppleAuth?: boolean;
}

/** Boot the mock server on an ephemeral port and return adapter-ready base URLs. */
export async function setupMock(options: SetupOptions = {}): Promise<MockEnv> {
  const apple = await generateAppleTestKeys();
  const server: StartedServer = await startMockServer({
    apple: {
      requireAuth: options.requireAppleAuth ?? true,
      verifyKey: apple.publicKey,
      teamId: apple.teamId,
    },
  });
  const base = server.url;
  return {
    url: base,
    close: server.close,
    apple,
    googleBaseUrl: `${base}/google`,
    appleBaseUrl: `${base}/apple`,
    unofficialBaseUrl: `${base}/unofficial`,
    osm: {
      nominatimUrl: `${base}/osm/nominatim`,
      osrmUrl: `${base}/osm/osrm`,
      photonUrl: `${base}/osm/photon`,
      overpassUrl: `${base}/osm/overpass`,
      tileUrl: `${base}/osm/tiles/{z}/{x}/{y}.png`,
    },
  };
}
