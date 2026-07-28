import type { OrderStatus } from "@delego/types";
import { ORDER_LIFECYCLE, lifecycleIndex, orderStatusLabel } from "../../lib/orders";

export interface StatusTimelineProps {
  status: OrderStatus;
}

/**
 * Horizontal stepper showing an order's progress through the happy-path
 * lifecycle. Off-path terminal states (cancelled, disputed) render as a single
 * banner instead of a step, since they don't map to a lifecycle position.
 */
export function StatusTimeline({ status }: StatusTimelineProps) {
  const currentIndex = lifecycleIndex(status);

  if (currentIndex === -1) {
    return (
      <div className={`order-timeline-offpath order-status-${status}`}>
        {orderStatusLabel(status)}
      </div>
    );
  }

  return (
    <ol className="order-timeline" aria-label="Order progress">
      {ORDER_LIFECYCLE.map((step, index) => {
        const state =
          index < currentIndex
            ? "complete"
            : index === currentIndex
              ? "current"
              : "upcoming";
        return (
          <li key={step} className={`order-timeline-step is-${state}`}>
            <span className="order-timeline-dot" aria-hidden="true">
              {state === "complete" ? "✓" : index + 1}
            </span>
            <span className="order-timeline-label">
              {orderStatusLabel(step)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
