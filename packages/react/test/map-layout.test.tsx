// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MapLayout } from "@unimap/react";

afterEach(() => cleanup());

describe("MapLayout flex contract (regression: sidebar must not collapse next to a map)", () => {
  it("pins the sidebar width and lets the map area shrink", () => {
    const { container } = render(
      <MapLayout sidebar={<div>panel</div>} sidebarWidth={400}>
        <div>map</div>
      </MapLayout>,
    );
    const sidebar = container.querySelector('[data-unimap="sidebar"]') as HTMLElement;
    const map = container.querySelector('[data-unimap="map"]') as HTMLElement;

    expect(sidebar).not.toBeNull();
    expect(map).not.toBeNull();
    // The fix: sidebar never shrinks, map is allowed to.
    expect(sidebar.style.flexShrink).toBe("0");
    expect(sidebar.style.width).toBe("400px");
    expect(Number.parseFloat(map.style.minWidth)).toBe(0); // "0" or "0px" — must be zero, not "auto"
  });
});
