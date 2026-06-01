import type { Attribution, BoundingBox } from "@unimap/core";
import type { Camera, Listener, MapEvents, MapViewOptions, MarkerSpec, RenderEngine } from "./types";

/**
 * The unified interactive map. Wraps any RenderEngine and exposes one stable
 * API for camera, markers, layers, and events — regardless of whether the
 * backend is MapLibre, Google Maps JS, or MapKit JS. Always able to surface the
 * engine's required attributions.
 */
export class MapView {
  private readonly markerIds = new Set<string>();

  private constructor(public readonly engine: RenderEngine) {}

  static async create(
    container: HTMLElement,
    engine: RenderEngine,
    options: MapViewOptions = {},
  ): Promise<MapView> {
    await engine.mount(container, options);
    return new MapView(engine);
  }

  /** Id of the active rendering backend, e.g. "maplibre" | "google" | "apple". */
  get providerId(): string {
    return this.engine.id;
  }

  setCamera(camera: Partial<Camera>): void {
    this.engine.setCamera(camera);
  }

  getCamera(): Camera {
    return this.engine.getCamera();
  }

  fitBounds(bounds: BoundingBox, padding?: number): void {
    this.engine.fitBounds(bounds, padding);
  }

  addMarker(marker: MarkerSpec): string {
    const id = this.engine.addMarker(marker);
    this.markerIds.add(id);
    return id;
  }

  removeMarker(id: string): void {
    this.engine.removeMarker(id);
    this.markerIds.delete(id);
  }

  clearMarkers(): void {
    for (const id of this.markerIds) this.engine.removeMarker(id);
    this.markerIds.clear();
  }

  get markerCount(): number {
    return this.markerIds.size;
  }

  on<E extends keyof MapEvents>(event: E, listener: Listener<MapEvents[E]>): void {
    this.engine.on(event, listener);
  }

  off<E extends keyof MapEvents>(event: E, listener: Listener<MapEvents[E]>): void {
    this.engine.off(event, listener);
  }

  attributions(): Attribution[] {
    return this.engine.attributions();
  }

  /** Native map object (google.maps.Map | mapkit.Map | maplibregl.Map). */
  getNative(): unknown {
    return this.engine.getNative();
  }

  destroy(): void {
    this.engine.destroy();
  }
}
