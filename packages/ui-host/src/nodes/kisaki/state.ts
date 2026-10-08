import { normalizeKisakiCardLayout } from "@hibernalglow/xaihi-kisaki/card-layout";
import { appendKisakiActivityLog } from "@hibernalglow/xaihi-kisaki/activity-log";
import { resolveKisakiSimilarVideoCrop } from "@hibernalglow/xaihi-kisaki/similar-video-crop";
import { normalizeKisakiWorkspaceLayout } from "@hibernalglow/xaihi-kisaki/workspace-layout";
import type { KisakiCardState } from "./types";

export const KISAKI_STATE_VERSION = 2 as const;
const MOTION_CROP_MIGRATION_MESSAGE = "Similar video motion crop detection now uses Czkawka 12 static letterbox detection.";

export function normalizeKisakiCardState(
  value: KisakiCardState | undefined,
): KisakiCardState {
  const current = value ?? {};
  const similarVideoCrop = resolveKisakiSimilarVideoCrop(current);
  return {
    ...current,
    schemaVersion: KISAKI_STATE_VERSION,
    similarVideosLetterboxCrop: similarVideoCrop.letterboxCrop,
    cardLayout: normalizeKisakiCardLayout(current.cardLayout),
    workspaceLayout: normalizeKisakiWorkspaceLayout(current.workspaceLayout),
  };
}

export function kisakiStateMigrationPatch(
  value: KisakiCardState | undefined,
): Partial<KisakiCardState> | undefined {
  const current = value ?? {};
  const normalized = normalizeKisakiCardState(current);
  const needsMotionCropNotice = resolveKisakiSimilarVideoCrop(current).motionDetectionRemoved
    && current.czkawka12MotionCropMigrationNotified !== true;
  if (
    current.schemaVersion === KISAKI_STATE_VERSION &&
    current.similarVideosLetterboxCrop === normalized.similarVideosLetterboxCrop &&
    same(current.cardLayout, normalized.cardLayout) &&
    same(current.workspaceLayout, normalized.workspaceLayout) &&
    !needsMotionCropNotice
  )
    return undefined;
  return {
    schemaVersion: KISAKI_STATE_VERSION,
    similarVideosLetterboxCrop: normalized.similarVideosLetterboxCrop,
    cardLayout: normalized.cardLayout,
    workspaceLayout: normalized.workspaceLayout,
    ...(needsMotionCropNotice
      ? {
          czkawka12MotionCropMigrationNotified: true,
          activityLog: appendKisakiActivityLog(current.activityLog ?? [], {
            tool: current.tool ?? "similar-videos",
            kind: "system",
            level: "warning",
            message: MOTION_CROP_MIGRATION_MESSAGE,
          }),
        }
      : {}),
  };
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
