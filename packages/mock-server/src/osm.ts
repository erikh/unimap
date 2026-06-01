import { Hono } from "hono";
import { encodePolyline } from "@unimap/core";
import { scenarioOf } from "./scenarios";
import { GEO, POI, PNG_1x1, ROUTE, ROUTE_PATH, parseIndices } from "./fixtures";

/** Nominatim jsonv2 item (https://nominatim.org/release-docs/develop/api/Output/). */
function nominatimItem(): unknown {
  return {
    place_id: 1234567,
    licence: "Data © OpenStreetMap contributors, ODbL 1.0.",
    osm_type: "node",
    osm_id: 2192620,
    lat: String(GEO.lat),
    lon: String(GEO.lng),
    category: "office",
    type: "company",
    importance: 0.62,
    display_name: GEO.formatted,
    // Nominatim order is [lat_min, lat_max, lon_min, lon_max].
    boundingbox: [String(GEO.bbox.south), String(GEO.bbox.north), String(GEO.bbox.west), String(GEO.bbox.east)],
    address: {
      house_number: GEO.streetNumber,
      road: GEO.street,
      city: GEO.locality,
      county: GEO.county,
      state: GEO.region,
      "ISO3166-2-lvl4": `US-${GEO.regionCode}`,
      postcode: GEO.postalCode,
      country: GEO.country,
      country_code: GEO.countryCode.toLowerCase(),
    },
  };
}

function osrmRoute(): unknown {
  const stepA = encodePolyline(ROUTE_PATH.slice(0, 2));
  const stepB = encodePolyline(ROUTE_PATH.slice(1));
  return {
    code: "Ok",
    routes: [
      {
        distance: ROUTE.distanceMeters,
        duration: ROUTE.durationSeconds,
        geometry: ROUTE.polyline,
        legs: [
          {
            distance: ROUTE.distanceMeters,
            duration: ROUTE.durationSeconds,
            summary: "US-101 N",
            steps: [
              {
                distance: 24_500,
                duration: 1_500,
                geometry: stepA,
                name: "Amphitheatre Parkway",
                maneuver: { type: "depart", modifier: "", location: [GEO.lng, GEO.lat] },
              },
              {
                distance: 24_500,
                duration: 1_500,
                geometry: stepB,
                name: "US-101 N",
                maneuver: { type: "arrive", modifier: "", location: [ROUTE_PATH[2]![1], ROUTE_PATH[2]![0]] },
              },
            ],
          },
        ],
      },
    ],
    waypoints: [
      { name: "Amphitheatre Parkway", location: [GEO.lng, GEO.lat] },
      { name: "Market Street", location: [ROUTE_PATH[2]![1], ROUTE_PATH[2]![0]] },
    ],
  };
}

function photonFeatureCollection(): unknown {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [POI.lng, POI.lat] },
        properties: {
          osm_id: 2192620,
          osm_type: "N",
          osm_key: "office",
          osm_value: "company",
          name: POI.name,
          housenumber: GEO.streetNumber,
          street: GEO.street,
          city: GEO.locality,
          state: GEO.region,
          postcode: GEO.postalCode,
          country: GEO.country,
          countrycode: GEO.countryCode,
        },
      },
    ],
  };
}

export function osmRoutes(): Hono {
  const app = new Hono();

  app.get("/nominatim/search", (c) => (scenarioOf(c) === "empty" ? c.json([]) : c.json([nominatimItem()])));
  app.get("/nominatim/reverse", (c) =>
    scenarioOf(c) === "empty" ? c.json({ error: "Unable to geocode" }) : c.json(nominatimItem()),
  );
  app.get("/nominatim/lookup", (c) => c.json([nominatimItem()]));

  app.get("/osrm/route/v1/:profile/:coords", (c) =>
    scenarioOf(c) === "empty" ? c.json({ code: "NoRoute", routes: [] }) : c.json(osrmRoute()),
  );
  app.get("/osrm/table/v1/:profile/:coords", (c) => {
    const coords = c.req.param("coords").split(";");
    const total = coords.length;
    const sources = parseIndices(c.req.query("sources"), total);
    const destinations = parseIndices(c.req.query("destinations"), total);
    const durations = sources.map((s) => destinations.map((d) => (s === d ? 0 : 600 + 120 * Math.abs(s - d))));
    const distances = durations.map((row) => row.map((v) => v * 15));
    return c.json({ code: "Ok", durations, distances });
  });

  app.get("/photon/api", (c) =>
    scenarioOf(c) === "empty"
      ? c.json({ type: "FeatureCollection", features: [] })
      : c.json(photonFeatureCollection()),
  );

  const overpass = () => ({
    version: 0.6,
    generator: "mock-overpass",
    elements: [
      { type: "node", id: 1, lat: POI.lat, lon: POI.lng, tags: { name: POI.name, office: "company" } },
    ],
  });
  app.get("/overpass/interpreter", (c) => c.json(overpass()));
  app.post("/overpass/interpreter", (c) => c.json(overpass()));

  app.get("/tiles/:z/:x/:y", (c) => c.body(PNG_1x1, 200, { "content-type": "image/png" }));

  return app;
}
