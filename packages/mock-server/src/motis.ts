import { Hono } from "hono";
import { encodePolyline, type LatLngTuple } from "@unimap/core";
import { scenarioOf } from "./scenarios";
import { GEO, DEST, ROUTE_PATH, TRANSIT } from "./fixtures";

/**
 * Mock of the MOTIS v6 trip-planning API (the engine behind the public,
 * keyless Transitous instance). Mirrors the real `/api/v6/plan` response shape
 * — itineraries of mixed-mode legs — so the OSM provider's transit adapter can
 * be exercised offline and deterministically.
 *
 * Geometry is encoded at precision 5 (and declared as such) so the adapter's
 * precision-aware decode path is honest; real MOTIS declares precision 7.
 */

type Times = { departure?: string; arrival?: string };

function place(name: string, [lat, lon]: LatLngTuple, times: Times = {}, stopId?: string): unknown {
  return {
    name,
    lat,
    lon,
    vertexType: stopId ? "TRANSIT" : "NORMAL",
    ...(stopId ? { stopId } : {}),
    ...(times.departure ? { departure: times.departure, scheduledDeparture: times.departure } : {}),
    ...(times.arrival ? { arrival: times.arrival, scheduledArrival: times.arrival } : {}),
  };
}

function geometry(points: LatLngTuple[]): unknown {
  const encoded = encodePolyline(points);
  return { points: encoded, length: points.length, precision: 5 };
}

/** The board point sits at the origin; the alight point at the destination. */
const BOARD: LatLngTuple = ROUTE_PATH[0]!;
const ALIGHT: LatLngTuple = ROUTE_PATH[2]!;
const ORIGIN: LatLngTuple = [GEO.lat + 0.002, GEO.lng + 0.002];
const TARGET: LatLngTuple = [DEST.lat - 0.002, DEST.lng - 0.002];

function motisPlan(): unknown {
  const t = TRANSIT;
  const walkAccess = {
    mode: "WALK",
    from: place("Origin", ORIGIN, { departure: t.departTime }),
    to: place(t.boardStop, BOARD, { arrival: t.boardTime }, "stop:board"),
    duration: t.walkSeconds,
    startTime: t.departTime,
    endTime: t.boardTime,
    legGeometry: geometry([ORIGIN, BOARD]),
  };
  const ride = {
    mode: "SUBURBAN",
    from: place(t.boardStop, BOARD, { departure: t.boardTime }, "stop:board"),
    to: place(t.alightStop, ALIGHT, { arrival: t.alightTime }, "stop:alight"),
    duration: t.rideSeconds,
    startTime: t.boardTime,
    endTime: t.alightTime,
    scheduledStartTime: t.boardTime,
    scheduledEndTime: t.alightTime,
    realTime: true,
    headsign: t.headsign,
    routeShortName: t.line,
    routeLongName: "",
    routeColor: t.color,
    routeTextColor: t.textColor,
    routeType: t.routeType,
    agencyName: t.agency,
    agencyId: "1",
    tripId: "trip:S7:0815",
    intermediateStops: [
      place("Midpoint", ROUTE_PATH[1]!, { arrival: "2026-01-01T08:15:00.000Z" }, "stop:mid"),
    ],
    legGeometry: geometry(ROUTE_PATH),
  };
  const walkEgress = {
    mode: "WALK",
    from: place(t.alightStop, ALIGHT, { departure: t.alightTime }, "stop:alight"),
    to: place("Destination", TARGET, { arrival: t.arriveTime }),
    duration: t.walkSeconds,
    startTime: t.alightTime,
    endTime: t.arriveTime,
    legGeometry: geometry([ALIGHT, TARGET]),
  };
  return {
    from: place("Origin", ORIGIN, { departure: t.departTime }),
    to: place("Destination", TARGET, { arrival: t.arriveTime }),
    direct: [],
    itineraries: [
      {
        id: "itin:0",
        duration: t.durationSeconds,
        startTime: t.departTime,
        endTime: t.arriveTime,
        transfers: 0,
        legs: [walkAccess, ride, walkEgress],
      },
    ],
  };
}

export function motisRoutes(): Hono {
  const app = new Hono();
  app.get("/api/v6/plan", (c) =>
    scenarioOf(c) === "empty" ? c.json({ itineraries: [] }) : c.json(motisPlan()),
  );
  return app;
}
