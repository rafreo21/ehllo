"use client";

import { CheckCircle as CheckCircleIcon } from "react-feather";
import { Circle as CircleIcon } from "react-feather";
import { MinusCircle as MinusCircleIcon } from "react-feather";
import type { EnrichmentProvider, EnrichmentStep } from "../../lib/contact-enrichment";

const statusStyles: Record<EnrichmentStep["status"], string> = {
  found: "text-[#15803d]",
  miss: "text-[#98a39a]",
  skipped: "text-[#98a39a]",
  pending: "text-[#c8dcc8]",
  running: "text-[#52604b]",
};

export function EnrichmentWaterfall({
  steps,
  providers = [],
}: {
  steps: EnrichmentStep[];
  providers?: EnrichmentProvider[];
}) {
  if (!steps.length) return null;

  return (
    <div className="grid gap-4">
      {providers.length ? (
        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[#98a39a]">
          {providers.length} databases · verified sources only
        </p>
      ) : null}
      <ol className="m-0 grid list-none gap-0 p-0" aria-label="Waterfall enrichment progress">
        {steps.map((step, index) => (
          <li key={step.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <div className="relative flex justify-center">
              {step.status === "found" ? (
                <CheckCircleIcon size={18} className={statusStyles.found} />
              ) : step.status === "skipped" || step.status === "miss" ? (
                <MinusCircleIcon size={18} className={statusStyles[step.status]} />
              ) : (
                <CircleIcon size={18} className={statusStyles[step.status]} />
              )}
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute top-[22px] bottom-0 w-px bg-[#c8dcc8]"
                />
              ) : null}
            </div>
            <div className="pb-4">
              <p className="m-0 text-sm font-semibold text-[#163300]">{step.label}</p>
              {step.status === "found" && step.value ? (
                <p className="mt-1 mb-0 text-sm font-semibold text-[#15803d]">{step.value}</p>
              ) : null}
              {step.detail ? (
                <p className={`mt-1 mb-0 text-xs leading-5 ${step.status === "running" ? "text-[#52604b]" : "text-[#60675d]"}`}>
                  {step.detail}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
