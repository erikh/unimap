import { Hono } from "hono";
import { encodePolyline, type LatLngTuple } from "@unimap/core";
import { scenarioOf } from "./scenarios";
import { GEO, DEST, ROUTE_PATH, TRANSIT } from "./fixtures";

/**
 * Mock of the MOTIS v6 trip-planning API (the engine behind the public,
 * keyless Transitous instance). Mirrors the real `/api/v6/plan` response shape
 * — a list of itineraries, each a sequence of mixed-mode legs — so the OSM
 * provider's transit adapter can be exercised offline and deterministically.
 *
 * We return TWO itineraries (a fast S-Bahn option and a slower U-Bahn option)
 * so multi-option transit can be developed and tested. Geometry is encoded at
 * precision 5 (and declared as such); real MOTIS declares precision 7.
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
  return { points: encodePolyline(points), length: points.length, precision: 5 };
}

const BOARD: LatLngTuple = ROUTE_PATH[0]!;
const ALIGHT: LatLngTuple = ROUTE_PATH[2]!;
const ORIGIN: LatLngTuple = [GEO.lat + 0.002, GEO.lng + 0.002];
const TARGET: LatLngTuple = [DEST.lat - 0.002, DEST.lng - 0.002];

interface Option {
  id: string;
  mode: string;
  line: string;
  headsign: string;
  agency: string;
  color: string;
  textColor: string;
  routeType: number;
  tripId: string;
  departTime: string;
  boardTime: string;
  alightTime: string;
  arriveTime: string;
  walkSeconds: number;
  rideSeconds: number;
}

/** Two deterministic options: the canonical S7 (fixtures) and a slower U5. */
const OPTIONS: Option[] = [
  {
    id: "itin:0",
    mode: "SUBURBAN",
    line: TRANSIT.line,
    headsign: TRANSIT.headsign,
    agency: TRANSIT.agency,
    color: TRANSIT.color,
    textColor: TRANSIT.textColor,
    routeType: TRANSIT.routeType,
    tripId: "trip:S7:0815",
    departTime: TRANSIT.departTime,
    boardTime: TRANSIT.boardTime,
    alightTime: TRANSIT.alightTime,
    arriveTime: TRANSIT.arriveTime,
    walkSeconds: TRANSIT.walkSeconds,
    rideSeconds: TRANSIT.rideSeconds,
  },
  {
    id: "itin:1",
    mode: "SUBWAY",
    line: "U5",
    headsign: "Hönow",
    agency: "Berliner Verkehrsbetriebe",
    color: "7e5330",
    textColor: "ffffff",
    routeType: 1,
    tripId: "trip:U5:0820",
    departTime: "2026-01-01T08:02:00.000Z",
    boardTime: "2026-01-01T08:09:00.000Z",
    alightTime: "2026-01-01T08:31:00.000Z",
    arriveTime: "2026-01-01T08:38:00.000Z",
    walkSeconds: 420,
    rideSeconds: 1_320,
  },
  // A later, slower S7 departure — same line/mode signature as itin:0, so the
  // adapter's dedup must collapse the two (keeping the faster itin:0).
  {
    id: "itin:2",
    mode: "SUBURBAN",
    line: TRANSIT.line,
    headsign: TRANSIT.headsign,
    agency: TRANSIT.agency,
    color: TRANSIT.color,
    textColor: TRANSIT.textColor,
    routeType: TRANSIT.routeType,
    tripId: "trip:S7:0825",
    departTime: "2026-01-01T08:10:00.000Z",
    boardTime: "2026-01-01T08:15:00.000Z",
    alightTime: "2026-01-01T08:39:00.000Z",
    arriveTime: "2026-01-01T08:44:00.000Z",
    walkSeconds: TRANSIT.walkSeconds,
    rideSeconds: 1_440,
  },
];

function itinerary(o: Option): unknown {
  const totalSeconds = o.walkSeconds * 2 + o.rideSeconds;
  const walkAccess = {
    mode: "WALK",
    from: place("Origin", ORIGIN, { departure: o.departTime }),
    to: place(TRANSIT.boardStop, BOARD, { arrival: o.boardTime }, "stop:board"),
    duration: o.walkSeconds,
    startTime: o.departTime,
    endTime: o.boardTime,
    legGeometry: geometry([ORIGIN, BOARD]),
  };
  const ride = {
    mode: o.mode,
    from: place(TRANSIT.boardStop, BOARD, { departure: o.boardTime }, "stop:board"),
    to: place(TRANSIT.alightStop, ALIGHT, { arrival: o.alightTime }, "stop:alight"),
    duration: o.rideSeconds,
    startTime: o.boardTime,
    endTime: o.alightTime,
    scheduledStartTime: o.boardTime,
    scheduledEndTime: o.alightTime,
    realTime: true,
    headsign: o.headsign,
    routeShortName: o.line,
    routeLongName: "",
    routeColor: o.color,
    routeTextColor: o.textColor,
    routeType: o.routeType,
    agencyName: o.agency,
    agencyId: "1",
    tripId: o.tripId,
    intermediateStops: [
      place("Midpoint", ROUTE_PATH[1]!, { arrival: "2026-01-01T08:15:00.000Z" }, "stop:mid"),
    ],
    legGeometry: geometry(ROUTE_PATH),
  };
  const walkEgress = {
    mode: "WALK",
    from: place(TRANSIT.alightStop, ALIGHT, { departure: o.alightTime }, "stop:alight"),
    to: place("Destination", TARGET, { arrival: o.arriveTime }),
    duration: o.walkSeconds,
    startTime: o.alightTime,
    endTime: o.arriveTime,
    legGeometry: geometry([ALIGHT, TARGET]),
  };
  return {
    id: o.id,
    duration: totalSeconds,
    startTime: o.departTime,
    endTime: o.arriveTime,
    transfers: 0,
    legs: [walkAccess, ride, walkEgress],
  };
}

function motisPlan(): unknown {
  return {
    from: place("Origin", ORIGIN, { departure: OPTIONS[0]!.departTime }),
    to: place("Destination", TARGET, { arrival: OPTIONS[0]!.arriveTime }),
    direct: [],
    itineraries: OPTIONS.map(itinerary),
  };
}

export function motisRoutes(): Hono {
  const app = new Hono();
  app.get("/api/v6/plan", (c) =>
    scenarioOf(c) === "empty" ? c.json({ itineraries: [] }) : c.json(motisPlan()),
  );
  return app;
}
