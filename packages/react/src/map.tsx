import { useEffect, useRef, type CSSProperties } from "react";
import type { LatLng } from "@unimap/core";
import { MapView, type MapViewOptions, type MarkerSpec, type RenderEngine } from "@unimap/render";

export interface MapCanvasProps {
  /** A render engine instance or factory (MapLibreEngine / GoogleEngine / AppleEngine). */
  engine: RenderEngine | (() => RenderEngine);
  options?: MapViewOptions;
  markers?: MarkerSpec[];
  className?: string;
  style?: CSSProperties;
  onReady?: (view: MapView) => void;
  onClick?: (location: LatLng) => void;
}

/** Mounts a unified MapView into a div and keeps its markers in sync with props. */
export function MapCanvas(props: MapCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    const engine = typeof props.engine === "function" ? props.engine() : props.engine;
    void MapView.create(container, engine, props.options ?? {}).then((view) => {
      if (disposed) {
        view.destroy();
        return;
      }
      viewRef.current = view;
      if (props.onClick) view.on("click", (payload) => props.onClick?.(payload.location));
      props.onReady?.(view);
      for (const marker of props.markers ?? []) view.addMarker(marker);
    });
    return () => {
      disposed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.clearMarkers();
    for (const marker of props.markers ?? []) view.addMarker(marker);
  }, [props.markers]);

  return (
    <div
      ref={containerRef}
      className={props.className}
      style={{ width: "100%", height: "100%", ...props.style }}
    />
  );
}
