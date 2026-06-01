import { useMemo, useState } from "react";
import { createUnimapClient } from "@unimap/client";
import { MapCanvas, MapsProvider, useGeocode } from "@unimap/react";
import { MapLibreEngine, type MarkerSpec } from "@unimap/render";

const PROXY_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PROXY_URL ?? "http://localhost:8787";

function SearchPanel(): JSX.Element {
  const [input, setInput] = useState("1600 Amphitheatre Parkway");
  const [query, setQuery] = useState<{ query: string } | null>(null);
  const { data, loading, error } = useGeocode(query);

  const markers: MarkerSpec[] = (data ?? [])
    .filter((r) => r.location)
    .map((r, i) => ({ location: r.location, label: String(i + 1), popupHtml: r.address.formatted }));

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <aside style={{ width: 380, padding: 16, overflow: "auto", borderRight: "1px solid #ddd" }}>
        <h1 style={{ fontSize: 20 }}>UniMap demo</h1>
        <p style={{ color: "#666", fontSize: 13 }}>
          One interface over Google, Apple &amp; OpenStreetMap. Geocoding runs through the proxy; the
          basemap is MapLibre + OSM.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(input ? { query: input } : null);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search an address…"
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
          <button type="submit" style={{ marginTop: 8 }}>
            Search
          </button>
        </form>
        {loading && <p>Searching…</p>}
        {error && <p style={{ color: "crimson" }}>{error.message}</p>}
        <ul style={{ paddingLeft: 18 }}>
          {(data ?? []).map((r, i) => (
            <li key={i}>
              {r.address.formatted} <small style={{ color: "#888" }}>({r.attribution.provider})</small>
            </li>
          ))}
        </ul>
      </aside>
      <main style={{ flex: 1 }}>
        <MapCanvas
          engine={() => new MapLibreEngine()}
          options={{ center: { lat: 37.4224, lng: -122.0841 }, zoom: 9 }}
          markers={markers}
        />
      </main>
    </div>
  );
}

export function App(): JSX.Element {
  const client = useMemo(() => createUnimapClient({ baseUrl: PROXY_URL }), []);
  return (
    <MapsProvider client={client}>
      <SearchPanel />
    </MapsProvider>
  );
}
