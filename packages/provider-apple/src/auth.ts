import { importPKCS8, SignJWT } from "jose";
import { httpJson } from "@unimap/core";

export interface MapsTokenInput {
  /** PKCS8 PEM contents of the MapKit `.p8` private key. */
  privateKey: string;
  keyId: string;
  teamId: string;
  /** Optional web origin restriction baked into the token. */
  origin?: string;
  ttlSeconds?: number;
}

/**
 * Sign a MapKit / Maps Server API auth token (ES256 JWT). This is the same
 * token MapKit JS uses; the proxy mints it server-side and never exposes the
 * private key to the browser.
 */
export async function signMapsToken(input: MapsTokenInput): Promise<string> {
  const key = await importPKCS8(input.privateKey, "ES256");
  const issuedAt = Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? 30 * 60;
  const payload: Record<string, unknown> = {};
  if (input.origin) payload["origin"] = input.origin;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", kid: input.keyId, typ: "JWT" })
    .setIssuer(input.teamId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttl)
    .sign(key);
}

export interface AppleTokenProviderOptions extends MapsTokenInput {
  /** Maps Server API base, default https://maps-api.apple.com */
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

interface TokenResponse {
  accessToken: string;
  expiresInSeconds?: number;
}

/**
 * Returns an async accessor that signs a Maps auth token, exchanges it at
 * `/v1/token` for a ~30-minute access token, and caches it until shortly
 * before expiry.
 */
export function createAppleTokenProvider(options: AppleTokenProviderOptions): () => Promise<string> {
  let cached: { token: string; expiresAt: number } | null = null;
  let inflight: Promise<string> | null = null;

  return async function getAccessToken(): Promise<string> {
    const now = Date.now();
    if (cached && now < cached.expiresAt - 60_000) return cached.token;
    if (inflight) return inflight;

    inflight = (async () => {
      const authToken = await signMapsToken(options);
      const response = await httpJson<TokenResponse>(
        `${options.baseUrl}/v1/token`,
        { headers: { Authorization: `Bearer ${authToken}` } },
        { providerId: "apple", fetchImpl: options.fetchImpl },
      );
      cached = {
        token: response.accessToken,
        expiresAt: Date.now() + (response.expiresInSeconds ?? 1800) * 1000,
      };
      return cached.token;
    })();
    try {
      return await inflight;
    } finally {
      inflight = null;
    }
  };
}
