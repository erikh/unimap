import { Hono } from "hono";
import { encodePolyline } from "@unimap/core";
import { scenarioOf } from "./scenarios";
import { GEO, POI, PNG_1x1, ROUTE, ROUTE_PATH } from "./fixtures";

function geocodeResult(): unknown {
  return {
    status: "OK",
    results: [
      {
        formatted_address: GEO.formatted,
        geometry: {
          location: { lat: GEO.lat, lng: GEO.lng },
          location_type: "ROOFTOP",
          viewport: {
            northeast: { lat: GEO.bbox.north, lng: GEO.bbox.east },
            southwest: { lat: GEO.bbox.south, lng: GEO.bbox.west },
          },
        },
        place_id: POI.id,
        types: ["street_address"],
        address_components: [
          { long_name: GEO.streetNumber, short_name: GEO.streetNumber, types: ["street_number"] },
          { long_name: GEO.street, short_name: GEO.street, types: ["route"] },
          { long_name: GEO.locality, short_name: GEO.locality, types: ["locality", "political"] },
          { long_name: GEO.county, short_name: GEO.county, types: ["administrative_area_level_2", "political"] },
          { long_name: GEO.region, short_name: GEO.regionCode, types: ["administrative_area_level_1", "political"] },
          { long_name: GEO.country, short_name: GEO.countryCode, types: ["country", "political"] },
          { long_name: GEO.postalCode, short_name: GEO.postalCode, types: ["postal_code"] },
        ],
      },
    ],
  };
}

function placeObject(): unknown {
  return {
    id: POI.id,
    name: `places/${POI.id}`,
    displayName: { text: POI.name, languageCode: "en" },
    formattedAddress: GEO.formatted,
    location: { latitude: POI.lat, longitude: POI.lng },
    types: ["point_of_interest", "establishment"],
    primaryType: "point_of_interest",
    rating: POI.rating,
    nationalPhoneNumber: POI.phone,
    websiteUri: POI.website,
  };
}

const deny = () => ({ error: { code: 403, status: "PERMISSION_DENIED", message: "API key missing" } });

export function googleRoutes(): Hono {
  const app = new Hono();

  // Geocoding API (v3 JSON). Forward uses ?address=, reverse uses ?latlng=.
  app.get("/maps/api/geocode/json", (c) => {
    if (!c.req.header("x-goog-api-key") && !c.req.query("key")) {
      return c.json({ status: "REQUEST_DENIED", error_message: "API key missing" });
    }
    if (scenarioOf(c) === "empty") return c.json({ status: "ZERO_RESULTS", results: [] });
    return c.json(geocodeResult());
  });

  // Routes API — computeRoutes (path: /directions/v2:computeRoutes).
  app.post("/directions/:rpc", async (c) => {
    if (!c.req.header("x-goog-api-key")) return c.json(deny(), 403);
    if (!c.req.header("x-goog-fieldmask")) {
      return c.json({ error: { code: 400, status: "INVALID_ARGUMENT", message: "field mask required" } }, 400);
    }
    if (scenarioOf(c) === "empty") return c.json({ routes: [] });
    const seg = (from: number, to: number) => encodePolyline(ROUTE_PATH.slice(from, to));
    return c.json({
      routes: [
        {
          distanceMeters: ROUTE.distanceMeters,
          duration: `${ROUTE.durationSeconds}s`,
          polyline: { encodedPolyline: ROUTE.polyline },
          legs: [
            {
              distanceMeters: ROUTE.distanceMeters,
              duration: `${ROUTE.durationSeconds}s`,
              polyline: { encodedPolyline: ROUTE.polyline },
              steps: [
                {
                  distanceMeters: 24_500,
                  staticDuration: "1500s",
                  navigationInstruction: { maneuver: "DEPART", instructions: "Head north on Amphitheatre Pkwy" },
                  polyline: { encodedPolyline: seg(0, 2) },
                },
                {
                  distanceMeters: 24_500,
                  staticDuration: "1500s",
                  navigationInstruction: { maneuver: "DESTINATION", instructions: "Arrive at destination" },
                  polyline: { encodedPolyline: seg(1, 3) },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  // Routes API — computeRouteMatrix (path: /distanceMatrix/v2:computeRouteMatrix). Returns a JSON array.
  app.post("/distanceMatrix/:rpc", async (c) => {
    if (!c.req.header("x-goog-api-key")) return c.json(deny(), 403);
    const body = (await c.req.json().catch(() => ({}))) as { origins?: unknown[]; destinations?: unknown[] };
    const origins = body.origins?.length ?? 1;
    const destinations = body.destinations?.length ?? 1;
    const cells: unknown[] = [];
    for (let o = 0; o < origins; o++) {
      for (let d = 0; d < destinations; d++) {
        cells.push({
          originIndex: o,
          destinationIndex: d,
          distanceMeters: o === d ? 0 : 1000 * (Math.abs(o - d) + 1),
          duration: `${o === d ? 0 : 120 * (Math.abs(o - d) + 1)}s`,
          condition: "ROUTE_EXISTS",
        });
      }
    }
    return c.json(cells);
  });

  // Places API (New) custom methods: places:searchText | places:searchNearby | places:autocomplete.
  app.post("/v1/:method", (c) => {
    if (!c.req.header("x-goog-api-key")) return c.json(deny(), 403);
    const method = c.req.param("method");
    if (method === "places:autocomplete") {
      if (scenarioOf(c) === "empty") return c.json({ suggestions: [] });
      return c.json({
        suggestions: [
          {
            placePrediction: {
              placeId: POI.id,
              text: { text: `${POI.name}, ${GEO.street}, ${GEO.locality}, ${GEO.regionCode}, USA` },
              structuredFormat: {
                mainText: { text: POI.name },
                secondaryText: { text: `${GEO.locality}, ${GEO.regionCode}` },
              },
            },
          },
        ],
      });
    }
    if (scenarioOf(c) === "empty") return c.json({ places: [] });
    return c.json({ places: [placeObject()] });
  });

  app.get("/v1/places/:id", (c) => c.json(placeObject()));

  // Maps Static API (serves a placeholder image).
  app.get("/maps/api/staticmap", (c) => c.body(PNG_1x1, 200, { "content-type": "image/png" }));

  return app;
}
