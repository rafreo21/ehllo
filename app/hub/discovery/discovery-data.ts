export const DISCOVERY_STORAGE_KEY = "aftermeet-customer-discovery-v1";
export const DISCOVERY_SCHEMA_VERSION = 1;

export type HypothesisStatus = "untested" | "weak_evidence" | "mixed_evidence" | "supported" | "rejected";
export type EvidenceDirection = "supports" | "contradicts";
export type EvidenceType = "reported_behaviour" | "demonstrated_behaviour" | "artefact" | "opinion";
export type EvidenceStrength = "low" | "medium" | "high";
export type RecruitmentStatus = "identified" | "contacted" | "replied" | "scheduled" | "completed" | "declined";
export type ProfessionalCategory =
  | "product_design"
  | "marketing_growth"
  | "technology_engineering"
  | "strategy_operations"
  | "small_agency_owner"
  | "other";
export type InterviewStatus = "not_scheduled" | "scheduled" | "completed" | "analysed";
export type ConsentState = "not_requested" | "requested" | "confirmed" | "declined";
export type DecisionChoice = "" | "proceed" | "revise_segment" | "revise_problem" | "more_research" | "stop";

export type Hypothesis = {
  id: string;
  statement: string;
  status: HypothesisStatus;
  supportingEvidenceCount: number;
  contradictingEvidenceCount: number;
  notes: string;
  lastUpdated: string;
};

export type Participant = {
  id: string;
  referenceId: string;
  name: string;
  professionalCategory: ProfessionalCategory;
  yearsIndependent: string;
  meetingsPerWeek: string;
  currentTools: string;
  recruitmentSource: string;
  recruitmentStatus: RecruitmentStatus;
  interviewDateTime: string;
  consentConfirmed: boolean;
  interviewStatus: InterviewStatus;
  notes: string;
};

export type Interview = {
  id: string;
  participantId: string;
  interviewDate: string;
  interviewer: string;
  duration: string;
  consentState: ConsentState;
  recordingReference: string;
  lastImportantMeeting: string;
  currentWorkflow: string;
  toolsUsed: string;
  followUpMethod: string;
  failureExample: string;
  frequency: string;
  consequence: string;
  existingWorkaround: string;
  paymentEvidence: string;
  verbatimQuote: string;
  observedBehaviour: string;
  researcherInterpretation: string;
  contradictoryEvidence: string;
  followUpQuestions: string;
  overallEvidenceStrength: EvidenceStrength;
  analysed: boolean;
};

export type EvidenceEntry = {
  id: string;
  hypothesisId: string;
  direction: EvidenceDirection;
  evidenceType: EvidenceType;
  text: string;
  participantId: string;
  strength: EvidenceStrength;
};

export type Synthesis = {
  repeatedPains: string;
  existingWorkflows: string;
  failurePoints: string;
  currentAlternatives: string;
  frequencyPatterns: string;
  consequences: string;
  paymentSignals: string;
  contradictions: string;
  unexpectedFindings: string;
  segmentDifferences: string;
  openQuestions: string;
};

export type ComparisonRow = {
  participantId: string;
  meetingsPerWeek: string;
  fragmentedTools: string;
  recentMissedFollowUp: string;
  meaningfulConsequence: string;
  existingWorkaround: string;
  crmUsage: string;
  captureWillingnessEvidence: string;
  paymentEvidence: string;
};

export type DecisionGate = {
  decision: DecisionChoice;
  evidenceSummary: string;
  strongestSupportingEvidence: string;
  strongestContradictoryEvidence: string;
  changesRequired: string;
  decisionDate: string;
};

export type DiscoveryData = {
  version: number;
  lastUpdated: string;
  hypotheses: Hypothesis[];
  participants: Participant[];
  interviews: Interview[];
  evidence: EvidenceEntry[];
  synthesis: Synthesis;
  comparisonRows: ComparisonRow[];
  decisionGate: DecisionGate;
};

export const initialHypotheses: Array<Pick<Hypothesis, "id" | "statement">> = [
  { id: "HYP-001", statement: "Independent consultants have at least three meaningful external professional conversations in a typical week." },
  { id: "HYP-002", statement: "Important context and commitments are currently distributed across multiple tools or memory." },
  { id: "HYP-003", statement: "The existing workflow causes missed, late, or generic follow-ups." },
  { id: "HYP-004", statement: "The consequences of missed follow-up are meaningful enough to motivate behavioural change." },
  { id: "HYP-005", statement: "Users consider their current CRM, if any, too burdensome for this workflow." },
  { id: "HYP-006", statement: "Users are willing to capture encounter context within two hours of a meeting." },
  { id: "HYP-007", statement: "Users value reviewed follow-up assistance more than digital-card functionality alone." },
  { id: "HYP-008", statement: "A 72-hour follow-up window is relevant to the majority of valuable encounters." },
  { id: "HYP-009", statement: "Users would pay for a product that reliably improves this workflow." },
];

const emptySynthesis: Synthesis = {
  repeatedPains: "",
  existingWorkflows: "",
  failurePoints: "",
  currentAlternatives: "",
  frequencyPatterns: "",
  consequences: "",
  paymentSignals: "",
  contradictions: "",
  unexpectedFindings: "",
  segmentDifferences: "",
  openQuestions: "",
};

export function createEmptyDiscoveryData(date = new Date().toISOString().slice(0, 10)): DiscoveryData {
  return {
    version: DISCOVERY_SCHEMA_VERSION,
    lastUpdated: date,
    hypotheses: initialHypotheses.map((hypothesis) => ({
      ...hypothesis,
      status: "untested",
      supportingEvidenceCount: 0,
      contradictingEvidenceCount: 0,
      notes: "",
      lastUpdated: date,
    })),
    participants: [],
    interviews: [],
    evidence: [],
    synthesis: { ...emptySynthesis },
    comparisonRows: [],
    decisionGate: {
      decision: "",
      evidenceSummary: "",
      strongestSupportingEvidence: "",
      strongestContradictoryEvidence: "",
      changesRequired: "",
      decisionDate: "",
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseDiscoveryData(raw: string): DiscoveryData {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed.version !== DISCOVERY_SCHEMA_VERSION) {
    throw new Error("This file is not a supported ehllo discovery export.");
  }
  if (!Array.isArray(parsed.participants) || !Array.isArray(parsed.interviews) || !Array.isArray(parsed.evidence)) {
    throw new Error("The discovery export is missing required record collections.");
  }
  const defaults = createEmptyDiscoveryData();
  const importedHypotheses = Array.isArray(parsed.hypotheses) ? parsed.hypotheses : [];
  return {
    ...defaults,
    ...(parsed as Partial<DiscoveryData>),
    version: DISCOVERY_SCHEMA_VERSION,
    hypotheses: defaults.hypotheses.map((defaultHypothesis) => {
      const imported = importedHypotheses.find(
        (value): value is Hypothesis => isRecord(value) && value.id === defaultHypothesis.id,
      );
      return imported ? { ...defaultHypothesis, ...imported } : defaultHypothesis;
    }),
    participants: parsed.participants as Participant[],
    interviews: parsed.interviews as Interview[],
    evidence: parsed.evidence as EvidenceEntry[],
    synthesis: { ...defaults.synthesis, ...(isRecord(parsed.synthesis) ? parsed.synthesis : {}) },
    decisionGate: { ...defaults.decisionGate, ...(isRecord(parsed.decisionGate) ? parsed.decisionGate : {}) },
    comparisonRows: Array.isArray(parsed.comparisonRows) ? parsed.comparisonRows as ComparisonRow[] : [],
  };
}

export function getDiscoveryCounts(data: DiscoveryData) {
  return {
    recruited: data.participants.length,
    scheduled: data.participants.filter((participant) =>
      participant.recruitmentStatus === "scheduled" || participant.recruitmentStatus === "completed").length,
    completed: data.interviews.filter((interview) => interview.consentState === "confirmed").length,
    analysed: data.interviews.filter((interview) => interview.analysed).length,
  };
}

