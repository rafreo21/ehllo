"use client";

import { Search as MagnifyingGlassIcon } from "react-feather";
import { Phone as PhoneIcon } from "react-feather";
import { Mail as EnvelopeSimpleIcon } from "react-feather";
import { Button } from "./Button";
import { TextField } from "./FormField";
import { EnrichmentWaterfall } from "./EnrichmentWaterfall";
import {
  enrichmentConfidenceLabel,
  enrichmentSourceLabel,
  type EnrichmentField,
  type EnrichmentResult,
  type EnrichmentStep,
  WORK_EMAIL_PROVIDERS,
  PHONE_PROVIDERS,
} from "../../lib/contact-enrichment";

export type ProfileFieldKey =
  | "fullName"
  | "workEmail"
  | "personalEmail"
  | "phone"
  | "role"
  | "company"
  | "linkedinUrl";

export type ProfileFieldRow = {
  key: ProfileFieldKey;
  label: string;
  value: string;
  placeholder?: string;
  source?: string;
  readOnly?: boolean;
  enrichable?: EnrichmentField;
};

type ProfileCaptureTableProps = {
  rows: ProfileFieldRow[];
  onChange: (key: ProfileFieldKey, value: string) => void;
  onEnrich?: (field: EnrichmentField) => Promise<void>;
  enrichingField?: EnrichmentField | null;
  enrichmentSteps?: EnrichmentStep[];
  error?: string;
};

export function ProfileCaptureTable({
  rows,
  onChange,
  onEnrich,
  enrichingField,
  enrichmentSteps = [],
  error,
}: ProfileCaptureTableProps) {
  return (
    <div className="grid gap-5">
      {rows.map((row) => (
        <div key={row.key} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-4">
          <TextField
            label={row.label}
            value={row.value}
            readOnly={row.readOnly}
            placeholder={row.placeholder}
            hint={row.source ? row.source : undefined}
            onChange={(event) => onChange(row.key, event.target.value)}
          />
          {row.enrichable && onEnrich ? (
            <div className="flex lg:justify-end">
              <Button
                type="button"
                size="small"
                variant="secondary"
                fullWidth
                className="lg:w-auto"
                loading={enrichingField === row.enrichable}
                disabled={Boolean(enrichingField && enrichingField !== row.enrichable)}
                onClick={() => void onEnrich(row.enrichable!)}
              >
                {row.enrichable === "email" ? (
                  <><EnvelopeSimpleIcon size={15} />Find work email</>
                ) : (
                  <><PhoneIcon size={15} />Find phone</>
                )}
              </Button>
            </div>
          ) : null}
        </div>
      ))}

      {enrichingField ? (
        <div className="rounded-xl bg-[#fbfdf8] p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#e2f6d5] text-[#163300]">
              <MagnifyingGlassIcon size={18} />
            </span>
            <div>
              <p className="m-0 text-sm font-bold text-[#163300]">
                Waterfall enrichment · {enrichingField === "email" ? "work email" : "phone"}
              </p>
              <p className="mt-1 mb-0 text-xs leading-5 text-[#60675d]">
                Searching verified databases in order. We stop at the first verified match, no pattern guesses.
              </p>
            </div>
          </div>
          <EnrichmentWaterfall
            steps={enrichmentSteps}
            providers={enrichingField === "email" ? WORK_EMAIL_PROVIDERS : PHONE_PROVIDERS}
          />
        </div>
      ) : null}

      {error ? (
        <p className="m-0 text-sm font-semibold text-[#b42318]">{error}</p>
      ) : null}
    </div>
  );
}

export async function animateEnrichmentResult(
  result: EnrichmentResult,
  onStep: (steps: EnrichmentResult["steps"]) => void,
  delayMs = 420,
) {
  const revealed: EnrichmentResult["steps"] = [];
  for (const step of result.steps) {
    revealed.push({ ...step, status: "running", detail: step.detail || "Searching…" });
    onStep([...revealed]);
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    revealed[revealed.length - 1] = step;
    onStep([...revealed]);
  }
  return result;
}

export function sourceLabelFromEnrichment(result: EnrichmentResult | null) {
  if (!result?.provider) return "";
  const source = enrichmentSourceLabel(result.provider);
  const confidence = enrichmentConfidenceLabel(result.confidence);
  return confidence ? `${source} · ${confidence}` : source;
}
