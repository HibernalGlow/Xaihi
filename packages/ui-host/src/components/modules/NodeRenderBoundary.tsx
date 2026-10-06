import { Component, Fragment } from "react"
import type { ErrorInfo, ReactNode } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { createLogger } from "@/lib/logger"

const logger = createLogger("node.render-boundary")

interface NodeRenderBoundaryProps {
  moduleId: string
  children: ReactNode
}

interface NodeRenderBoundaryState {
  boundaryKey: number
  error: Error | null
}

/**
 * Per-node React Error Boundary. Catches render throws from a single node so
 * one crashing card cannot take down the whole workspace. The reset action
 * bumps `boundaryKey`, forcing React to unmount + remount the wrapped node
 * subtree so it can re-initialise from a clean state.
 */
export class NodeRenderBoundary extends Component<NodeRenderBoundaryProps, NodeRenderBoundaryState> {
  state: NodeRenderBoundaryState = { boundaryKey: 0, error: null }

  static getDerivedStateFromError(error: Error): Partial<NodeRenderBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error(
      "Node threw during render",
      { moduleId: this.props.moduleId, componentStack: info.componentStack ?? "" },
      error,
    )
  }

  private handleReset = (): void => {
    this.setState((prev) => ({ boundaryKey: prev.boundaryKey + 1, error: null }))
  }

  render(): ReactNode {
    const { moduleId, children } = this.props
    const { boundaryKey, error } = this.state

    if (error) {
      return (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Node &quot;{moduleId}&quot; failed to render</AlertTitle>
            <AlertDescription>
              <p className="break-words font-mono text-xs">{error.message || String(error)}</p>
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={this.handleReset}>
                  <RotateCcw />
                  Retry
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )
    }

    return <Fragment key={boundaryKey}>{children}</Fragment>
  }
}
