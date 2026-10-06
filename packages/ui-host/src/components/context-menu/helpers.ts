import { createLogger } from "@/lib/logger"

const logger = createLogger("clipboard")

/**
 * Shared helpers for context-menu builders.
 *
 * `copyToClipboard` is extracted here so every builder (component-card,
 * workspace-canvas, lane, dock/flow/bento) reuses the same fallback behavior
 * without re-importing sonner or creating cycles with the workspace layer.
 */
export async function copyToClipboard(text: string, failureLabel: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    logger.error("Clipboard write failed", err)
    // Sonner toast is project-wide; importing it directly here would create a
    // cycle with the workspace layer. The structured error is sufficient; the
    // caller can wrap the action with a toast if needed.
    void failureLabel
  }
}
