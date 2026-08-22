import type { ReactNode } from "react";
import { CheckCircle as CheckCircleIcon } from "react-feather";
import { AlertCircle as WarningCircleIcon } from "react-feather";
export function StatusMessage({
  tone,
  children,
  action,
}: {
  tone: "success" | "error" | "info";
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`status-message status-${tone}`} role={tone === "error" ? "alert" : "status"} aria-live="polite">
      {tone === "success" ? <CheckCircleIcon /> : tone === "error" ? <WarningCircleIcon /> : null}
      <div>{children}</div>
      {action}
    </div>
  );
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="loading-skeleton" aria-label="Loading content" aria-busy="true">
      <span className="skeleton loading-skeleton-heading" />
      <div className="loading-skeleton-rows">
        {Array.from({ length: rows }, (_, index) => <span className="skeleton loading-skeleton-row" key={index} />)}
      </div>
    </div>
  );
}

export function CardFlowSkeleton() {
  return (
    <div className="card-flow-skeleton" aria-label="Loading card" aria-busy="true">
      <section className="card-flow-skeleton-preview">
        <span className="skeleton card-flow-skeleton-cover" />
        <span className="skeleton card-flow-skeleton-avatar" />
        <span className="skeleton card-flow-skeleton-name" />
        <span className="skeleton card-flow-skeleton-line" />
        <span className="skeleton card-flow-skeleton-line short" />
      </section>
      <section className="card-flow-skeleton-panel">
        <span className="skeleton card-flow-skeleton-title" />
        <span className="skeleton card-flow-skeleton-block" />
        <span className="skeleton card-flow-skeleton-block" />
        <span className="skeleton card-flow-skeleton-block tall" />
      </section>
    </div>
  );
}
