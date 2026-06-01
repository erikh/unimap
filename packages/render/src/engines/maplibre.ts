import type { Attribution, BoundingBox } from "@unimap/core";
import {
  Emitter,
  type Camera,
  type Listener,
  type MapEvents,
  type MapViewOptions,
  type MarkerSpec,
  type PolylineSpec,
  type RenderEngine,
} from "../types";
import { loadModule } from "../load";

/* eslint-disable @typescript-eslint/no-explicit-any */

const OSM_ATTRIBUTION: Attribution = {
  provider: "osm",
  text: "© OpenStreetMap contributors",
  url: "https://www.openstreetmap.org/copyright",
};

export interface MapLibreEngineOptions {
  /** A MapLibre style URL/object. Overrides the built-in raster-OSM style. */
  style?: string | object;
  /** Raster XYZ template used by the built-in style. */
  tileUrl?: string;
  attribution?: Attribution[];
  /** Inject the maplibre-gl module instead of dynamically importing it. */
  maplibre?: any;
}

/**
 * The fully-open rendering backend: MapLibre GL + OSM/vector tiles. Provider
 * basemap tiles from Google/Apple are SDK-locked and never used here.
 */
export class MapLibreEngine implements RenderEngine {
  readonly id = "maplibre";
  private gl: any;
  private map: any;
  private readonly emitter = new Emitter<MapEvents>();
  private readonly markers = new Map<string, any>();
  private readonly lines = new Map<string, string>();
  private counter = 0;
  private readonly attrs: Attribution[];

  constructor(private readonly options: MapLibreEngineOptions = {}) {
    this.attrs = options.attribution ?? [OSM_ATTRIBUTION];
  }

  private defaultStyle(): object {
    const tiles = this.options.tileUrl ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    return {
      version: 8,
      sources: { osm: { type: "raster", tiles: [tiles], tileSize: 256, attribution: this.attrs[0]?.text } },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    };
  }

  async mount(container: HTMLElement, options: MapViewOptions): Promise<void> {
    const mod = this.options.maplibre ?? (await loadModule<any>("maplibre-gl"));
    this.gl = mod.default ?? mod;
    this.map = new this.gl.Map({
      container,
      style: options.style ?? this.options.style ?? this.defaultStyle(),
      center: options.center ? [options.center.lng, options.center.lat] : [0, 0],
      zoom: options.zoom ?? 1,
      bearing: options.bearing ?? 0,
      pitch: options.pitch ?? 0,
    });
    this.map.on("moveend", () => this.emitter.emit("moveend", { camera: this.getCamera() }));
    this.map.on("click", (e: any) =>
      this.emitter.emit("click", { location: { lat: e.lngLat.lat, lng: e.lngLat.lng } }),
    );
    await new Promise<void>((resolve) => this.map.once("load", () => resolve()));
    this.emitter.emit("ready", { camera: this.getCamera() });
  }

  setCamera(camera: Partial<Camera>): void {
    const opts: Record<string, unknown> = {};
    if (camera.center) opts["center"] = [camera.center.lng, camera.center.lat];
    if (camera.zoom != null) opts["zoom"] = camera.zoom;
    if (camera.bearing != null) opts["bearing"] = camera.bearing;
    if (camera.pitch != null) opts["pitch"] = camera.pitch;
    this.map.jumpTo(opts);
  }

  getCamera(): Camera {
    const center = this.map.getCenter();
    return {
      center: { lat: center.lat, lng: center.lng },
      zoom: this.map.getZoom(),
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch(),
    };
  }

  fitBounds(bounds: BoundingBox, padding = 40): void {
    this.map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding },
    );
  }

  addMarker(marker: MarkerSpec): string {
    const id = marker.id ?? `marker-${++this.counter}`;
    const m = new this.gl.Marker({ color: marker.color })
      .setLngLat([marker.location.lng, marker.location.lat])
      .addTo(this.map);
    if (marker.popupHtml) m.setPopup(new this.gl.Popup().setHTML(marker.popupHtml));
    m.getElement().addEventListener("click", () => this.emitter.emit("markerclick", { id }));
    this.markers.set(id, m);
    return id;
  }

  removeMarker(id: string): void {
    this.markers.get(id)?.remove();
    this.markers.delete(id);
  }

  addPolyline(line: PolylineSpec): string {
    const id = line.id ?? `line-${++this.counter}`;
    const key = `unimap-line-${id}`;
    this.map.addSource(key, {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: { type: "LineString", coordinates: line.path.map((p) => [p.lng, p.lat]) },
      },
    });
    this.map.addLayer({
      id: key,
      type: "line",
      source: key,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": line.color ?? "#2563eb", "line-width": line.width ?? 5 },
    });
    this.lines.set(id, key);
    return id;
  }

  removePolyline(id: string): void {
    const key = this.lines.get(id);
    if (key) {
      if (this.map.getLayer(key)) this.map.removeLayer(key);
      if (this.map.getSource(key)) this.map.removeSource(key);
    }
    this.lines.delete(id);
  }

  on<E extends keyof MapEvents>(event: E, listener: Listener<MapEvents[E]>): void {
    this.emitter.on(event, listener);
  }
  off<E extends keyof MapEvents>(event: E, listener: Listener<MapEvents[E]>): void {
    this.emitter.off(event, listener);
  }

  attributions(): Attribution[] {
    return [...this.attrs];
  }
  getNative(): unknown {
    return this.map;
  }
  destroy(): void {
    this.map?.remove();
    this.markers.clear();
    this.lines.clear();
  }
}
