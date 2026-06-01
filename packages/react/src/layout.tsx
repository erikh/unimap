import type { CSSProperties, ReactNode } from "react";

export interface MapLayoutProps {
  /** Fixed-width panel on the left. */
  sidebar: ReactNode;
  /** The map area; fills the remaining space. */
  children: ReactNode;
  sidebarWidth?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Split layout: a fixed-width sidebar + a flexible map area.
 *
 * Encodes the flexbox rules that stop the sidebar from collapsing when a map
 * canvas mounts next to it: the sidebar is `flex-shrink: 0` (keeps its width)
 * and the map area is `min-width: 0` (allowed to shrink instead of overflowing
 * and squeezing the sidebar to zero). The parent must have a height.
 */
export function MapLayout({
  sidebar,
  children,
  sidebarWidth = 400,
  className,
  style,
}: MapLayoutProps): JSX.Element {
  return (
    <div className={className} style={{ display: "flex", height: "100%", overflow: "hidden", ...style }}>
      <aside
        data-unimap="sidebar"
        style={{ width: sidebarWidth, flexShrink: 0, height: "100%", overflow: "auto", boxSizing: "border-box" }}
      >
        {sidebar}
      </aside>
      <main data-unimap="map" style={{ flex: 1, minWidth: 0, height: "100%", position: "relative" }}>
        {children}
      </main>
    </div>
  );
}
