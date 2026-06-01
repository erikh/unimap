import type { Context, Next } from "hono";

/**
 * Tests drive resilience paths by sending an `x-mock-scenario` header. The
 * middleware handles the transport-level scenarios generically; routes inspect
 * `scenarioOf()` for the data-shaped ones ("empty").
 */
export type Scenario = "ok" | "quota" | "error" | "malformed" | "slow" | "empty";

export function scenarioOf(c: Context): Scenario {
  const value = c.req.header("x-mock-scenario");
  return (value as Scenario) || "ok";
}

export async function scenarioMiddleware(c: Context, next: Next): Promise<Response | void> {
  switch (scenarioOf(c)) {
    case "slow":
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      return next();
    case "quota":
      return c.json({ error: "rate limit exceeded" }, 429);
    case "error":
      return c.json({ error: "internal server error" }, 500);
    case "malformed":
      return c.body("{ definitely not valid json", 200, { "content-type": "application/json" });
    default:
      return next();
  }
}
