import type { Attribution, BoundingBox, LatLng } from "@unimap/core";
import {
  Emitter,
  type Camera,
  type Listener,
  type MapEvents,
  type MapViewOptions,
  type MarkerSpec,
  type PolylineSpec,
  type RenderEngine,
} from "./types";

const DEFAULT_ATTRIBUTION: Attribution = {
  provider: "osm",
  text: "© OpenStreetMap contributors",
  url: "https://www.openstreetmap.org/copyright",
};

export interface FakeEngineOptions {
  id?: string;
  attributions?: Attribution[];
}

/**
 * In-memory RenderEngine used by tests and for SSR/headless contexts. Exercises
 * all of MapView's orchestration without a browser or any provider SDK, and
 * exposes `simulate*` helpers to drive events.
 */
export class FakeEngine implements RenderEngine {
  readonly id: string;
  mounted = false;
  private camera: Camera = { center: { lat: 0, lng: 0 }, zoom: 1, bearing: 0, pitch: 0 };
  private readonly markers = new Map<string, MarkerSpec>();
  private readonly polylines = new Map<string, PolylineSpec>();
  private readonly emitter = new Emitter<MapEvents>();
  private counter = 0;
  private readonly attrs: Attribution[];

  constructor(options: FakeEngineOptions = {}) {
    this.id = options.id ?? "fake";
    this.attrs = options.attributions ?? [DEFAULT_ATTRIBUTION];
  }

  async mount(_container: HTMLElement, options: MapViewOptions): Promise<void> {
    if (options.center) this.camera.center = options.center;
    if (options.zoom != null) this.camera.zoom = options.zoom;
    if (options.bearing != null) this.camera.bearing = options.bearing;
    if (options.pitch != null) this.camera.pitch = options.pitch;
    this.mounted = true;
    this.emitter.emit("ready", { camera: this.getCamera() });
  }

  setCamera(camera: Partial<Camera>): void {
    this.camera = { ...this.camera, ...camera };
    this.emitter.emit("moveend", { camera: this.getCamera() });
  }

  getCamera(): Camera {
    return { ...this.camera, center: { ...this.camera.center } };
  }

  fitBounds(bounds: BoundingBox): void {
    this.camera.center = {
      lat: (bounds.south + bounds.north) / 2,
      lng: (bounds.west + bounds.east) / 2,
    };
    this.emitter.emit("moveend", { camera: this.getCamera() });
  }

  addMarker(marker: MarkerSpec): string {
    const id = marker.id ?? `marker-${++this.counter}`;
    this.markers.set(id, { ...marker, id });
    return id;
  }

  removeMarker(id: string): void {
    this.markers.delete(id);
  }

  addPolyline(line: PolylineSpec): string {
    const id = line.id ?? `line-${++this.counter}`;
    this.polylines.set(id, { ...line, id });
    return id;
  }

  removePolyline(id: string): void {
    this.polylines.delete(id);
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

  getNative(): { camera: Camera; markers: Map<string, MarkerSpec>; polylines: Map<string, PolylineSpec> } {
    return { camera: this.camera, markers: this.markers, polylines: this.polylines };
  }

  destroy(): void {
    this.markers.clear();
    this.polylines.clear();
    this.mounted = false;
  }

  // --- test/dev helpers --------------------------------------------------
  listMarkers(): MarkerSpec[] {
    return [...this.markers.values()];
  }
  listPolylines(): PolylineSpec[] {
    return [...this.polylines.values()];
  }
  simulateClick(location: LatLng): void {
    this.emitter.emit("click", { location });
  }
  simulateMarkerClick(id: string): void {
    this.emitter.emit("markerclick", { id });
  }
}
