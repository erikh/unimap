import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import {
  boundsFromPoints,
  haversineMeters,
  polylineToLatLngs,
  type LatLng,
  type Leg,
  type Route,
  type TravelMode,
} from "@unimap/core";
import { createUnimapClient, normalizeGeocodeQuery } from "@unimap/client";
import { MapCanvas, MapLayout, MapsProvider, useMapsClient } from "@unimap/react";
import { MapLibreEngine, type MapView, type MarkerSpec, type PolylineSpec } from "@unimap/render";

const ENV = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
const PROXY_URL = ENV.VITE_PROXY_URL ?? "http://localhost:8787";
// Geofence for transit (km). Mirrors the proxy's TRANSIT_MAX_KM so we can warn
// before the round-trip; the proxy still enforces it server-side. 0 disables.
const TRANSIT_MAX_KM = Number(ENV.VITE_TRANSIT_MAX_KM ?? "100");

interface RouteState {
  loading?: boolean;
  error?: string;
  origin?: LatLng;
  destination?: LatLng;
  /** All returned options (transit can yield several); `selected` picks one. */
  routes?: Route[];
  selected?: number;
}

// Modes shown before the proxy reports what its providers can actually serve.
// TRANSIT appears once any routing provider serves it — including the keyless
// OSM tier via MOTIS (public Transitous), not just keyed providers.
const DEFAULT_MODES: TravelMode[] = ["DRIVE", "WALK", "BICYCLE"];

const MODE_ICON: Record<string, string> = {
  WALK: "🚶",
  BICYCLE: "🚲",
  DRIVE: "🚗",
  BUS: "🚌",
  TRAM: "🚊",
  SUBWAY: "🚇",
  RAIL: "🚆",
  FERRY: "⛴️",
  OTHER: "🚍",
};

function fmtTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const titleCase = (s: string): string => s[0] + s.slice(1).toLowerCase();

/** The transit lines a route rides, in order — for compact option summaries. */
function routeLines(route: Route): { icon: string; label: string; color?: string; agency?: string }[] {
  return route.legs
    .filter((l) => l.transit)
    .map((l) => ({
      icon: MODE_ICON[l.mode ?? "OTHER"] ?? "•",
      label: l.transit!.line ?? titleCase(l.mode ?? "Transit"),
      color: l.transit!.color,
      agency: l.transit!.agency,
    }));
}

const firstDeparture = (route: Route): string | undefined =>
  route.legs.find((l) => l.transit?.departureTime)?.transit?.departureTime;
const lastArrival = (route: Route): string | undefined =>
  [...route.legs].reverse().find((l) => l.transit?.arrivalTime)?.transit?.arrivalTime;

function LineChip({ label, color }: { label: string; color?: string }): JSX.Element {
  return (
    <span
      style={{
        background: color ? `#${color}` : "#444",
        color: "#fff",
        borderRadius: 4,
        padding: "0 5px",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

// One row per leg: transit legs show a coloured line chip + headsign + times;
// road legs (walk/bike/drive) show a mode + duration/distance summary.
function LegRow({ leg }: { leg: Leg }): JSX.Element {
  const icon = MODE_ICON[leg.mode ?? "OTHER"] ?? "•";
  const t = leg.transit;
  return (
    <li style={{ listStyle: "none", display: "flex", gap: 8, alignItems: "baseline", margin: "8px 0" }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 13 }}>
        {t ? (
          <>
            <span
              style={{
                background: t.color ? `#${t.color}` : "#444",
                color: "#fff",
                borderRadius: 4,
                padding: "1px 6px",
                fontWeight: 600,
              }}
            >
              {t.line ?? titleCase(leg.mode ?? "Transit")}
            </span>{" "}
            {t.headsign && <span style={{ color: "#555" }}>→ {t.headsign}</span>}
            <div style={{ color: "#999", fontSize: 12 }}>
              {fmtTime(t.departureTime)}
              {t.arrivalTime && `–${fmtTime(t.arrivalTime)}`}
              {t.numStops != null && ` · ${t.numStops + 1} stops`}
              {t.agency && ` · ${t.agency}`}
            </div>
          </>
        ) : (
          <>
            {titleCase(leg.mode ?? "Leg")} · {Math.round(leg.durationSeconds / 60)} min{" "}
            <span style={{ color: "#999" }}>({(leg.distanceMeters / 1000).toFixed(1)} km)</span>
          </>
        )}
      </span>
    </li>
  );
}

function DirectionsPanel(): JSX.Element {
  const client = useMapsClient();
  const [from, setFrom] = useState("1600 Amphitheatre Parkway, Mountain View");
  const [to, setTo] = useState("Ferry Building, San Francisco");
  const [mode, setMode] = useState<TravelMode>("DRIVE");
  const [modes, setModes] = useState<TravelMode[]>(DEFAULT_MODES);
  const [state, setState] = useState<RouteState>({});
  const viewRef = useRef<MapView | null>(null);

  // Ask the proxy which travel modes its providers can actually serve, so we
  // never offer a mode (e.g. TRANSIT on an OSRM-only deployment) that errors.
  useEffect(() => {
    let cancelled = false;
    client
      .routingModes()
      .then((available) => {
        if (cancelled || available.length === 0) return;
        setModes(available);
        setMode((current) => (available.includes(current) ? current : available[0]));
      })
      .catch(() => {
        /* keep DEFAULT_MODES if the proxy can't be reached */
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function getDirections(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setState({ loading: true });
    try {
      const [origin] = await client.geocode({ query: normalizeGeocodeQuery(from) });
      const [destination] = await client.geocode({ query: normalizeGeocodeQuery(to) });
      if (!origin || !destination) {
        setState({ error: "Could not geocode one of the endpoints." });
        return;
      }
      // Geofence transit before the round-trip: a wildly distant pair is almost
      // always a misgeocode (an address that resolved to the wrong place).
      if (mode === "TRANSIT" && TRANSIT_MAX_KM > 0) {
        const km = haversineMeters(origin.location, destination.location) / 1000;
        if (km > TRANSIT_MAX_KM) {
          setState({
            error: `Transit is limited to ${TRANSIT_MAX_KM} km, but these points are ${Math.round(
              km,
            )} km apart — check the addresses.`,
          });
          return;
        }
      }
      const { routes } = await client.route({
        origin: origin.location,
        destination: destination.location,
        travelMode: mode,
        waypoints: [],
        alternatives: true,
        avoid: [],
      });
      setState({ origin: origin.location, destination: destination.location, routes, selected: 0 });
    } catch (err) {
      setState({ error: (err as Error).message });
    }
  }

  const selected = state.selected ?? 0;
  const route = state.routes?.[selected];
  const path = useMemo(
    () => (route?.polyline ? polylineToLatLngs(route.polyline) : []),
    [route?.polyline],
  );

  // Fit the map to the selected route whenever it changes.
  useEffect(() => {
    if (viewRef.current && path.length > 1) {
      viewRef.current.fitBounds(boundsFromPoints(path), 60);
    }
  }, [path]);

  const markers: MarkerSpec[] = [];
  if (state.origin) markers.push({ location: state.origin, label: "A" });
  if (state.destination) markers.push({ location: state.destination, label: "B" });

  const polylines: PolylineSpec[] =
    path.length > 1 ? [{ path, color: "#2563eb", width: 5 }] : [];

  const steps = route?.legs.flatMap((leg) => leg.steps) ?? [];
  const isTransit = route?.legs.some((leg) => leg.transit) ?? false;

  const sidebar = (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>UniMap directions</h1>
      <p style={{ color: "#666", fontSize: 13 }}>
        Directions across Google / Apple / OpenStreetMap behind one interface. Routing + geocoding run
        through the proxy; the basemap is MapLibre + OSM.
      </p>
      <form onSubmit={getDirections}>
        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="From…"
          style={{ width: "100%", padding: 8, boxSizing: "border-box", marginBottom: 6 }}
        />
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="To…"
          style={{ width: "100%", padding: 8, boxSizing: "border-box", marginBottom: 6 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <select value={mode} onChange={(e) => setMode(e.target.value as TravelMode)} style={{ flex: 1 }}>
            {modes.map((m) => (
              <option key={m} value={m}>
                {m[0] + m.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <button type="submit">Directions</button>
        </div>
      </form>

      {state.loading && <p>Routing…</p>}
      {state.error && <p style={{ color: "crimson" }}>{state.error}</p>}

      {route && (
        <>
          {state.routes && state.routes.length > 1 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                {state.routes.length} options
              </div>
              {state.routes.map((r, i) => {
                const lines = routeLines(r);
                const agencies = [...new Set(lines.map((l) => l.agency).filter(Boolean))];
                const dep = firstDeparture(r);
                const arr = lastArrival(r);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setState((s) => ({ ...s, selected: i }))}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      border: `1px solid ${i === selected ? "#2563eb" : "#ddd"}`,
                      background: i === selected ? "#eff6ff" : "#fff",
                      borderRadius: 6,
                      padding: "8px 10px",
                      marginBottom: 6,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {lines.length === 0 && <span style={{ fontSize: 13 }}>Direct</span>}
                      {lines.map((ln, j) => (
                        <span key={j} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                          {j > 0 && <span style={{ color: "#bbb" }}>→</span>}
                          <span>{ln.icon}</span>
                          <LineChip label={ln.label} color={ln.color} />
                        </span>
                      ))}
                    </div>
                    <div style={{ color: "#666", fontSize: 12, marginTop: 3 }}>
                      <b>{Math.round(r.durationSeconds / 60)} min</b>
                      {dep && ` · ${fmtTime(dep)}–${fmtTime(arr)}`}
                      {agencies.length > 0 && ` · ${agencies.join(", ")}`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <p style={{ marginTop: 16 }}>
            <b>{(route.distanceMeters / 1000).toFixed(1)} km</b> ·{" "}
            {Math.round(route.durationSeconds / 60)} min{" "}
            <small style={{ color: "#888" }}>[{route.attribution.provider}]</small>
          </p>
          {isTransit ? (
            <ul style={{ paddingLeft: 0, margin: 0 }}>
              {route.legs.map((leg, i) => (
                <LegRow key={i} leg={leg} />
              ))}
            </ul>
          ) : (
            <ol style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
              {steps.map((s, i) => (
                <li key={i}>
                  {s.maneuver?.instruction ?? "Continue"}{" "}
                  <span style={{ color: "#999" }}>({Math.round(s.distanceMeters)} m)</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );

  return (
    <MapLayout sidebar={sidebar}>
      <MapCanvas
        engine={() => new MapLibreEngine({ maplibre: maplibregl, customAttribution: "Combined with UniMap" })}
        options={{ center: { lat: 37.6, lng: -122.2 }, zoom: 9 }}
        markers={markers}
        polylines={polylines}
        onReady={(view) => {
          viewRef.current = view;
        }}
      />
    </MapLayout>
  );
}

export function App(): JSX.Element {
  const client = useMemo(() => createUnimapClient({ baseUrl: PROXY_URL }), []);
  return (
    <MapsProvider client={client}>
      <DirectionsPanel />
    </MapsProvider>
  );
}
