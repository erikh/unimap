import { Hono } from "hono";
import { scenarioMiddleware } from "./scenarios";
import { osmRoutes } from "./osm";
import { googleRoutes } from "./google";
import { appleRoutes, type AppleMockOptions } from "./apple";
import { unofficialRoutes } from "./unofficial";

export interface MockOptions {
  apple?: AppleMockOptions;
}

/**
 * Build the full mock app. Providers are mounted under `/google`, `/apple`,
 * `/osm`; adapters point their base URLs at these prefixes in tests.
 */
export function createMockApp(options: MockOptions = {}): Hono {
  const app = new Hono();
  app.use("*", scenarioMiddleware);
  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/google", googleRoutes());
  app.route("/apple", appleRoutes(options.apple ?? {}));
  app.route("/osm", osmRoutes());
  app.route("/unofficial", unofficialRoutes());
  return app;
}

export type { AppleMockOptions };
