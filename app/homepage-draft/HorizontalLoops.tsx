"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react";

const loops = [
  ["Share identity", "A card, QR or tap starts the connection.", "Your card", "QR · NFC · Wallet"],
  ["Capture people", "Keep the person and where you met together.", "Eve Chen", "ProductCon London"],
  ["Remember context", "Turn the conversation into useful memory.", "September launch", "Positioning · Research"],
  ["Activate data", "Move forward with a clear, timely action.", "Send research deck", "Monday · 9:00 AM"],
] as const;

const loopImages = [
  "/homepage-app/share-conference.png",
  "/homepage-app/capture-conference.png",
  "/homepage-app/remember-conference.png",
] as const;

export function HorizontalLoops() {
  const sectionRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const section = sectionRef.current;
        if (!section) return;
        const rect = section.getBoundingClientRect();
        const distance = section.offsetHeight - innerHeight;
        const nextProgress = Math.max(0, Math.min(1, -rect.top / Math.max(distance, 1)));
        const maxShift = Math.max(0, (trackRef.current?.scrollWidth ?? 0) - (viewportRef.current?.clientWidth ?? 0));
        section.style.setProperty("--loop-shift", `${nextProgress * maxShift}px`);
        setProgress(nextProgress);
      });
    };
    update();
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    return () => { removeEventListener("scroll", update); removeEventListener("resize", update); cancelAnimationFrame(frame); };
  }, []);

  return (
    <section className="draft-horizontal" ref={sectionRef} id="loops" style={{"--loop-progress": progress} as React.CSSProperties}>
      <div className="draft-horizontal-sticky">
        <div className="draft-horizontal-head">
          <div className="section-label light">02 / The four loops</div>
          <div className="draft-horizontal-progress"><span style={{transform:`scaleX(${progress})`}}/><b>{Math.min(4, Math.floor(progress * 3.99) + 1)} / 4</b></div>
        </div>
        <div className="draft-horizontal-title"><h2>Share. Capture.<br/><em>Remember. Act.</em></h2><p>Scroll to move through the relationship. Each loop makes the next one more useful.</p></div>
        <div className="draft-horizontal-viewport" ref={viewportRef}>
          <div className="draft-horizontal-track" ref={trackRef}>
            {loops.map(([title, detail, example, meta], index) => (
              <article key={title}>
                <div className="draft-loop-card-top"><span>0{index + 1}</span><small>{index === 0 ? "Start here" : "Then"}</small></div>
                {index < loopImages.length ? (
                  <div className="draft-loop-visual">
                    <img src={loopImages[index]} alt={index === 0 ? "Two professionals exchanging contact details at a conference" : index === 1 ? "A professional saving a new connection on her phone" : "A professional recording context from a recent conversation"}/>
                    <div className="draft-loop-example"><small>In ehllo</small><strong>{example}</strong><span>{meta}</span></div>
                  </div>
                ) : (
                  <div className="draft-loop-example"><small>In ehllo</small><strong>{example}</strong><span>{meta}</span></div>
                )}
                <div className="draft-loop-card-copy"><h3>{title}</h3><p>{detail}</p></div>
                {index < 3 && <b className="draft-loop-connector"><ArrowRightIcon size={17} weight="bold"/></b>}
              </article>
            ))}
          </div>
        </div>
        <div className="draft-horizontal-hint"><span>Vertical scroll</span><ArrowRightIcon size={15} weight="bold"/><strong>Relationship progress</strong></div>
      </div>
    </section>
  );
}
