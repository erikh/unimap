import type { Attribution, BoundingBox } from "@unimap/core";
import {
  Emitter,
  type Camera,
  type Listener,
  type MapEvents,
  type MapViewOptions,
  type MarkerSpec,
  type RenderEngine,
} from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    google?: any;
    __unimapGoogleCallback?: () => void;
  }
}

const GOOGLE_ATTRIBUTION: Attribution = {
  provider: "google",
  text: "Map data ©Google",
  url: "https://www.google.com/maps",
};

let googleLoader: Promise<any> | null = null;

/** Inject the Google Maps JS API exactly once. Uses a referrer-restricted browser key. */
function loadGoogleMaps(apiKey: string, version = "weekly"): Promise<any> {
  if (typeof window !== "undefined" && window.google?.maps) return Promise.resolve(window.google);
  if (googleLoader) return googleLoader;
  googleLoader = new Promise<any>((resolve, reject) => {
    window.__unimapGoogleCallback = () => resolve(window.google);
    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&v=${version}&callback=__unimapGoogleCallback`;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Google Maps JS API"));
    document.head.appendChild(script);
  });
  return googleLoader;
}

export interface GoogleEngineOptions {
  /** Referrer-restricted browser key (fetch from the proxy bootstrap, never a server key). */
  apiKey: string;
  version?: string;
  /** Inject the `google` global instead of loading the script (tests). */
  google?: any;
}

/** Interactive Google basemap via the Maps JS API (tiles stay inside the SDK). */
export class GoogleEngine implements RenderEngine {
  readonly id = "google";
  private g: any;
  private map: any;
  private readonly emitter = new Emitter<MapEvents>();
  private readonly markers = new Map<string, any>();
  private counter = 0;

  constructor(private readonly options: GoogleEngineOptions) {}

  async mount(container: HTMLElement, options: MapViewOptions): Promise<void> {
    this.g = this.options.google ?? (await loadGoogleMaps(this.options.apiKey, this.options.version));
    this.map = new this.g.maps.Map(container, {
      center: options.center ? { lat: options.center.lat, lng: options.center.lng } : { lat: 0, lng: 0 },
      zoom: options.zoom ?? 2,
      heading: options.bearing,
      tilt: options.pitch,
    });
    this.map.addListener("click", (e: any) =>
      this.emitter.emit("click", { location: { lat: e.latLng.lat(), lng: e.latLng.lng() } }),
    );
    this.map.addListener("idle", () => this.emitter.emit("moveend", { camera: this.getCamera() }));
    this.emitter.emit("ready", { camera: this.getCamera() });
  }

  setCamera(camera: Partial<Camera>): void {
    if (camera.center) this.map.setCenter({ lat: camera.center.lat, lng: camera.center.lng });
    if (camera.zoom != null) this.map.setZoom(camera.zoom);
    if (camera.bearing != null) this.map.setHeading(camera.bearing);
    if (camera.pitch != null) this.map.setTilt(camera.pitch);
  }

  getCamera(): Camera {
    const center = this.map.getCenter();
    return {
      center: { lat: center.lat(), lng: center.lng() },
      zoom: this.map.getZoom() ?? 0,
      bearing: this.map.getHeading?.() ?? 0,
      pitch: this.map.getTilt?.() ?? 0,
    };
  }

  fitBounds(bounds: BoundingBox, padding = 40): void {
    this.map.fitBounds(
      { north: bounds.north, south: bounds.south, east: bounds.east, west: bounds.west },
      padding,
    );
  }

  addMarker(marker: MarkerSpec): string {
    const id = marker.id ?? `marker-${++this.counter}`;
    const gMarker = new this.g.maps.Marker({
      position: { lat: marker.location.lat, lng: marker.location.lng },
      label: marker.label,
      map: this.map,
    });
    gMarker.addListener("click", () => this.emitter.emit("markerclick", { id }));
    this.markers.set(id, gMarker);
    return id;
  }

  removeMarker(id: string): void {
    this.markers.get(id)?.setMap(null);
    this.markers.delete(id);
  }

  on<E extends keyof MapEvents>(event: E, listener: Listener<MapEvents[E]>): void {
    this.emitter.on(event, listener);
  }
  off<E extends keyof MapEvents>(event: E, listener: Listener<MapEvents[E]>): void {
    this.emitter.off(event, listener);
  }

  attributions(): Attribution[] {
    return [GOOGLE_ATTRIBUTION];
  }
  getNative(): unknown {
    return this.map;
  }
  destroy(): void {
    this.markers.forEach((m) => m.setMap(null));
    this.markers.clear();
  }
}
