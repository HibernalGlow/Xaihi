export type { TerminalUiScreenProps } from "../index.js";
export {
  resolveTerminalTheme,
  TerminalThemeProvider,
  useTerminalTheme,
} from "../theme.js";
export { useTerminalUiSession } from "../session.js";
export { fieldIcon, terminalIcon } from "../icons.js";
export { ActionTabs } from "./action-tabs.js";
export { ActionLauncher } from "./action-launcher.js";
export { ProgressBar } from "./progress-bar.js";
export { TerminalSlider, type TerminalSliderProps } from "./slider.js";
export {
  ClickTarget,
  ExecutionActions,
  WorkbenchButton,
  WorkbenchField,
  WorkbenchHeaderActions,
  WorkbenchPanel,
} from "./workbench-controls.js";
export { NumberInput } from "../../components/ui/number-input.js";
export { useAnimation } from "../../hooks/use-animation.js";
export {
  TerminalImagePreview,
  decodeTerminalImageFrames,
  encodeRgbaToSixel,
  eraseTerminalGraphicsRect,
  projectRgbaToHalfBlocks,
  resolveTerminalImageBackend,
  type TerminalImageBackend,
  type TerminalImageFrame,
  type TerminalImagePreviewProps,
  type TerminalImageSource,
  type TerminalImageStreamHandle,
  type TerminalImageStreamSource,
} from "./image-preview.js";
export {
  TerminalImageDecodeService,
  defaultTerminalImageDecodeService,
  type TerminalDecodedImageFrame,
  type TerminalImageDecodeServiceOptions,
  type TerminalImageDecodeSnapshot,
} from "./terminal-image-decode-service.js";
export { TerminalPreferencesScreen } from "./app.js";
export { TerminalTaskQueueScreen } from "./task-queue-screen.js";
export { TerminalHelpScreen } from "./help-screen.js";
export { useTerminalChromeActions } from "./chrome-actions.js";
export { PathDiff, splitPathDiff, type PathDiffProps } from "./path-diff.js";
