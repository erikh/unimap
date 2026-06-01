import type { Attribution, BoundingBox, LatLng } from "@unimap/core";

export interface Camera {
  center: LatLng;
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface MarkerSpec {
  /** Stable id; auto-assigned when omitted. */
  id?: string;
  location: LatLng;
  label?: string;
  color?: string;
  /** HTML rendered in a popup when the marker is clicked. */
  popupHtml?: string;
}

export interface PolylineSpec {
  /** Stable id; auto-assigned when omitted. */
  id?: string;
  /** Ordered points of the line (e.g. a decoded route polyline). */
  path: LatLng[];
  color?: string;
  width?: number;
}

export interface MapViewOptions {
  center?: LatLng;
  zoom?: number;
  /** Named style ("streets" | "satellite" | "dark") or a MapLibre style URL. */
  style?: string;
  bearing?: number;
  pitch?: number;
}

/**
 * Unified event payloads. Engines normalise their native events onto these.
 * A `type` (not an `interface`) so it satisfies the Emitter's
 * `Record<string, unknown>` constraint via its implicit index signature.
 */
export type MapEvents = {
  ready: { camera: Camera };
  click: { location: LatLng };
  moveend: { camera: Camera };
  markerclick: { id: string };
  error: { error: Error };
};

export type Listener<T> = (payload: T) => void;

/** Minimal typed event emitter shared by MapView and engines. */
export class Emitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<unknown>>>();

  on<E extends keyof Events>(event: E, listener: Listener<Events[E]>): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
  }

  off<E extends keyof Events>(event: E, listener: Listener<Events[E]>): void {
    this.listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  emit<E extends keyof Events>(event: E, payload: Events[E]): void {
    this.listeners.get(event)?.forEach((listener) => {
      (listener as Listener<Events[E]>)(payload);
    });
  }
}

/**
 * The contract every rendering backend implements. MapView programs against
 * this, never against Google/Apple/MapLibre directly.
 */
export interface RenderEngine {
  readonly id: string;
  mount(container: HTMLElement, options: MapViewOptions): Promise<void>;
  setCamera(camera: Partial<Camera>): void;
  getCamera(): Camera;
  fitBounds(bounds: BoundingBox, padding?: number): void;
  addMarker(marker: MarkerSpec): string;
  removeMarker(id: string): void;
  addPolyline(line: PolylineSpec): string;
  removePolyline(id: string): void;
  on<E extends keyof MapEvents>(event: E, listener: Listener<MapEvents[E]>): void;
  off<E extends keyof MapEvents>(event: E, listener: Listener<MapEvents[E]>): void;
  /** Required attributions to display (ToS + ODbL). */
  attributions(): Attribution[];
  /** Escape hatch to the underlying native map object. */
  getNative(): unknown;
  destroy(): void;
}

export type EngineFactory = () => RenderEngine;
