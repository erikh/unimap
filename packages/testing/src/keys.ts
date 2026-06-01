import { exportPKCS8, generateKeyPair, type KeyLike } from "jose";

export interface AppleTestKeys {
  /** PKCS8 PEM — stands in for the contents of an Apple MapKit `.p8` key file. */
  privateKeyPem: string;
  /** Public key handed to the mock so it can verify developer-signed tokens. */
  publicKey: KeyLike;
  keyId: string;
  teamId: string;
}

/** Generate a throwaway ES256 keypair for exercising the Apple auth path. */
export async function generateAppleTestKeys(): Promise<AppleTestKeys> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const privateKeyPem = await exportPKCS8(privateKey);
  return { privateKeyPem, publicKey, keyId: "TESTKEYID01", teamId: "TESTTEAMID0" };
}
