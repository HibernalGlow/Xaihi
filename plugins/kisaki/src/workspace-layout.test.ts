import { describe, expect, test } from "vitest";
import {
  KISAKI_WORKSPACE_DEFAULTS,
  normalizeKisakiWorkspaceLayout,
  updateKisakiWorkspaceLayout,
} from "./workspace-layout.js";

describe("Kisaki workspace layout", () => {
  test("creates independent defaults and rejects unknown versions", () => {
    const first = normalizeKisakiWorkspaceLayout(undefined);
    const second = normalizeKisakiWorkspaceLayout({ version: 2 } as never);
    expect(first).toEqual(KISAKI_WORKSPACE_DEFAULTS);
    expect(second).toEqual(KISAKI_WORKSPACE_DEFAULTS);
    expect(first).not.toBe(KISAKI_WORKSPACE_DEFAULTS);
  });

  test("clamps widths and preserves panel minimization", () => {
    expect(
      normalizeKisakiWorkspaceLayout({
        version: 1,
        toolRailWidth: 999,
      sourcePanelWidth: 1,
      resultPanelWidth: 2000,
        analysisPanelWidth: 410,
        sourcePanelMinimized: true,
      }),
    ).toMatchObject({
      toolRailWidth: 260,
      sourcePanelWidth: 220,
      resultPanelWidth: 1200,
      analysisPanelWidth: 410,
      sourcePanelMinimized: true,
    });
    expect(
      updateKisakiWorkspaceLayout(KISAKI_WORKSPACE_DEFAULTS, {
        analysisPanelMinimized: true,
        analysisPanelWidth: 480,
      }),
    ).toMatchObject({ analysisPanelMinimized: true, analysisPanelWidth: 480 });
  });

  test("normalizes and persists lane ordering", () => {
    expect(normalizeKisakiWorkspaceLayout({ version: 1, laneOrder: ["analysis", "source"] })).toMatchObject({
      laneOrder: ["analysis", "source", "results"],
    });
    expect(updateKisakiWorkspaceLayout(KISAKI_WORKSPACE_DEFAULTS, { laneOrder: ["results", "analysis", "source"] }).laneOrder).toEqual(["results", "analysis", "source"]);
  });

  test("normalizes shared swimlane focus and bar preferences", () => {
    expect(normalizeKisakiWorkspaceLayout({
      version: 1,
      activeLane: "analysis",
      soloLane: "analysis",
      focusOnHover: true,
      soloOnFocus: true,
      showNavigatorInSolo: false,
      focusDelayMs: 10,
      edgeRevealDelayMs: 9000,
      barHandleStyle: "groove",
      barHandlePosition: "right",
      navigatorPositionX: 72,
      navigatorPositionY: 88,
      navigatorDock: "title" as never,
      navigatorLane: "source",
      navigatorFollowsFocus: true,
      autoFitToViewport: true,
    })).toMatchObject({
      activeLane: "analysis",
      soloLane: "analysis",
      focusOnHover: true,
      soloOnFocus: true,
      showNavigatorInSolo: false,
      focusDelayMs: 200,
      edgeRevealDelayMs: 5000,
      barHandleStyle: "groove",
      barHandlePosition: "right",
      navigatorPositionX: 72,
      navigatorPositionY: 88,
      navigatorDock: "top",
      navigatorLane: "source",
      navigatorFollowsFocus: true,
      autoFitToViewport: true,
    });
  });
});
