import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z, ZodError, type ZodTypeAny } from "zod";
import {
  AutocompleteRequestSchema,
  CAPABILITIES,
  GeocodeQuerySchema,
  MapsClient,
  MatrixRequestSchema,
  PlaceDetailsRequestSchema,
  PlaceSearchRequestSchema,
  ReverseGeocodeQuerySchema,
  RouteRequestSchema,
  StaticMapRequestSchema,
  UnimapError,
  type Capability,
  type ErrorCode,
  type Provider,
} from "@unimap/core";

export interface ProxyConfig {
  providers: Provider[];
  order?: Partial<Record<Capability, string[]>>;
  /** Mints a MapKit JS token for the render façade's authorizationCallback. */
  mapkitTokenSigner?: () => Promise<string>;
  /** AGPL §13: where to find the Corresponding Source. */
  sourceUrl?: string;
  /** Response cache TTL in ms. Default 0 (disabled) — Google ToS restricts caching. */
  cacheTtlMs?: number;
  rateLimit?: { windowMs: number; max: number };
}

function statusForCode(code: ErrorCode): number {
  switch (code) {
    case "VALIDATION_ERROR":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "RATE_LIMITED":
    case "QUOTA_ERROR":
      return 429;
    case "NOT_SUPPORTED":
      return 501;
    case "TIMEOUT":
      return 504;
    case "AUTH_ERROR":
    case "PROVIDER_ERROR":
    default:
      return 502;
  }
}

export function createProxyApp(config: ProxyConfig): Hono {
  const client = new MapsClient({ providers: config.providers, order: config.order });
  const app = new Hono();
  const cache = new Map<string, { expiresAt: number; value: unknown }>();

  app.use("/v1/*", cors());

  if (config.rateLimit) {
    const { windowMs, max } = config.rateLimit;
    const hits = new Map<string, { count: number; resetAt: number }>();
    app.use("/v1/*", async (c, next) => {
      const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
      const now = Date.now();
      let hit = hits.get(ip);
      if (!hit || hit.resetAt < now) {
        hit = { count: 0, resetAt: now + windowMs };
        hits.set(ip, hit);
      }
      hit.count += 1;
      if (hit.count > max) return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, 429);
      return next();
    });
  }

  app.onError((err, c) => {
    if (err instanceof ZodError) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", issues: err.issues } }, 400);
    }
    if (err instanceof UnimapError) {
      return c.json({ error: err.toJSON() }, statusForCode(err.code) as 400);
    }
    return c.json({ error: { code: "INTERNAL", message: String((err as Error).message ?? err) } }, 500);
  });

  // Pick the client honouring an optional ?provider= pin (forces one provider for every capability).
  const pick = (c: Context): MapsClient => {
    const forced = c.req.query("provider");
    if (!forced) return client;
    const order = Object.fromEntries(CAPABILITIES.map((cap) => [cap, [forced]])) as Partial<
      Record<Capability, string[]>
    >;
    return new MapsClient({ providers: config.providers, order });
  };

  const parse = async <S extends ZodTypeAny>(schema: S, c: Context): Promise<z.infer<S>> => {
    const json = await c.req.json().catch(() => ({}));
    return schema.parse(json) as z.infer<S>;
  };

  // Optionally cache idempotent reads. Disabled (ttl<=0) by default.
  async function maybeCache<T>(c: Context, capability: Capability, body: unknown, run: () => Promise<T>): Promise<T> {
    const ttl = config.cacheTtlMs ?? 0;
    if (ttl <= 0) return run();
    const key = `${capability}:${c.req.query("provider") ?? ""}:${JSON.stringify(body)}`;
    const hit = cache.get(key);
    const now = Date.now();
    if (hit && hit.expiresAt > now) return hit.value as T;
    const value = await run();
    cache.set(key, { value, expiresAt: now + ttl });
    return value;
  }

  // --- meta ----------------------------------------------------------------
  app.get("/", (c) => c.json({ name: "unimap-proxy", version: "0.1.0", endpoints: "/v1/*", source: "/source" }));
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/source", (c) =>
    c.json({
      name: "UniMap proxy",
      license: "AGPL-3.0-or-later",
      source: config.sourceUrl ?? "https://github.com/unimap/unimap",
      notice:
        "This network service is AGPL-3.0 software. Under §13, the complete Corresponding Source is offered at the URL above.",
    }),
  );
  app.get("/v1/capabilities", (c) => c.json(client.capabilities()));
  app.get("/v1/routing-modes", (c) => c.json(client.routingModes()));

  // --- geocoding -----------------------------------------------------------
  app.post("/v1/geocode", async (c) => {
    const body = await parse(GeocodeQuerySchema, c);
    return c.json(await maybeCache(c, "geocoding", body, () => pick(c).geocode(body)));
  });
  app.post("/v1/reverse-geocode", async (c) => {
    const body = await parse(ReverseGeocodeQuerySchema, c);
    return c.json(await maybeCache(c, "geocoding", body, () => pick(c).reverseGeocode(body)));
  });

  // --- routing -------------------------------------------------------------
  app.post("/v1/route", async (c) => {
    const body = await parse(RouteRequestSchema, c);
    return c.json(await maybeCache(c, "routing", body, () => pick(c).route(body)));
  });
  app.post("/v1/matrix", async (c) => {
    const body = await parse(MatrixRequestSchema, c);
    return c.json(await maybeCache(c, "routing", body, () => pick(c).matrix(body)));
  });

  // --- places --------------------------------------------------------------
  app.post("/v1/places/search", async (c) => {
    const body = await parse(PlaceSearchRequestSchema, c);
    return c.json(await maybeCache(c, "places", body, () => pick(c).search(body)));
  });
  app.post("/v1/places/autocomplete", async (c) => {
    const body = await parse(AutocompleteRequestSchema, c);
    return c.json(await pick(c).autocomplete(body));
  });
  app.post("/v1/places/details", async (c) => {
    const body = await parse(PlaceDetailsRequestSchema, c);
    return c.json(await maybeCache(c, "places", body, () => pick(c).details(body)));
  });

  // --- static + tiles ------------------------------------------------------
  app.post("/v1/staticmap", async (c) => {
    const body = await parse(StaticMapRequestSchema, c);
    return c.json(await pick(c).staticMap(body));
  });
  app.get("/v1/tiles", async (c) => c.json(await pick(c).tileSource()));

  // --- auth proxying (render façade) ---------------------------------------
  app.get("/v1/auth/apple/mapkit-token", async (c) => {
    if (!config.mapkitTokenSigner) {
      return c.json({ error: { code: "NOT_SUPPORTED", message: "Apple Maps is not configured" } }, 501);
    }
    return c.json({ token: await config.mapkitTokenSigner(), expiresInSeconds: 1800 });
  });

  return app;
}
