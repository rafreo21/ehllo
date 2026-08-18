import type { Metadata } from "next";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";

import { BrandMark } from "../components/BrandMark";
import {
  ACTIVITY_ENTRIES,
  ACTIVITY_UPDATED,
  KNOWN_ISSUES,
  type ActivityImpact,
  type IssueStatus,
} from "../../lib/content/activity-log";

export const metadata: Metadata = {
  title: "Activity log · ehllo",
  description:
    "What changed in ehllo, and what is currently broken. Updated as we ship, so testers and anyone watching can see the work honestly.",
};

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

function formatDay(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Newest day first, entries kept in the order they are written within a day. */
function groupByDay() {
  const days = new Map<string, typeof ACTIVITY_ENTRIES>();
  for (const entry of ACTIVITY_ENTRIES) {
    const existing = days.get(entry.date);
    if (existing) existing.push(entry);
    else days.set(entry.date, [entry]);
  }
  return [...days.entries()].sort((left, right) => right[0].localeCompare(left[0]));
}

export default function ActivityPage() {
  const days = groupByDay();
  const openIssues = KNOWN_ISSUES.filter((issue) => issue.status !== "fixed");
  const resolvedIssues = KNOWN_ISSUES.filter((issue) => issue.status === "fixed");

  return (
    <main className="mx-auto w-full max-w-[820px] px-6 py-16 text-[#163300]">
      <a href="/" className="mb-10 inline-flex items-center gap-2 text-sm font-bold text-[#163300] hover:text-[#0e0f0c]">
        <ArrowLeftIcon size={15} />
        ehllo
      </a>

      <div className="mb-4 flex items-center gap-3">
        <BrandMark size={36} />
        <div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Activity log</h1>
          <p className="mt-1 text-sm text-[#454745]">Updated {ACTIVITY_UPDATED}</p>
        </div>
      </div>

      <p className="mb-12 max-w-[62ch] text-[15px] leading-relaxed text-[#454745]">
        What changed, and what is still broken. We keep the open problems on this page as well as the
        fixes, because a log that only lists wins is no use to anyone testing against it.
      </p>

      {/* Problems first. Someone arriving here mid-test wants to know what is
          known-broken before they read what shipped. */}
      <section className="mb-16">
        <h2 className="mb-1 text-xl font-black tracking-tight">Known issues</h2>
        <p className="mb-6 text-sm text-[#454745]">Reported problems and where each one stands.</p>

        <ul className="space-y-3">
          {[...openIssues, ...resolvedIssues].map((issue) => (
            <li
              key={issue.title}
              className="rounded-2xl border border-[#d5d9d3] bg-white p-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_CLASS[issue.status]}`}
                >
                  {STATUS_LABEL[issue.status]}
                </span>
                <h3 className="text-[15px] font-bold">{issue.title}</h3>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-[#454745]">{issue.detail}</p>
              {issue.resolution ? (
                <p className="mt-2 text-[14px] leading-relaxed text-[#163300]">{issue.resolution}</p>
              ) : null}
              <p className="mt-3 text-[12px] text-[#454745]">Reported {formatDay(issue.reportedOn)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-1 text-xl font-black tracking-tight">Changes</h2>
        <p className="mb-6 text-sm text-[#454745]">Most recent first.</p>

        <div className="space-y-12">
          {days.map(([day, entries]) => (
            <div key={day}>
              <h3 className="mb-4 border-b border-[#d5d9d3] pb-2 text-sm font-bold text-[#454745]">
                {formatDay(day)}
              </h3>
              <ul className="space-y-6">
                {entries.map((entry) => (
                  <li key={entry.title}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${IMPACT_CLASS[entry.impact]}`}
                      >
                        {IMPACT_LABEL[entry.impact]}
                      </span>
                      <h4 className="text-[16px] font-bold">{entry.title}</h4>
                    </div>
                    <p className="mt-2 max-w-[68ch] text-[15px] leading-relaxed text-[#454745]">
                      {entry.detail}
                    </p>
                    {entry.testing ? (
                      <p className="mt-2 max-w-[68ch] rounded-xl bg-[#f2f5f0] px-4 py-3 text-[14px] leading-relaxed text-[#163300]">
                        <span className="font-bold">To test: </span>
                        {entry.testing}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-16 border-t border-[#d5d9d3] pt-6 text-[13px] leading-relaxed text-[#454745]">
        Something behaving oddly? Tell us what you did and what happened, and it will appear here.
      </p>
    </main>
  );
}
