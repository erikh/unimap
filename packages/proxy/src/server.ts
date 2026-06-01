import { serve } from "@hono/node-server";
import { createProxyApp, type ProxyConfig } from "./app";
import { buildProvidersFromEnv } from "./providers";

export interface StartedProxy {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export async function startProxy(config: ProxyConfig, port = 0): Promise<StartedProxy> {
  const app = createProxyApp(config);
  return new Promise<StartedProxy>((resolve) => {
    const server = serve({ fetch: app.fetch, port }, (info) => {
      resolve({
        url: `http://127.0.0.1:${info.port}`,
        port: info.port,
        close: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}

/** Build a proxy from environment variables (used by the standalone server / Docker). */
export function proxyFromEnv(env = process.env): ProxyConfig {
  const built = buildProvidersFromEnv(env);
  if (built.unofficialRequested) {
    console.warn(
      "[unimap proxy] UNIMAP_ENABLE_UNOFFICIAL is set — install @unimap/provider-unofficial and register it to enable the reverse-engineered tier.",
    );
  }
  return {
    providers: built.providers,
    mapkitTokenSigner: built.mapkitTokenSigner,
    sourceUrl: env.UNIMAP_SOURCE_URL,
    cacheTtlMs: env.UNIMAP_CACHE_TTL_MS ? Number(env.UNIMAP_CACHE_TTL_MS) : 0,
    rateLimit: env.UNIMAP_RATE_LIMIT_MAX
      ? { windowMs: Number(env.UNIMAP_RATE_LIMIT_WINDOW_MS ?? 60_000), max: Number(env.UNIMAP_RATE_LIMIT_MAX) }
      : undefined,
  };
}

// Standalone entry point for `npm run dev:proxy` and the Docker image.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PROXY_PORT ?? 8787);
  startProxy(proxyFromEnv(), port).then((s) => {
    console.log(`[unimap proxy] listening on ${s.url}`);
  });
}
