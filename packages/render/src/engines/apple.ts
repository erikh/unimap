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

/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    mapkit?: any;
  }
}

const APPLE_ATTRIBUTION: Attribution = {
  provider: "apple",
  text: "Data from Apple Maps",
  url: "https://www.apple.com/legal/internet-services/maps/terms-en.html",
};

const MAPKIT_SRC = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";
let scriptLoader: Promise<void> | null = null;

function loadMapKitScript(): Promise<void> {
  if (typeof window !== "undefined" && window.mapkit) return Promise.resolve();
  if (scriptLoader) return scriptLoader;
  scriptLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MAPKIT_SRC;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load MapKit JS"));
    document.head.appendChild(script);
  });
  return scriptLoader;
}

export interface AppleEngineOptions {
  /** Proxy endpoint that mints a MapKit JS token (e.g. /v1/auth/apple/mapkit-token). */
  tokenUrl?: string;
  /** Or supply a token directly / via callback. */
  token?: string;
  authorizationCallback?: (done: (token: string) => void) => void;
  fetchImpl?: typeof fetch;
}

/** Interactive Apple basemap via MapKit JS. The token is minted by the proxy. */
export class AppleEngine implements RenderEngine {
  readonly id = "apple";
  private mapkit: any;
  private map: any;
  private readonly emitter = new Emitter<MapEvents>();
  private readonly markers = new Map<string, any>();
  private readonly lines = new Map<string, any>();
  private counter = 0;

  constructor(private readonly options: AppleEngineOptions = {}) {}

  private authorizationCallback(): (done: (token: string) => void) => void {
    if (this.options.authorizationCallback) return this.options.authorizationCallback;
    const { token, tokenUrl, fetchImpl } = this.options;
    const rawFetch = fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
    const doFetch = rawFetch ? rawFetch.bind(globalThis) : undefined;
    return (done) => {
      if (token) return done(token);
      if (!tokenUrl || !doFetch) throw new Error("AppleEngine requires a token, tokenUrl, or authorizationCallback");
      void doFetch(tokenUrl)
        .then((r) => r.json())
        .then((d: { token: string }) => done(d.token));
    };
  }

  async mount(container: HTMLElement, options: MapViewOptions): Promise<void> {
    await loadMapKitScript();
    this.mapkit = window.mapkit;
    await new Promise<void>((resolve) => {
      this.mapkit.init({ authorizationCallback: this.authorizationCallback() });
      resolve();
    });
    this.map = new this.mapkit.Map(container);
    if (options.center) {
      this.map.center = new this.mapkit.Coordinate(options.center.lat, options.center.lng);
    }
    this.map.addEventListener("region-change-end", () =>
      this.emitter.emit("moveend", { camera: this.getCamera() }),
    );
    this.map.addEventListener("single-tap", (e: any) => {
      const point = this.map.convertPointOnPageToCoordinate(e.pointOnPage);
      this.emitter.emit("click", { location: { lat: point.latitude, lng: point.longitude } });
    });
    this.emitter.emit("ready", { camera: this.getCamera() });
  }

  setCamera(camera: Partial<Camera>): void {
    if (camera.center) this.map.center = new this.mapkit.Coordinate(camera.center.lat, camera.center.lng);
    if (camera.bearing != null) this.map.rotation = camera.bearing;
  }

  getCamera(): Camera {
    const center = this.map.center;
    return { center: { lat: center.latitude, lng: center.longitude }, zoom: 0, bearing: this.map.rotation ?? 0, pitch: 0 };
  }

  fitBounds(bounds: BoundingBox): void {
    const region = new this.mapkit.BoundingRegion(
      bounds.north,
      bounds.east,
      bounds.south,
      bounds.west,
    ).toCoordinateRegion();
    this.map.region = region;
  }

  addMarker(marker: MarkerSpec): string {
    const id = marker.id ?? `marker-${++this.counter}`;
    const annotation = new this.mapkit.MarkerAnnotation(
      new this.mapkit.Coordinate(marker.location.lat, marker.location.lng),
      { color: marker.color, title: marker.label },
    );
    annotation.addEventListener?.("select", () => this.emitter.emit("markerclick", { id }));
    this.map.addAnnotation(annotation);
    this.markers.set(id, annotation);
    return id;
  }

  removeMarker(id: string): void {
    const annotation = this.markers.get(id);
    if (annotation) this.map.removeAnnotation(annotation);
    this.markers.delete(id);
  }

  addPolyline(line: PolylineSpec): string {
    const id = line.id ?? `line-${++this.counter}`;
    const coords = line.path.map((p) => new this.mapkit.Coordinate(p.lat, p.lng));
    const overlay = new this.mapkit.PolylineOverlay(coords, {
      style: new this.mapkit.Style({ lineWidth: line.width ?? 5, strokeColor: line.color ?? "#2563eb" }),
    });
    this.map.addOverlay(overlay);
    this.lines.set(id, overlay);
    return id;
  }

  removePolyline(id: string): void {
    const overlay = this.lines.get(id);
    if (overlay) this.map.removeOverlay(overlay);
    this.lines.delete(id);
  }

  on<E extends keyof MapEvents>(event: E, listener: Listener<MapEvents[E]>): void {
    this.emitter.on(event, listener);
  }
  off<E extends keyof MapEvents>(event: E, listener: Listener<MapEvents[E]>): void {
    this.emitter.off(event, listener);
  }

  attributions(): Attribution[] {
    return [APPLE_ATTRIBUTION];
  }
  getNative(): unknown {
    return this.map;
  }
  destroy(): void {
    this.markers.clear();
    this.lines.clear();
    this.map?.destroy?.();
  }
}
