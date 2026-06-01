import { describe, expect, it } from "vitest";
import { FakeEngine, MapView } from "@unimap/render";
import type { LatLng } from "@unimap/core";

const container = {} as unknown as HTMLElement;

describe("MapView orchestration (engine-agnostic)", () => {
  it("mounts the engine and applies the initial camera", async () => {
    const engine = new FakeEngine();
    const view = await MapView.create(container, engine, { center: { lat: 37.4, lng: -122 }, zoom: 10 });
    expect(engine.mounted).toBe(true);
    expect(view.providerId).toBe("fake");
    expect(view.getCamera().center.lat).toBeCloseTo(37.4);
    expect(view.getCamera().zoom).toBe(10);
  });

  it("adds, removes, and clears markers", async () => {
    const engine = new FakeEngine();
    const view = await MapView.create(container, engine, {});
    const id = view.addMarker({ location: { lat: 1, lng: 2 }, label: "A" });
    expect(view.markerCount).toBe(1);
    expect(engine.listMarkers()[0]!.id).toBe(id);
    view.removeMarker(id);
    expect(view.markerCount).toBe(0);
    view.addMarker({ location: { lat: 1, lng: 1 } });
    view.addMarker({ location: { lat: 2, lng: 2 } });
    view.clearMarkers();
    expect(view.markerCount).toBe(0);
    expect(engine.listMarkers()).toHaveLength(0);
  });

  it("forwards normalized click events", async () => {
    const engine = new FakeEngine();
    const view = await MapView.create(container, engine, {});
    const clicks: LatLng[] = [];
    view.on("click", (p) => clicks.push(p.location));
    engine.simulateClick({ lat: 5, lng: 6 });
    expect(clicks).toEqual([{ lat: 5, lng: 6 }]);
  });

  it("fitBounds centers the camera on the box", async () => {
    const engine = new FakeEngine();
    const view = await MapView.create(container, engine, {});
    view.fitBounds({ south: 0, west: 0, north: 10, east: 20 });
    expect(view.getCamera().center).toEqual({ lat: 5, lng: 10 });
  });

  it("always exposes the engine's required attributions", async () => {
    const engine = new FakeEngine({
      id: "google",
      attributions: [{ provider: "google", text: "Map data ©Google" }],
    });
    const view = await MapView.create(container, engine, {});
    expect(view.providerId).toBe("google");
    expect(view.attributions()[0]!.text).toMatch(/Google/);
  });
});
