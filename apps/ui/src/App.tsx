import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import {
  boundsFromPoints,
  polylineToLatLngs,
  type LatLng,
  type Route,
  type TravelMode,
} from "@unimap/core";
import { createUnimapClient } from "@unimap/client";
import { MapCanvas, MapLayout, MapsProvider, useMapsClient } from "@unimap/react";
import { MapLibreEngine, type MapView, type MarkerSpec, type PolylineSpec } from "@unimap/render";

const PROXY_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PROXY_URL ?? "http://localhost:8787";

interface RouteState {
  loading?: boolean;
  error?: string;
  origin?: LatLng;
  destination?: LatLng;
  path?: LatLng[];
  route?: Route;
}

// Modes shown before the proxy reports what its providers can actually serve.
// TRANSIT only appears once a transit-capable provider (e.g. Google) is configured.
const DEFAULT_MODES: TravelMode[] = ["DRIVE", "WALK", "BICYCLE"];

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
      const [origin] = await client.geocode({ query: from });
      const [destination] = await client.geocode({ query: to });
      if (!origin || !destination) {
        setState({ error: "Could not geocode one of the endpoints." });
        return;
      }
      const { routes } = await client.route({
        origin: origin.location,
        destination: destination.location,
        travelMode: mode,
        waypoints: [],
        alternatives: false,
        avoid: [],
      });
      const route = routes[0];
      const path = route?.polyline ? polylineToLatLngs(route.polyline) : [];
      setState({ origin: origin.location, destination: destination.location, path, route });
    } catch (err) {
      setState({ error: (err as Error).message });
    }
  }

  // Fit the map to the route whenever a new one arrives.
  useEffect(() => {
    if (viewRef.current && state.path && state.path.length > 1) {
      viewRef.current.fitBounds(boundsFromPoints(state.path), 60);
    }
  }, [state.path]);

  const markers: MarkerSpec[] = [];
  if (state.origin) markers.push({ location: state.origin, label: "A" });
  if (state.destination) markers.push({ location: state.destination, label: "B" });

  const polylines: PolylineSpec[] =
    state.path && state.path.length > 1 ? [{ path: state.path, color: "#2563eb", width: 5 }] : [];

  const steps = state.route?.legs.flatMap((leg) => leg.steps) ?? [];

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

      {state.route && (
        <>
          <p style={{ marginTop: 16 }}>
            <b>{(state.route.distanceMeters / 1000).toFixed(1)} km</b> ·{" "}
            {Math.round(state.route.durationSeconds / 60)} min{" "}
            <small style={{ color: "#888" }}>[{state.route.attribution.provider}]</small>
          </p>
          <ol style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
            {steps.map((s, i) => (
              <li key={i}>
                {s.maneuver?.instruction ?? "Continue"}{" "}
                <span style={{ color: "#999" }}>({Math.round(s.distanceMeters)} m)</span>
              </li>
            ))}
          </ol>
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
