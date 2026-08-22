import type { Metadata } from "next";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";

import { BrandMark } from "../components/BrandMark";
import { ACTIVITY_UPDATED } from "../../lib/content/activity-log";
import { ActivityLogClient } from "./ActivityLogClient";

export const metadata: Metadata = {
  title: "Activity log · ehllo",
  description:
    "What changed in ehllo, and what is currently broken. Updated as we ship, so testers and anyone watching can see the work honestly.",
};

/** Newest day first, entries kept in the order they are written within a day. */
export default function ActivityPage() {
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

      <p className="mb-10 max-w-[62ch] text-[15px] leading-relaxed text-[#454745]">
        What changed, and what is still broken. We keep the open problems here as well as the fixes,
        because a log that only lists wins is no use to anyone testing against it.
      </p>

      <ActivityLogClient />

      <p className="mt-10 border-t border-[#d5d9d3] pt-6 text-[13px] leading-relaxed text-[#454745]">
        Something behaving oddly? Tell us what you did and what happened, and it will appear here.
      </p>
    </main>
  );
}
