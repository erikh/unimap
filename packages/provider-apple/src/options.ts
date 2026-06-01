import { AuthError } from "@unimap/core";
import { createAppleTokenProvider, signMapsToken } from "./auth";

export interface AppleProviderOptions {
  /** PKCS8 PEM contents of the MapKit `.p8` key. Omit if supplying accessTokenProvider. */
  privateKey?: string;
  keyId?: string;
  teamId?: string;
  origin?: string;
  /** Maps Server API base, default https://maps-api.apple.com */
  baseUrl?: string;
  /** Apple Maps Web Snapshot base for static maps. */
  snapshotUrl?: string;
  /** Supply a pre-built access-token accessor (e.g. managed by the proxy) instead of raw creds. */
  accessTokenProvider?: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

export interface ResolvedAppleOptions {
  baseUrl: string;
  snapshotUrl: string;
  getAccessToken: () => Promise<string>;
  /** Signs a raw MapKit token (for Web Snapshots / MapKit JS). Only when creds are present. */
  signToken?: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

const trimSlash = (s: string): string => s.replace(/\/+$/, "");

export function resolveAppleOptions(options: AppleProviderOptions = {}): ResolvedAppleOptions {
  const baseUrl = trimSlash(options.baseUrl ?? "https://maps-api.apple.com");
  const snapshotUrl = trimSlash(options.snapshotUrl ?? "https://snapshot.apple-mapkit.com/api/v1/snapshot");
  const hasCreds = Boolean(options.privateKey && options.keyId && options.teamId);

  const getAccessToken =
    options.accessTokenProvider ??
    (hasCreds
      ? createAppleTokenProvider({
          privateKey: options.privateKey!,
          keyId: options.keyId!,
          teamId: options.teamId!,
          origin: options.origin,
          baseUrl,
          fetchImpl: options.fetchImpl,
        })
      : () => {
          throw new AuthError("Apple provider requires privateKey+keyId+teamId or accessTokenProvider", {
            providerId: "apple",
          });
        });

  const signToken = hasCreds
    ? () =>
        signMapsToken({
          privateKey: options.privateKey!,
          keyId: options.keyId!,
          teamId: options.teamId!,
          origin: options.origin,
        })
    : undefined;

  return { baseUrl, snapshotUrl, getAccessToken, signToken, fetchImpl: options.fetchImpl };
}
