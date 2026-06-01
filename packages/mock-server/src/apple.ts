import { Hono, type Context } from "hono";
import { jwtVerify, type KeyLike } from "jose";
import { encodePolyline } from "@unimap/core";
import { scenarioOf } from "./scenarios";
import { GEO, POI, DEST, ROUTE, ROUTE_PATH } from "./fixtures";

export interface AppleMockOptions {
  /** When true, the token exchange verifies the JWT and endpoints require a previously-issued access token. */
  requireAuth?: boolean;
  /** Public key used to verify the developer-signed Maps auth token (ES256). */
  verifyKey?: KeyLike | Uint8Array;
  /** Expected `iss` (Apple Team ID). */
  teamId?: string;
}

function structuredAddress(): unknown {
  return {
    administrativeArea: GEO.region,
    administrativeAreaCode: GEO.regionCode,
    locality: GEO.locality,
    postCode: GEO.postalCode,
    subLocality: "",
    thoroughfare: GEO.street,
    subThoroughfare: GEO.streetNumber,
    fullThoroughfare: `${GEO.streetNumber} ${GEO.street}`,
    country: GEO.country,
    countryCode: GEO.countryCode,
  };
}

function place(): unknown {
  return {
    id: POI.id,
    name: POI.name,
    coordinate: { latitude: POI.lat, longitude: POI.lng },
    displayMapRegion: {
      southLatitude: GEO.bbox.south,
      westLongitude: GEO.bbox.west,
      northLatitude: GEO.bbox.north,
      eastLongitude: GEO.bbox.east,
    },
    formattedAddressLines: [`${GEO.streetNumber} ${GEO.street}`, `${GEO.locality}, ${GEO.regionCode} ${GEO.postalCode}`, GEO.country],
    structuredAddress: structuredAddress(),
    country: GEO.country,
    countryCode: GEO.countryCode,
    poiCategory: "Business",
  };
}

export function appleRoutes(options: AppleMockOptions = {}): Hono {
  const app = new Hono();
  const issued = new Set<string>();
  const requireAuth = options.requireAuth ?? false;

  const denyIfUnauthed = (c: Context): Response | null => {
    if (!requireAuth) return null;
    const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!issued.has(token)) return c.json({ error: { message: "Unauthorized" } }, 401);
    return null;
  };

  // Token exchange: developer JWT -> short-lived access token.
  app.get("/v1/token", async (c) => {
    const authToken = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!authToken) return c.json({ error: { message: "Missing authorization token" } }, 401);
    if (requireAuth && options.verifyKey) {
      try {
        await jwtVerify(authToken, options.verifyKey, options.teamId ? { issuer: options.teamId } : {});
      } catch {
        return c.json({ error: { message: "Invalid authorization token" } }, 401);
      }
    }
    const accessToken = `mock-access-${globalThis.crypto.randomUUID()}`;
    issued.add(accessToken);
    return c.json({ accessToken, expiresInSeconds: 1800 });
  });

  app.get("/v1/geocode", (c) => {
    const denied = denyIfUnauthed(c);
    if (denied) return denied;
    if (scenarioOf(c) === "empty") return c.json({ results: [] });
    return c.json({
      results: [
        {
          coordinate: { latitude: GEO.lat, longitude: GEO.lng },
          displayMapRegion: {
            southLatitude: GEO.bbox.south,
            westLongitude: GEO.bbox.west,
            northLatitude: GEO.bbox.north,
            eastLongitude: GEO.bbox.east,
          },
          name: `${GEO.streetNumber} ${GEO.street}`,
          formattedAddressLines: [`${GEO.streetNumber} ${GEO.street}`, `${GEO.locality}, ${GEO.regionCode} ${GEO.postalCode}`, GEO.country],
          structuredAddress: structuredAddress(),
          country: GEO.country,
          countryCode: GEO.countryCode,
        },
      ],
    });
  });

  app.get("/v1/reverseGeocode", (c) => {
    const denied = denyIfUnauthed(c);
    if (denied) return denied;
    if (scenarioOf(c) === "empty") return c.json({ results: [] });
    return c.json({
      results: [
        {
          coordinate: { latitude: GEO.lat, longitude: GEO.lng },
          name: `${GEO.streetNumber} ${GEO.street}`,
          formattedAddressLines: [`${GEO.streetNumber} ${GEO.street}`, `${GEO.locality}, ${GEO.regionCode} ${GEO.postalCode}`, GEO.country],
          structuredAddress: structuredAddress(),
          country: GEO.country,
          countryCode: GEO.countryCode,
        },
      ],
    });
  });

  app.get("/v1/search", (c) => {
    const denied = denyIfUnauthed(c);
    if (denied) return denied;
    if (scenarioOf(c) === "empty") return c.json({ results: [] });
    return c.json({
      results: [place()],
      displayMapRegion: {
        southLatitude: GEO.bbox.south,
        westLongitude: GEO.bbox.west,
        northLatitude: GEO.bbox.north,
        eastLongitude: GEO.bbox.east,
      },
    });
  });

  app.get("/v1/searchAutocomplete", (c) => {
    const denied = denyIfUnauthed(c);
    if (denied) return denied;
    if (scenarioOf(c) === "empty") return c.json({ results: [] });
    return c.json({
      results: [
        {
          completionUrl: `search?q=${encodeURIComponent(POI.name)}&mapkitToken=...`,
          displayLines: [POI.name, `${GEO.locality}, ${GEO.regionCode}`],
          location: { latitude: POI.lat, longitude: POI.lng },
        },
      ],
    });
  });

  app.get("/v1/place/:id", (c) => {
    const denied = denyIfUnauthed(c);
    if (denied) return denied;
    return c.json(place());
  });

  app.get("/v1/directions", (c) => {
    const denied = denyIfUnauthed(c);
    if (denied) return denied;
    if (scenarioOf(c) === "empty") return c.json({ routes: [], steps: [], stepPaths: [] });
    return c.json({
      routes: [
        {
          name: "US-101 N",
          distanceMeters: ROUTE.distanceMeters,
          durationSeconds: ROUTE.durationSeconds,
          transportType: "Automobile",
          hasTolls: false,
          stepIndexes: [0, 1],
        },
      ],
      steps: [
        { stepPathIndex: 0, distanceMeters: 24_500, durationSeconds: 1_500, instructions: "Head north on Amphitheatre Pkwy", transportType: "Automobile" },
        { stepPathIndex: 1, distanceMeters: 24_500, durationSeconds: 1_500, instructions: "Arrive at destination", transportType: "Automobile" },
      ],
      stepPaths: [
        ROUTE_PATH.slice(0, 2).map(([lat, lng]) => ({ latitude: lat, longitude: lng })),
        ROUTE_PATH.slice(1).map(([lat, lng]) => ({ latitude: lat, longitude: lng })),
      ],
    });
  });

  app.get("/v1/etas", (c) => {
    const denied = denyIfUnauthed(c);
    if (denied) return denied;
    const destinations = (c.req.query("destinations") ?? `${DEST.lat},${DEST.lng}`)
      .split("|")
      .map((pair) => {
        const [lat, lng] = pair.split(",").map(Number);
        return { latitude: lat ?? DEST.lat, longitude: lng ?? DEST.lng };
      });
    return c.json({
      etas: destinations.map((destination, i) => ({
        destination,
        distanceMeters: ROUTE.distanceMeters + i * 1000,
        expectedTravelTimeSeconds: ROUTE.durationSeconds + i * 120,
        staticTravelTimeSeconds: ROUTE.durationSeconds,
        transportType: "Automobile",
      })),
    });
  });

  // Apple Maps Web Snapshot (static image) — serves a placeholder.
  app.get("/v1/snapshot", (c) =>
    c.json({ note: "Apple Web Snapshots return a signed image URL; mock returns metadata.", ...{ encodedPolyline: encodePolyline(ROUTE_PATH) } }),
  );

  return app;
}
