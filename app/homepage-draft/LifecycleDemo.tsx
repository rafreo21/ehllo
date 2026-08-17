"use client";

import { useRef, useState } from "react";
import { ArrowLeft as ArrowLeftIcon, ArrowRight as ArrowRightIcon, CheckCircle as CheckCircleIcon } from "react-feather";
const steps = [
  { label: "Encounter", title: "You met Eve", context: "Eve Chen · ProductCon London", body: "6 people met · 3 follow-ups", status: "Connection captured", action: "View connection" },
  { label: "Context", title: "Remember what mattered", context: "Conversation with Eve Chen", body: "September launch · Positioning", status: "Context saved", action: "Review notes" },
  { label: "Next move", title: "Send the research deck", context: "Follow up with Eve Chen", body: "Monday · 9:00 AM", status: "Ready to review", action: "Review draft" },
];

export function LifecycleDemo() {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const pointerStart = useRef<number | null>(null);
  const step = steps[active];

  const move = (next: number, nextDirection: "forward" | "back") => {
    setDirection(nextDirection);
    setActive(next);
  };
  const previous = () => move((active + steps.length - 1) % steps.length, "back");
  const next = () => move((active + 1) % steps.length, "forward");

  return (
    <div className="draft-demo" aria-live="polite" tabIndex={0}
      onKeyDown={(event) => { if (event.key === "ArrowLeft") previous(); if (event.key === "ArrowRight") next(); }}
      onPointerDown={(event) => { pointerStart.current = event.clientX; }}
      onPointerUp={(event) => { if (pointerStart.current === null) return; const delta = event.clientX - pointerStart.current; pointerStart.current = null; if (Math.abs(delta) > 45) delta > 0 ? previous() : next(); }}>
      <div className="draft-demo-top"><span>Relationship in motion</span><b>{step.label} {active + 1} of {steps.length}</b></div>
      <div className={`draft-demo-stage is-${direction}`} key={active}>
        <span className="draft-demo-label">{step.label}</span>
        <div className="draft-demo-copy"><h3>{step.title}</h3><p className="draft-demo-context">{step.context}</p><p>{step.body}</p></div>
        <div className="draft-demo-action"><small><CheckCircleIcon size={16}/>{step.status}</small><a href="/app/followups">{step.action}<ArrowRightIcon size={16}/></a></div>
      </div>
      <div className="draft-demo-controls">
        <button aria-label="Previous step" onClick={previous}><ArrowLeftIcon size={19} /></button>
        <div aria-label={`Step ${active + 1} of ${steps.length}`}>{steps.map((_, index) => <button aria-label={`Go to step ${index + 1}`} className={index === active ? "active" : ""} onClick={() => move(index, index < active ? "back" : "forward")} key={index}/>)}</div>
        <button aria-label="Next step" onClick={next}><ArrowRightIcon size={19} /></button>
      </div>
    </div>
  );
}
