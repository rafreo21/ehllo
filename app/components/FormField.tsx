import { forwardRef } from "react";
import type { FieldsetHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { ChevronDown as CaretDownIcon } from "react-feather";
type SharedProps = {
  label: string;
  hint?: string;
  error?: string;
  leadingIcon?: ReactNode;
  hideLabel?: boolean;
  compact?: boolean;
  inline?: boolean;
};

const fieldLabelClass = "text-sm font-semibold text-[#454745]";
const compactLabelClass = "text-xs font-semibold text-[#6b7168]";
const fieldControlClass = [
  "block min-h-12 w-full rounded-md border bg-white px-3.5 py-2.5 text-base text-[#0e0f0c]",
  "outline-none transition",
  "focus:border-[#163300] focus:ring-4 focus:ring-[#aeb8aa]/45",
  "disabled:cursor-not-allowed disabled:bg-[#f2f5f0] disabled:text-[#858b82]",
  "border-[var(--p-line)] shadow-[0_1px_2px_rgba(22,51,0,.04)]",
].join(" ");
const compactControlClass = [
  "block h-9 min-h-9 w-full rounded-md border bg-white px-2.5 text-[13px] font-normal text-[#0e0f0c]",
  "outline-none transition",
  "focus:border-[#163300] focus:ring-4 focus:ring-[#aeb8aa]/45",
  "disabled:cursor-not-allowed disabled:bg-[#f2f5f0] disabled:text-[#858b82]",
  "border-[var(--p-line)] shadow-[0_1px_2px_rgba(22,51,0,.04)]",
].join(" ");
const inlineControlClass = [
  "block h-11 min-h-11 w-full rounded-lg border border-transparent bg-[#f2f5f0] px-3.5 text-[14px] font-medium text-[#163300]",
  "outline-none transition placeholder:text-[#7b8477]",
  "hover:bg-[#edf1ea] focus:border-[#9fbe8c] focus:bg-white focus:ring-4 focus:ring-[#dff2d3]",
  "disabled:cursor-not-allowed disabled:bg-[#f2f5f0] disabled:text-[#858b82]",
].join(" ");

type FormSectionProps = FieldsetHTMLAttributes<HTMLFieldSetElement> & {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
};

export function FormSection({
  title,
  description,
  icon,
  children,
  className = "",
  ...props
}: FormSectionProps) {
  return (
    <fieldset
      {...props}
      className={`m-0 min-w-0 rounded-lg border-0 bg-[#f2f5f0] p-5 sm:p-6 ${className}`}
    >
      <legend className="sr-only">{title}</legend>
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#e2f6d5] text-[#163300]">
          {icon}
        </span>
        <div>
          <h3 className="m-0 text-base font-bold tracking-[-0.02em] text-[#163300]">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-[#60675d]">{description}</p>
        </div>
      </div>
      <div className="grid gap-5">{children}</div>
    </fieldset>
  );
}

export const TextField = forwardRef<HTMLInputElement, SharedProps & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  {
    label,
    hint,
    error,
    leadingIcon,
    hideLabel = false,
    compact = false,
    inline = false,
    id,
    className = "",
    ...props
  },
  ref,
) {
  const fieldId = id ?? `field-${props.name ?? label.toLowerCase().replace(/\s+/g, "-")}`;
  const descriptionId = hint || error ? `${fieldId}-description` : undefined;
  const visuallyHideLabel = hideLabel || inline;

  return (
    <div className={`grid ${visuallyHideLabel ? "gap-0" : compact ? "gap-1" : "gap-2"} ${className}`}>
      <div className={visuallyHideLabel ? "sr-only" : "grid gap-0.5"}>
        <label htmlFor={fieldId} className={compact ? compactLabelClass : fieldLabelClass}>{label}</label>
        {hint && !error && !hideLabel && <span className="text-xs text-[#6b7168]">{hint}</span>}
      </div>
      <div className="relative">
        {leadingIcon && (
          <span className={`pointer-events-none absolute inset-y-0 left-0 flex items-center text-[#52604b] ${compact ? "pl-3" : "pl-3.5"}`}>
            {leadingIcon}
          </span>
        )}
        <input
          {...props}
          placeholder={props.placeholder ?? (inline ? label : undefined)}
          ref={ref}
          id={fieldId}
          aria-invalid={Boolean(error)}
          aria-describedby={descriptionId}
          className={[
            inline ? inlineControlClass : compact ? compactControlClass : fieldControlClass,
            inline ? "" : "placeholder:text-[#858b82]",
            leadingIcon ? (compact ? "pl-9" : "pl-11") : "",
            error ? "border-[#b42318] focus:border-[#b42318] focus:ring-[#fecdca]/50" : "",
          ].join(" ")}
        />
      </div>
      {error && <p id={descriptionId} className="text-sm font-medium text-[#b42318]">{error}</p>}
    </div>
  );
});

export const SelectField = forwardRef<HTMLSelectElement, SharedProps & SelectHTMLAttributes<HTMLSelectElement>>(function SelectField(
  {
    label,
    hint,
    error,
    hideLabel = false,
    compact = false,
    inline = false,
    id,
    className = "",
    children,
    ...props
  },
  ref,
) {
  const fieldId = id ?? `field-${props.name ?? label.toLowerCase().replace(/\s+/g, "-")}`;
  const descriptionId = hint || error ? `${fieldId}-description` : undefined;
  const visuallyHideLabel = hideLabel || inline;

  return (
    <div className={`grid ${visuallyHideLabel ? "gap-0" : compact ? "gap-1" : "gap-2"} ${className}`}>
      <div className={visuallyHideLabel ? "sr-only" : "grid gap-0.5"}>
        <label htmlFor={fieldId} className={compact ? compactLabelClass : fieldLabelClass}>{label}</label>
        {hint && !error && !hideLabel && <span className="text-xs text-[#6b7168]">{hint}</span>}
      </div>
      <div className="relative">
        <select
          {...props}
          ref={ref}
          id={fieldId}
          aria-invalid={Boolean(error)}
          aria-describedby={descriptionId}
          className={[
            inline ? inlineControlClass : compact ? compactControlClass : fieldControlClass,
            "appearance-none",
            inline || compact ? "pr-9" : "pr-11",
            error ? "border-[#b42318] focus:border-[#b42318] focus:ring-[#fecdca]/50" : "",
          ].join(" ")}
        >
          {children}
        </select>
        <CaretDownIcon
          size={inline || compact ? 14 : 16}
          aria-hidden="true"
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[#52604b] ${inline || compact ? "right-3" : "right-3.5"}`}
        />
      </div>
      {error && <p id={descriptionId} className="text-sm font-medium text-[#b42318]">{error}</p>}
    </div>
  );
});

export function TextAreaField({
  label,
  hint,
  error,
  hideLabel = false,
  inline = false,
  id,
  className = "",
  ...props
}: SharedProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const fieldId = id ?? `field-${props.name ?? label.toLowerCase().replace(/\s+/g, "-")}`;
  const descriptionId = hint || error ? `${fieldId}-description` : undefined;

  return (
    <div className={`grid ${inline ? "gap-0" : "gap-2"} ${className}`}>
      <div className={hideLabel || inline ? "sr-only" : "flex items-center justify-between gap-4"}>
        <label htmlFor={fieldId} className={fieldLabelClass}>{label}</label>
        {hint && !error && <span id={descriptionId} className="text-xs text-[#6b7168]">{hint}</span>}
      </div>
      <textarea
        {...props}
        id={fieldId}
        aria-invalid={Boolean(error)}
        aria-describedby={descriptionId}
        className={[
          inline ? inlineControlClass : fieldControlClass,
          inline ? "h-auto min-h-[88px] resize-none py-3" : "resize-y py-3",
          inline ? "" : "placeholder:text-[#858b82]",
          error ? "border-[#b42318] focus:border-[#b42318] focus:ring-[#fecdca]/50" : "",
        ].join(" ")}
      />
      {error && <p id={descriptionId} className="text-sm font-medium text-[#b42318]">{error}</p>}
    </div>
  );
}
