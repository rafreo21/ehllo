"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft as ArrowLeftIcon } from "react-feather";
import { Download as DownloadSimpleIcon } from "react-feather";
import { Upload as UploadSimpleIcon } from "react-feather";
import { Trash2 as TrashIcon } from "react-feather";
import { Button } from "../../components/Button";
import {
  createEmptyDiscoveryData,
  DISCOVERY_STORAGE_KEY,
  DiscoveryData,
  EvidenceDirection,
  EvidenceEntry,
  EvidenceStrength,
  EvidenceType,
  getDiscoveryCounts,
  HypothesisStatus,
  Interview,
  Participant,
  parseDiscoveryData,
  ProfessionalCategory,
  RecruitmentStatus,
} from "./discovery-data";
import "./discovery.css";

const today = () => new Date().toISOString().slice(0, 10);
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const labelFor = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const interviewQuestions = [
  "Tell me about the last important professional meeting you had with a potential client, partner, or referral.",
  "What made that meeting important?",
  "Immediately after the meeting, what did you do?",
  "Where did you record what was discussed?",
  "What did you or the other person promise to do?",
  "How did you remember the next action?",
  "When did you follow up?",
  "Show me, where appropriate, the tools or notes you used.",
  "Tell me about the last time a professional follow-up happened late or not at all.",
  "What was the consequence?",
  "How often does something similar happen?",
  "What have you tried to prevent it?",
  "Do you use a CRM? Why or why not?",
  "Which part of the current workflow feels most frustrating or unreliable?",
  "Have you paid for any tool intended to manage contacts, relationships, tasks, or follow-ups?",
  "What caused you to continue or stop using it?",
];

const synthesisFields: Array<[keyof DiscoveryData["synthesis"], string]> = [
  ["repeatedPains", "Repeated pains"],
  ["existingWorkflows", "Existing workflows"],
  ["failurePoints", "Failure points"],
  ["currentAlternatives", "Current alternatives"],
  ["frequencyPatterns", "Frequency patterns"],
  ["consequences", "Consequences"],
  ["paymentSignals", "Payment signals"],
  ["contradictions", "Contradictions"],
  ["unexpectedFindings", "Unexpected findings"],
  ["segmentDifferences", "Segment differences"],
  ["openQuestions", "Open questions"],
];

function blankParticipant(number: number): Participant {
  return {
    id: makeId("participant"),
    referenceId: `P-${String(number).padStart(2, "0")}`,
    name: "",
    professionalCategory: "product_design",
    yearsIndependent: "",
    meetingsPerWeek: "",
    currentTools: "",
    recruitmentSource: "",
    recruitmentStatus: "identified",
    interviewDateTime: "",
    consentConfirmed: false,
    interviewStatus: "not_scheduled",
    notes: "",
  };
}

function blankInterview(participantId: string): Interview {
  return {
    id: makeId("interview"),
    participantId,
    interviewDate: "",
    interviewer: "",
    duration: "",
    consentState: "not_requested",
    recordingReference: "",
    lastImportantMeeting: "",
    currentWorkflow: "",
    toolsUsed: "",
    followUpMethod: "",
    failureExample: "",
    frequency: "",
    consequence: "",
    existingWorkaround: "",
    paymentEvidence: "",
    verbatimQuote: "",
    observedBehaviour: "",
    researcherInterpretation: "",
    contradictoryEvidence: "",
    followUpQuestions: "",
    overallEvidenceStrength: "low",
    analysed: false,
  };
}

export default function DiscoveryPage() {
  const [data, setData] = useState<DiscoveryData>(() => createEmptyDiscoveryData());
  const [notice, setNotice] = useState("");
  const [participantDraft, setParticipantDraft] = useState<Participant>(() => blankParticipant(1));
  const [participantError, setParticipantError] = useState("");
  const [interviewDraft, setInterviewDraft] = useState<Interview>(() => blankInterview(""));
  const [interviewError, setInterviewError] = useState("");
  const [evidenceDraft, setEvidenceDraft] = useState<Omit<EvidenceEntry, "id">>({
    hypothesisId: "HYP-001",
    direction: "supports",
    evidenceType: "reported_behaviour",
    text: "",
    participantId: "",
    strength: "low",
  });
  const [evidenceError, setEvidenceError] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISCOVERY_STORAGE_KEY);
      if (stored) {
        const parsed = parseDiscoveryData(stored);
        queueMicrotask(() => setData(parsed));
      }
    } catch {
      queueMicrotask(() => setNotice("Stored discovery data was malformed, so a safe empty workspace was loaded."));
    }
  }, []);

  const counts = useMemo(() => getDiscoveryCounts(data), [data]);

  function commit(next: DiscoveryData, message = "Saved locally.") {
    const dated = { ...next, lastUpdated: today() };
    setData(dated);
    try {
      localStorage.setItem(DISCOVERY_STORAGE_KEY, JSON.stringify(dated));
      setNotice(message);
    } catch {
      setNotice("Changes are visible now but could not be saved in this browser.");
    }
  }

  function addParticipant(event: FormEvent) {
    event.preventDefault();
    if (!participantDraft.referenceId.trim()) return setParticipantError("A participant reference ID is required.");
    if (data.participants.some((participant) => participant.referenceId === participantDraft.referenceId)) {
      return setParticipantError("That participant reference ID is already in use.");
    }
    commit({ ...data, participants: [...data.participants, participantDraft] }, "Participant added and saved locally.");
    setParticipantDraft(blankParticipant(data.participants.length + 2));
    setParticipantError("");
  }

  function updateParticipant(id: string, patch: Partial<Participant>) {
    commit({ ...data, participants: data.participants.map((participant) => participant.id === id ? { ...participant, ...patch } : participant) });
  }

  function addInterview(event: FormEvent) {
    event.preventDefault();
    if (!interviewDraft.participantId) return setInterviewError("Choose a participant.");
    if (!interviewDraft.interviewDate) return setInterviewError("Add the interview date.");
    if (!interviewDraft.interviewer.trim()) return setInterviewError("Add the interviewer name.");
    commit({ ...data, interviews: [...data.interviews, interviewDraft] }, "Interview record added and saved locally.");
    setInterviewDraft(blankInterview(""));
    setInterviewError("");
  }

  function addEvidence(event: FormEvent) {
    event.preventDefault();
    if (!evidenceDraft.participantId) return setEvidenceError("Choose the participant this evidence came from.");
    if (!evidenceDraft.text.trim()) return setEvidenceError("Describe the evidence.");
    const entry = { ...evidenceDraft, id: makeId("evidence") };
    commit({ ...data, evidence: [...data.evidence, entry] }, "Evidence linked and saved locally.");
    setEvidenceDraft({ ...evidenceDraft, text: "" });
    setEvidenceError("");
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ehllo-discovery-${today()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Discovery data exported.");
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseDiscoveryData(await file.text());
      commit(imported, "Discovery data imported and saved locally.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The selected file could not be imported.");
    } finally {
      event.target.value = "";
    }
  }

  function deleteAll() {
    if (!window.confirm("Delete all locally stored discovery participants, interviews, evidence, synthesis, and the decision record? This cannot be undone.")) return;
    localStorage.removeItem(DISCOVERY_STORAGE_KEY);
    const empty = createEmptyDiscoveryData();
    setData(empty);
    setParticipantDraft(blankParticipant(1));
    setInterviewDraft(blankInterview(""));
    setNotice("All discovery data was deleted from this browser.");
  }

  return (
    <main className="discovery-shell">
      <header className="discovery-nav">
        <a href="/hub"><ArrowLeftIcon size={16} /> MVP hub</a>
        <div>
          <Button size="small" variant="secondary" onClick={exportData}><DownloadSimpleIcon size={16} /> Export JSON</Button>
          <Button size="small" variant="secondary" onClick={() => importRef.current?.click()}><UploadSimpleIcon size={16} /> Import JSON</Button>
          <input ref={importRef} className="sr-only" type="file" accept="application/json,.json" onChange={importData} />
        </div>
      </header>

      <section className="discovery-intro">
        <div>
          <span className="discovery-kicker">Step 2 · Customer discovery</span>
          <h1>Test the problem before building the product.</h1>
          <p>This workspace manages evidence. It does not mean the segment, problem, or product direction has been validated.</p>
        </div>
        <aside className="local-warning"><strong>Browser-local prototype</strong><span>Data can be lost if browser storage is cleared. Export JSON after every research session. Do not record unnecessary or highly sensitive information.</span></aside>
      </section>

      {notice && <p className="save-notice" role="status">{notice}</p>}

      <nav className="discovery-jump" aria-label="Discovery workspace sections">
        {["Overview", "Hypotheses", "Participants", "Interview guide", "Interview records", "Evidence", "Synthesis", "Decision gate"].map((label) => (
          <a key={label} href={`#${label.toLowerCase().replaceAll(" ", "-")}`}>{label}</a>
        ))}
      </nav>

      <section className="discovery-section" id="overview">
        <header><span>01</span><div><h2>Discovery overview</h2><p>The current segment, problem, and outcome are working hypotheses—not facts.</p></div></header>
        <div className="overview-grid">
          <article className="objective-panel">
            <span className="unvalidated-badge">Unvalidated assumptions</span>
            <h3>Research objective</h3>
            <p>Determine whether independent consultants repeatedly experience costly meeting-to-follow-up failures and will change behaviour to prevent them.</p>
            <dl>
              <div><dt>Working segment</dt><dd>Independent consultants and fractional professionals with relationship-driven revenue.</dd></div>
              <div><dt>Problem hypothesis</dt><dd>Important context, commitments, and next actions are scattered across memory, notes, inboxes, and calendars.</dd></div>
              <div><dt>Outcome hypothesis</dt><dd>A captured encounter results in a user-reviewed follow-up completed within 72 hours.</dd></div>
            </dl>
          </article>
          <div className="research-counts">
            <div><strong>10</strong><span>Interview target</span></div>
            <div><strong>{counts.recruited}</strong><span>Recruited</span></div>
            <div><strong>{counts.scheduled}</strong><span>Scheduled</span></div>
            <div><strong>{counts.completed}</strong><span>Completed</span></div>
            <div><strong>{counts.analysed}</strong><span>Analysed</span></div>
          </div>
        </div>
      </section>

      <section className="discovery-section" id="hypotheses">
        <header><span>02</span><div><h2>Hypothesis register</h2><p>Counts inform judgement; only the researcher manually changes status.</p></div></header>
        <div className="hypothesis-list">
          {data.hypotheses.map((hypothesis) => {
            const linked = data.evidence.filter((entry) => entry.hypothesisId === hypothesis.id);
            const supports = linked.filter((entry) => entry.direction === "supports").length;
            const contradicts = linked.filter((entry) => entry.direction === "contradicts").length;
            return (
              <article key={hypothesis.id}>
                <div><strong>{hypothesis.id}</strong><p>{hypothesis.statement}</p></div>
                <label>Status<select value={hypothesis.status} onChange={(event) => commit({ ...data, hypotheses: data.hypotheses.map((item) => item.id === hypothesis.id ? { ...item, status: event.target.value as HypothesisStatus, lastUpdated: today() } : item) })}>
                  {["untested", "weak_evidence", "mixed_evidence", "supported", "rejected"].map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}
                </select></label>
                <div className="evidence-counts"><span>{supports} supporting</span><span>{contradicts} contradicting</span></div>
                <label>Research notes<textarea rows={2} value={hypothesis.notes} onChange={(event) => commit({ ...data, hypotheses: data.hypotheses.map((item) => item.id === hypothesis.id ? { ...item, notes: event.target.value, lastUpdated: today() } : item) }, "Hypothesis notes saved locally.")} /></label>
                <small>Last updated {hypothesis.lastUpdated}</small>
              </article>
            );
          })}
        </div>
      </section>

      <section className="discovery-section" id="participants">
        <header><span>03</span><div><h2>Participant tracker</h2><p>Use a pseudonym where possible. Ten is the minimum target, not a validation shortcut.</p></div></header>
        <form className="research-form" onSubmit={addParticipant}>
          <h3>Add participant</h3>
          <div className="form-grid">
            <label>Reference ID<input required value={participantDraft.referenceId} onChange={(event) => setParticipantDraft({ ...participantDraft, referenceId: event.target.value })} /></label>
            <label>Full name or pseudonym<input value={participantDraft.name} onChange={(event) => setParticipantDraft({ ...participantDraft, name: event.target.value })} autoComplete="name" /></label>
            <label>Professional category<select value={participantDraft.professionalCategory} onChange={(event) => setParticipantDraft({ ...participantDraft, professionalCategory: event.target.value as ProfessionalCategory })}>
              {["product_design", "marketing_growth", "technology_engineering", "strategy_operations", "small_agency_owner", "other"].map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}
            </select></label>
            <label>Years independent<input inputMode="numeric" value={participantDraft.yearsIndependent} onChange={(event) => setParticipantDraft({ ...participantDraft, yearsIndependent: event.target.value })} /></label>
            <label>External meetings per week<input inputMode="numeric" value={participantDraft.meetingsPerWeek} onChange={(event) => setParticipantDraft({ ...participantDraft, meetingsPerWeek: event.target.value })} /></label>
            <label>Current tools<input value={participantDraft.currentTools} onChange={(event) => setParticipantDraft({ ...participantDraft, currentTools: event.target.value })} /></label>
            <label>Recruitment source<input value={participantDraft.recruitmentSource} onChange={(event) => setParticipantDraft({ ...participantDraft, recruitmentSource: event.target.value })} /></label>
            <label>Recruitment status<select value={participantDraft.recruitmentStatus} onChange={(event) => setParticipantDraft({ ...participantDraft, recruitmentStatus: event.target.value as RecruitmentStatus })}>
              {["identified", "contacted", "replied", "scheduled", "completed", "declined"].map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}
            </select></label>
            <label>Interview date and time<input type="datetime-local" value={participantDraft.interviewDateTime} onChange={(event) => setParticipantDraft({ ...participantDraft, interviewDateTime: event.target.value })} /></label>
            <label className="check-field"><input type="checkbox" checked={participantDraft.consentConfirmed} onChange={(event) => setParticipantDraft({ ...participantDraft, consentConfirmed: event.target.checked })} /> Consent confirmed</label>
            <label className="span-two">Notes<textarea rows={2} value={participantDraft.notes} onChange={(event) => setParticipantDraft({ ...participantDraft, notes: event.target.value })} /></label>
          </div>
          {participantError && <p className="form-error">{participantError}</p>}
          <Button type="submit">Add participant</Button>
        </form>
        <div className="record-list">
          {!data.participants.length && <p className="empty-state">No participants yet. Add identified candidates without unnecessary personal details.</p>}
          {data.participants.map((participant) => (
            <details key={participant.id}>
              <summary><strong>{participant.referenceId} · {participant.name || "Unnamed participant"}</strong><span>{labelFor(participant.recruitmentStatus)}</span></summary>
              <div className="record-editor form-grid">
                <label>Recruitment status<select value={participant.recruitmentStatus} onChange={(event) => updateParticipant(participant.id, { recruitmentStatus: event.target.value as RecruitmentStatus })}>{["identified", "contacted", "replied", "scheduled", "completed", "declined"].map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}</select></label>
                <label>Interview date and time<input type="datetime-local" value={participant.interviewDateTime} onChange={(event) => updateParticipant(participant.id, { interviewDateTime: event.target.value })} /></label>
                <label className="check-field"><input type="checkbox" checked={participant.consentConfirmed} onChange={(event) => updateParticipant(participant.id, { consentConfirmed: event.target.checked })} /> Consent confirmed</label>
                <label className="span-two">Notes<textarea rows={2} value={participant.notes} onChange={(event) => updateParticipant(participant.id, { notes: event.target.value })} /></label>
                <Button size="small" variant="secondary" onClick={() => commit({ ...data, participants: data.participants.filter((item) => item.id !== participant.id) }, "Participant removed.")}>Remove participant</Button>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="discovery-section" id="interview-guide">
        <header><span>04</span><div><h2>Interview guide</h2><p>Ask for recent behaviour and evidence. Do not pitch the proposed product.</p></div></header>
        <div className="guide-layout">
          <ol>{interviewQuestions.map((question) => <li key={question}>{question}</li>)}</ol>
          <aside><h3>Interviewer warnings</h3><ul>
            <li>Do not pitch ehllo at the beginning.</li><li>Do not ask “Would you use this?”</li><li>Do not ask leading questions.</li><li>Ask for recent, specific examples.</li><li>Separate stated preference from demonstrated behaviour.</li><li>Ask permission before recording.</li><li>Never paste highly sensitive or unnecessary personal information.</li>
          </ul></aside>
        </div>
      </section>

      <section className="discovery-section" id="interview-records">
        <header><span>05</span><div><h2>Interview records</h2><p>Keep what was said, what was demonstrated, and what the researcher inferred separate.</p></div></header>
        <form className="research-form" onSubmit={addInterview}>
          <h3>Create interview record</h3>
          <div className="form-grid">
            <label>Participant<select required value={interviewDraft.participantId} onChange={(event) => setInterviewDraft({ ...interviewDraft, participantId: event.target.value })}><option value="">Choose participant</option>{data.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.referenceId} · {participant.name || "Unnamed"}</option>)}</select></label>
            <label>Interview date<input required type="date" value={interviewDraft.interviewDate} onChange={(event) => setInterviewDraft({ ...interviewDraft, interviewDate: event.target.value })} /></label>
            <label>Interviewer<input required value={interviewDraft.interviewer} onChange={(event) => setInterviewDraft({ ...interviewDraft, interviewer: event.target.value })} /></label>
            <label>Duration<input placeholder="e.g. 35 minutes" value={interviewDraft.duration} onChange={(event) => setInterviewDraft({ ...interviewDraft, duration: event.target.value })} /></label>
            <label>Consent state<select value={interviewDraft.consentState} onChange={(event) => setInterviewDraft({ ...interviewDraft, consentState: event.target.value as Interview["consentState"] })}>{["not_requested", "requested", "confirmed", "declined"].map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}</select></label>
            <label>Recording reference (optional)<input value={interviewDraft.recordingReference} onChange={(event) => setInterviewDraft({ ...interviewDraft, recordingReference: event.target.value })} /></label>
            {([
              ["lastImportantMeeting", "Last important meeting"], ["currentWorkflow", "Current workflow"], ["toolsUsed", "Tools used"], ["followUpMethod", "Follow-up method"], ["failureExample", "Failure example"], ["frequency", "Frequency"], ["consequence", "Consequence"], ["existingWorkaround", "Existing workaround"], ["paymentEvidence", "Payment evidence"], ["verbatimQuote", "Important verbatim quote"], ["observedBehaviour", "What the participant demonstrated"], ["researcherInterpretation", "What the researcher inferred"], ["contradictoryEvidence", "Contradictory evidence"], ["followUpQuestions", "Follow-up questions"],
            ] as Array<[keyof Interview, string]>).map(([field, label]) => <label className="span-two" key={field}>{label}<textarea rows={2} value={String(interviewDraft[field])} onChange={(event) => setInterviewDraft({ ...interviewDraft, [field]: event.target.value })} /></label>)}
            <label>Overall evidence strength<select value={interviewDraft.overallEvidenceStrength} onChange={(event) => setInterviewDraft({ ...interviewDraft, overallEvidenceStrength: event.target.value as EvidenceStrength })}>{["low", "medium", "high"].map((value) => <option key={value}>{labelFor(value)}</option>)}</select></label>
            <label className="check-field"><input type="checkbox" checked={interviewDraft.analysed} onChange={(event) => setInterviewDraft({ ...interviewDraft, analysed: event.target.checked })} /> Synthesis completed</label>
          </div>
          {interviewError && <p className="form-error">{interviewError}</p>}
          <Button type="submit">Save interview record</Button>
        </form>
        <div className="record-list">
          {!data.interviews.length && <p className="empty-state">No interview records yet.</p>}
          {data.interviews.map((interview) => {
            const participant = data.participants.find((item) => item.id === interview.participantId);
            return <details key={interview.id}><summary><strong>{participant?.referenceId ?? "Unknown"} · {interview.interviewDate}</strong><span>{labelFor(interview.overallEvidenceStrength)} evidence</span></summary><div className="interview-summary"><p><b>Reported workflow</b>{interview.currentWorkflow || "Not recorded"}</p><p><b>Demonstrated behaviour</b>{interview.observedBehaviour || "Not recorded"}</p><p><b>Researcher interpretation</b>{interview.researcherInterpretation || "Not recorded"}</p><Button size="small" variant="secondary" onClick={() => commit({ ...data, interviews: data.interviews.filter((item) => item.id !== interview.id) }, "Interview record removed.")}>Remove record</Button></div></details>;
          })}
        </div>
      </section>

      <section className="discovery-section" id="evidence">
        <header><span>06</span><div><h2>Evidence tagging</h2><p>Link evidence to hypotheses without automatically changing hypothesis status.</p></div></header>
        <form className="research-form" onSubmit={addEvidence}>
          <div className="form-grid">
            <label>Hypothesis<select value={evidenceDraft.hypothesisId} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, hypothesisId: event.target.value })}>{data.hypotheses.map((hypothesis) => <option key={hypothesis.id} value={hypothesis.id}>{hypothesis.id}</option>)}</select></label>
            <label>Direction<select value={evidenceDraft.direction} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, direction: event.target.value as EvidenceDirection })}>{["supports", "contradicts"].map((value) => <option key={value}>{labelFor(value)}</option>)}</select></label>
            <label>Evidence type<select value={evidenceDraft.evidenceType} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, evidenceType: event.target.value as EvidenceType })}>{["reported_behaviour", "demonstrated_behaviour", "artefact", "opinion"].map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}</select></label>
            <label>Participant<select value={evidenceDraft.participantId} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, participantId: event.target.value })}><option value="">Choose participant</option>{data.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.referenceId}</option>)}</select></label>
            <label>Strength<select value={evidenceDraft.strength} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, strength: event.target.value as EvidenceStrength })}>{["low", "medium", "high"].map((value) => <option key={value}>{labelFor(value)}</option>)}</select></label>
            <label className="span-two">Evidence text<textarea required rows={3} value={evidenceDraft.text} onChange={(event) => setEvidenceDraft({ ...evidenceDraft, text: event.target.value })} /></label>
          </div>
          {evidenceError && <p className="form-error">{evidenceError}</p>}
          <Button type="submit">Link evidence</Button>
        </form>
        <div className="evidence-list">{!data.evidence.length && <p className="empty-state">No tagged evidence yet.</p>}{data.evidence.map((entry) => <article key={entry.id}><strong>{entry.hypothesisId} · {labelFor(entry.direction)}</strong><p>{entry.text}</p><small>{labelFor(entry.evidenceType)} · {labelFor(entry.strength)} strength · {data.participants.find((participant) => participant.id === entry.participantId)?.referenceId ?? "Unknown"}</small></article>)}</div>
      </section>

      <section className="discovery-section" id="synthesis">
        <header><span>07</span><div><h2>Synthesis</h2><p>Record patterns and contradictions in plain qualitative language—never invented scores.</p></div></header>
        <div className="synthesis-grid">{synthesisFields.map(([field, label]) => <label key={field}>{label}<textarea rows={4} value={data.synthesis[field]} onChange={(event) => commit({ ...data, synthesis: { ...data.synthesis, [field]: event.target.value } }, "Synthesis saved locally.")} /></label>)}</div>
        <h3 className="comparison-title">Interview comparison</h3>
        <div className="comparison-wrap"><table><thead><tr><th>Participant</th><th>Meetings/week</th><th>Fragmented tools</th><th>Missed follow-up</th><th>Consequence</th><th>Workaround</th><th>CRM</th><th>Capture evidence</th><th>Payment evidence</th></tr></thead><tbody>{data.participants.map((participant) => {
          const interview = data.interviews.find((item) => item.participantId === participant.id);
          return <tr key={participant.id}><th>{participant.referenceId}</th><td>{participant.meetingsPerWeek || "Not known"}</td><td>{participant.currentTools || "Not recorded"}</td><td>{interview?.failureExample || "Not recorded"}</td><td>{interview?.consequence || "Not recorded"}</td><td>{interview?.existingWorkaround || "Not recorded"}</td><td>{interview?.toolsUsed || "Not recorded"}</td><td>{interview?.observedBehaviour || "Not observed"}</td><td>{interview?.paymentEvidence || "No evidence"}</td></tr>;
        })}{!data.participants.length && <tr><td colSpan={9}>No participant comparisons yet.</td></tr>}</tbody></table></div>
      </section>

      <section className="discovery-section decision-section" id="decision-gate">
        <header><span>08</span><div><h2>Decision gate</h2><p>A decision remains manual and evidence-based. Ten interviews unlocks the gate; it does not validate the hypothesis.</p></div></header>
        <div className="gate-readiness"><strong>{counts.completed}/10 completed interviews</strong><span>{counts.completed >= 10 ? "Decision gate available" : `${10 - counts.completed} more completed interviews required`}</span></div>
        <fieldset disabled={counts.completed < 10}>
          <div className="form-grid">
            <label>Decision<select value={data.decisionGate.decision} onChange={(event) => commit({ ...data, decisionGate: { ...data.decisionGate, decision: event.target.value as DiscoveryData["decisionGate"]["decision"] } })}><option value="">Choose manually</option>{["proceed", "revise_segment", "revise_problem", "more_research", "stop"].map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}</select></label>
            {([["evidenceSummary", "Evidence summary"], ["strongestSupportingEvidence", "Strongest supporting evidence"], ["strongestContradictoryEvidence", "Strongest contradictory evidence"], ["changesRequired", "Changes required"]] as Array<[keyof DiscoveryData["decisionGate"], string]>).map(([field, label]) => <label className="span-two" key={field}>{label}<textarea rows={3} value={data.decisionGate[field]} onChange={(event) => commit({ ...data, decisionGate: { ...data.decisionGate, [field]: event.target.value } })} /></label>)}
            <label>Decision date<input type="date" value={data.decisionGate.decisionDate} onChange={(event) => commit({ ...data, decisionGate: { ...data.decisionGate, decisionDate: event.target.value } })} /></label>
          </div>
        </fieldset>
      </section>

      <section className="danger-zone">
        <div><h2>Local data controls</h2><p>Export a backup before deleting. No discovery data is sent to an AI service or remote database.</p></div>
        <Button variant="secondary" onClick={deleteAll}><TrashIcon size={17} /> Delete all discovery data</Button>
      </section>
    </main>
  );
}
