import { Hono } from "hono";
import { scenarioOf } from "./scenarios";
import { GEO } from "./fixtures";

/**
 * Stand-in for an *undocumented / reverse-engineered* provider endpoint, so the
 * opt-in unofficial tier can be integration-tested without touching a real
 * (ToS-restricted) internal API.
 */
export function unofficialRoutes(): Hono {
  const app = new Hono();
  app.get("/geocode", (c) => {
    if (scenarioOf(c) === "empty") return c.json({ results: [] });
    return c.json({
      results: [{ loc: { lat: GEO.lat, lng: GEO.lng }, addr: GEO.formatted, locality: GEO.locality, cc: GEO.countryCode }],
    });
  });
  return app;
}
