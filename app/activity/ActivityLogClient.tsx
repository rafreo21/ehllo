"use client";

import { useMemo, useState } from "react";

import {
  ACTIVITY_ENTRIES,
  ACTIVITY_TZ_OFFSET,
  KNOWN_ISSUES,
  type ActivityImpact,
  type IssueStatus,
} from "../../lib/content/activity-log";

const PER_PAGE = 10;

const IMPACT_LABEL: Record<ActivityImpact, string> = {
  fix: "Fixed",
  improvement: "Improved",
  new: "New",
};

const IMPACT_CLASS: Record<ActivityImpact, string> = {
  fix: "bg-[#e2f6d5] text-[#163300]",
  improvement: "bg-[#f2f5f0] text-[#454745]",
  new: "bg-[#9fe870] text-[#163300]",
};

/** The dot colour carries the same meaning as the badge, so the eye can scan it. */
const IMPACT_DOT: Record<ActivityImpact, string> = {
  fix: "bg-[#9fe870]",
  improvement: "bg-[#d5d9d3]",
  new: "bg-[#163300]",
};

const STATUS_LABEL: Record<IssueStatus, string> = {
  fixed: "Fixed",
  "in-progress": "Fix ready",
  open: "Open",
  monitoring: "Verifying",
};

const STATUS_CLASS: Record<IssueStatus, string> = {
  fixed: "border-[#9fe870] bg-[#e2f6d5] text-[#163300]",
  "in-progress": "border-[#d5d9d3] bg-[#f2f5f0] text-[#163300]",
  open: "border-[#8a4b08] bg-white text-[#8a4b08]",
  monitoring: "border-[#d5d9d3] bg-white text-[#454745]",
};

const STATUS_DOT: Record<IssueStatus, string> = {
  fixed: "bg-[#9fe870]",
  "in-progress": "bg-[#d5d9d3]",
  open: "bg-[#8a4b08]",
  monitoring: "bg-[#d5d9d3]",
};

function formatDay(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Machine-readable, so the timestamp is not only decoration. */
function stamp(iso: string, time: string) {
  return `${iso}T${time}:00${ACTIVITY_TZ_OFFSET}`;
}

function formatStamp(iso: string, time: string) {
  return `${formatDay(iso)} · ${time}`;
}

type Tab = "changes" | "issues";

export function ActivityLogClient() {
  const [tab, setTab] = useState<Tab>("changes");
  // Page is per tab, and reset on switch: carrying page 2 across to a shorter
  // list would land someone on an empty screen.
  const [page, setPage] = useState(1);

  // Open problems first within the issues tab. Someone arriving mid-test wants
  // to know what is known-broken before they read what is already fixed.
  const issues = useMemo(
    () => [...KNOWN_ISSUES.filter((i) => i.status !== "fixed"), ...KNOWN_ISSUES.filter((i) => i.status === "fixed")],
    [],
  );

  const total = tab === "changes" ? ACTIVITY_ENTRIES.length : issues.length;
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PER_PAGE;

  function switchTab(next: Tab) {
    setTab(next);
    setPage(1);
  }

  const changes = ACTIVITY_ENTRIES.slice(start, start + PER_PAGE);
  const shownIssues = issues.slice(start, start + PER_PAGE);

  return (
    <>
      {/* Same underline tabs as the meeting recap/transcript switch in the app,
          so this page does not invent a second tab language. */}
      <div
        role="tablist"
        aria-label="Changes and known issues"
        className="mb-8 flex gap-1 border-b border-[#d5d9d3]"
      >
        {([
          ["changes", "Changes", ACTIVITY_ENTRIES.length],
          ["issues", "Known issues", issues.length],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => switchTab(key)}
            className={`flex items-center justify-center gap-2 border-b-2 px-1 pb-3 pt-2.5 text-[13px] font-semibold transition-colors ${
              tab === key
                ? "border-[#163300] font-bold text-[#163300]"
                : "border-transparent text-[#454745] hover:text-[#163300]"
            }`}
          >
            {label}
            <span className="rounded-full bg-[#f2f5f0] px-2 py-0.5 text-[11px] font-bold text-[#454745]">{count}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "changes" ? (
          <ol className="relative border-s border-[#d5d9d3]">
            {changes.map((entry) => (
              <li key={entry.title} className="mb-10 ms-6">
                <span
                  className={`absolute -start-[6.5px] mt-1.5 h-3 w-3 rounded-full border border-white ${IMPACT_DOT[entry.impact]}`}
                  aria-hidden
                />
                <time
                  dateTime={stamp(entry.date, entry.time)}
                  className="text-sm font-normal leading-none text-[#454745]"
                >
                  {formatStamp(entry.date, entry.time)}
                </time>
                <h3 className="my-2 flex flex-wrap items-center gap-2 text-lg font-bold text-[#163300]">
                  {entry.title}
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${IMPACT_CLASS[entry.impact]}`}
                  >
                    {IMPACT_LABEL[entry.impact]}
                  </span>
                </h3>
                <p className="mb-2 max-w-[68ch] text-[15px] font-normal leading-relaxed text-[#454745]">
                  {entry.detail}
                </p>
                {entry.testing ? (
                  <p className="mb-4 max-w-[68ch] rounded-xl bg-[#f2f5f0] px-4 py-3 text-[14px] leading-relaxed text-[#163300]">
                    <span className="font-bold">To test: </span>
                    {entry.testing}
                  </p>
                ) : null}
                {entry.link ? (
                  <p className="mb-4">
                    <a
                      href={entry.link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#d5d9d3] px-3.5 py-1.5 text-[13px] font-bold text-[#163300] transition-colors hover:bg-[#f2f5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#163300]"
                    >
                      {entry.link.label}
                      <span aria-hidden="true">&rarr;</span>
                    </a>
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <ol className="relative border-s border-[#d5d9d3]">
            {shownIssues.map((issue) => (
              <li key={issue.title} className="mb-10 ms-6">
                <span
                  className={`absolute -start-[6.5px] mt-1.5 h-3 w-3 rounded-full border border-white ${STATUS_DOT[issue.status]}`}
                  aria-hidden
                />
                <time
                  dateTime={stamp(issue.reportedOn, issue.time)}
                  className="text-sm font-normal leading-none text-[#454745]"
                >
                  Reported {formatStamp(issue.reportedOn, issue.time)}
                </time>
                <h3 className="my-2 flex flex-wrap items-center gap-2 text-lg font-bold text-[#163300]">
                  {issue.title}
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_CLASS[issue.status]}`}
                  >
                    {STATUS_LABEL[issue.status]}
                  </span>
                </h3>
                <p className="mb-2 max-w-[68ch] text-[15px] font-normal leading-relaxed text-[#454745]">
                  {issue.detail}
                </p>
                {issue.resolution ? (
                  <p className="mb-4 max-w-[68ch] text-[15px] leading-relaxed text-[#163300]">{issue.resolution}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Only when there is somewhere to go. A single-page list with pagination
          under it just asks a question with one answer. */}
      {pageCount > 1 ? (
        <nav className="mt-2 flex items-center justify-between border-t border-[#d5d9d3] pt-6" aria-label="Pagination">
          <p className="text-[13px] text-[#454745]">
            {start + 1}&ndash;{Math.min(start + PER_PAGE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={current === 1}
              className="rounded-full border border-[#d5d9d3] px-4 py-2 text-[13px] font-bold text-[#163300] disabled:opacity-40 enabled:hover:bg-[#f2f5f0]"
            >
              Previous
            </button>
            <span className="text-[13px] font-bold text-[#454745]">
              {current} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              disabled={current === pageCount}
              className="rounded-full border border-[#d5d9d3] px-4 py-2 text-[13px] font-bold text-[#163300] disabled:opacity-40 enabled:hover:bg-[#f2f5f0]"
            >
              Next
            </button>
          </div>
        </nav>
      ) : null}
    </>
  );
}
