import { describe, expect, test } from "vitest";
import {
  KISAKI_STATE_VERSION,
  kisakiStateMigrationPatch,
  normalizeKisakiCardState,
} from "./state";

describe("Kisaki node state migration", () => {
  test("upgrades legacy state without losing user settings", () => {
    const legacy = {
      tool: "similar-images" as const,
      includedDirectoriesText: "D:/Photos",
      dryRun: false,
    };
    const value = normalizeKisakiCardState(legacy);
    expect(value).toMatchObject({
      ...legacy,
      schemaVersion: KISAKI_STATE_VERSION,
      cardLayout: { version: 1 },
      workspaceLayout: { version: 1 },
    });
    expect(kisakiStateMigrationPatch(legacy)).toMatchObject({
      schemaVersion: KISAKI_STATE_VERSION,
      cardLayout: { version: 1 },
      workspaceLayout: { version: 1 },
    });
  });

  test("repairs invalid persisted layout once and then becomes stable", () => {
    const broken = {
      schemaVersion: 1 as const,
      workspaceLayout: {
        version: 1 as const,
        toolRailWidth: 999,
        sourcePanelWidth: 1,
        analysisPanelWidth: 300,
        toolRailMinimized: false,
        sourcePanelMinimized: false,
        analysisPanelMinimized: false,
      },
    };
    const patch = kisakiStateMigrationPatch(broken);
    expect(patch?.workspaceLayout).toMatchObject({
      toolRailWidth: 260,
      sourcePanelWidth: 220,
    });
    expect(kisakiStateMigrationPatch({ ...broken, ...patch })).toBeUndefined();
  });

  test("migrates motion crop detection once without discarding the rollback field", () => {
    const legacy = {
      schemaVersion: 1 as const,
      tool: "similar-videos" as const,
      similarVideosCropDetect: "motion" as const,
      unknownFutureField: { preserve: true },
    };
    const patch = kisakiStateMigrationPatch(legacy);
    expect(normalizeKisakiCardState(legacy)).toMatchObject({
      ...legacy,
      schemaVersion: KISAKI_STATE_VERSION,
      similarVideosLetterboxCrop: true,
    });
    expect(patch).toMatchObject({
      similarVideosLetterboxCrop: true,
      czkawka12MotionCropMigrationNotified: true,
      activityLog: [expect.objectContaining({ kind: "system", level: "warning" })],
    });
    expect(patch).not.toHaveProperty("similarVideosCropDetect");
    expect(kisakiStateMigrationPatch({ ...legacy, ...patch })).toBeUndefined();
  });
});
