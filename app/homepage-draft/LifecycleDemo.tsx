"use client";

import { useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";

const steps = [
  { label: "Encounter", title: "You met Eve", body: "ProductCon London", meta: "6 people met · 3 follow-ups" },
  { label: "Context", title: "Remember what mattered", body: "Discussed her September launch and positioning.", meta: "Connected to Eve Chen" },
  { label: "Next move", title: "Send the research deck", body: "Monday · 9:00 AM", meta: "Ready to review" },
];

export function LifecycleDemo() {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const step = steps[active];

  const move = (next: number, nextDirection: "forward" | "back") => {
    setDirection(nextDirection);
    setActive(next);
  };

  return (
    <div className="draft-demo" aria-live="polite">
      <div className="draft-demo-top"><span>Relationship in motion</span><b>{active + 1} / {steps.length}</b></div>
      <div className={`draft-demo-stage is-${direction}`} key={active}>
        <span className="draft-demo-label">{step.label}</span>
        <div><h3>{step.title}</h3><p>{step.body}</p></div>
        <small>{step.meta}</small>
      </div>
      <div className="draft-demo-controls">
        <button aria-label="Previous step" onClick={() => move((active + steps.length - 1) % steps.length, "back")}><ArrowLeftIcon size={17} weight="bold" /></button>
        <div aria-label={`Step ${active + 1} of ${steps.length}`}>{steps.map((_, index) => <span className={index === active ? "active" : ""} key={index} />)}</div>
        <button aria-label="Next step" onClick={() => move((active + 1) % steps.length, "forward")}><ArrowRightIcon size={17} weight="bold" /></button>
      </div>
    </div>
  );
}
