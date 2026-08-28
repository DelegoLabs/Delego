"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Card } from "@delegolabs/ui";

export interface WidgetErrorBoundaryProps {
  name: string;
  minHeight: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Widget-level error boundary so a broken query doesn't blank the dashboard.
 * Pair with `Suspense` via `WidgetBoundary` — see docs/dashboard-widget-composition.md.
 */
export class WidgetErrorBoundary extends Component<WidgetErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Widget "${this.props.name}" failed`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <Card
          title={this.props.name}
          ariaLabel={`${this.props.name} failed to load`}
          className="dashboard-widget dashboard-widget-error"
          style={{ minHeight: this.props.minHeight }}
        >
          <p className="stat-label">Couldn&apos;t load this widget.</p>
          <Button
            variant="secondary"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </Button>
        </Card>
      );
    }
    return this.props.children;
  }
}
