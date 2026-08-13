import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";

import { buildHeuristicOutboundDraft, type OutboundDraftContent } from "./outbound-draft";
import type { ActionLinkContext } from "./action-links";
import type { Encounter, EncounterAction } from "./encounters";
import { isAiExtractionConfigured } from "./encounter-extraction-server";
import { languageModel, prepareAiAuth, textTemperature } from "./ai-provider";

const draftSchema = z.object({
  subject: z.string().describe("Email subject line, or empty for LinkedIn-style messages"),
  body: z.string().describe("Review-ready message draft the owner can edit before sending"),
});

function draftModel() {
  return languageModel();
}

export async function generateOutboundDraft(input: {
  action: Pick<EncounterAction, "title" | "channel" | "dueAt">;
  encounter: Pick<Encounter, "title" | "sharedSummary" | "privateNotes" | "transcript">;
  context: ActionLinkContext;
}): Promise<{ draft: OutboundDraftContent; source: "ai" | "heuristic"; fallback?: boolean }> {
  const heuristic = buildHeuristicOutboundDraft(input.action, input.encounter, input.context);

  if (!(await isAiExtractionConfigured())) {
    return { draft: heuristic, source: "heuristic" };
  }

  try {
    await prepareAiAuth();
    const result = await generateText({
      model: draftModel(),
      output: Output.object({ schema: draftSchema }),
      system: [
        "You write short, warm follow-up drafts for Ehllo.",
        "Never send automatically — the owner must review and approve.",
        "Do not invent facts not supported by the meeting context.",
        "Keep the tone professional and human.",
        "For LinkedIn channel, leave subject empty and keep the body under 900 characters.",
      ].join(" "),
      prompt: [
        `Channel: ${input.action.channel}`,
        `Recipient: ${input.context.personName || "unknown"}`,
        `Action to fulfill: ${input.action.title}`,
        `Meeting title: ${input.encounter.title}`,
        `Shared summary: ${input.encounter.sharedSummary}`,
        `Private notes: ${input.encounter.privateNotes}`,
        `Transcript excerpt: ${input.encounter.transcript.slice(0, 1200)}`,
      ].join("\n"),
      temperature: textTemperature(0.4),
    });

    return {
      draft: {
        subject: result.output.subject.trim(),
        body: result.output.body.trim(),
      },
      source: "ai",
    };
  } catch {
    return { draft: heuristic, source: "heuristic", fallback: true };
  }
}
