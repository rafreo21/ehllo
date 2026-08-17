"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown as CaretDownIcon } from "react-feather";
import { COUNTRIES, countryByIso, detectDefaultCountryIso } from "../../lib/phone/countries";
import {
  formatPhoneE164,
  parseStoredPhone,
  phonePlaceholder,
  type PhoneParts,
} from "../../lib/phone/format";

type PhoneFieldProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  autoComplete?: string;
};

export function PhoneField({
  id,
  label,
  hint,
  error,
  value,
  onChange,
  required,
  autoComplete = "tel",
}: PhoneFieldProps) {
  const defaultIso = useMemo(() => detectDefaultCountryIso(), []);
  const [parts, setParts] = useState<PhoneParts>(() => parseStoredPhone(value, defaultIso));

  useEffect(() => {
    void Promise.resolve().then(() => setParts(parseStoredPhone(value, defaultIso)));
  }, [value, defaultIso]);

  function update(next: PhoneParts) {
    setParts(next);
    onChange(formatPhoneE164(next));
  }

  const country = countryByIso(parts.countryIso);
  const placeholder = phonePlaceholder(country);

  return (
    <label className="grid gap-2" htmlFor={id}>
      <span className="text-sm font-semibold text-[#454745]">{label}</span>
      <div className={`phone-field ${error ? "phone-field-error" : ""}`}>
        <div className="phone-field-country">
          <span className="phone-field-dial" aria-hidden="true">+{country.dialCode}</span>
          <select
            aria-label="Country code"
            className="phone-field-country-select"
            value={parts.countryIso}
            onChange={(event) => update({ ...parts, countryIso: event.target.value })}>
            {COUNTRIES.map((entry) => (
              <option key={entry.iso} value={entry.iso}>
                {entry.name} (+{entry.dialCode})
              </option>
            ))}
          </select>
          <CaretDownIcon size={14} aria-hidden />
        </div>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          required={required}
          value={parts.nationalNumber}
          placeholder={placeholder}
          onChange={(event) => update({ ...parts, nationalNumber: event.target.value.replace(/[^\d\s()-]/g, "") })}
        />
      </div>
      {hint ? <small className="text-xs text-[#6b7168]">{hint}</small> : null}
      {error ? <p className="text-sm font-medium text-[#b42318]" role="alert">{error}</p> : null}
    </label>
  );
}
