import { AuthError, ProviderError, RateLimitError } from "./errors";

export interface HttpOptions {
  providerId?: string;
  /** Injectable fetch (tests / non-global environments). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Thin fetch wrapper that maps transport/HTTP failures onto the SDK error
 * taxonomy so MapsClient fallback and the proxy can reason about them
 * uniformly. 429 → RateLimitError, 401/403 → AuthError, else → ProviderError;
 * invalid JSON → ProviderError (covers the mock's "malformed" scenario).
 */
export async function httpJson<T = unknown>(
  url: string | URL,
  init?: RequestInit,
  options: HttpOptions = {},
): Promise<T> {
  // Bind to globalThis: an unbound global fetch called via a variable throws
  // "Illegal invocation" in browsers (Node is lenient).
  const doFetch = (options.fetchImpl ?? fetch).bind(globalThis);
  let response: Response;
  try {
    response = await doFetch(url, init);
  } catch (cause) {
    throw new ProviderError(`Network request failed: ${String(cause)}`, {
      providerId: options.providerId,
      cause,
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const message = `HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`;
    if (response.status === 429) {
      throw new RateLimitError(message, { providerId: options.providerId, status: 429 });
    }
    if (response.status === 401 || response.status === 403) {
      throw new AuthError(message, { providerId: options.providerId, status: response.status });
    }
    throw new ProviderError(message, { providerId: options.providerId, status: response.status });
  }

  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new ProviderError("Invalid JSON in provider response", {
      providerId: options.providerId,
      cause,
    });
  }
}
