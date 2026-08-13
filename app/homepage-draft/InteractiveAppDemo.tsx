"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, CheckIcon, MicrophoneIcon, QrCodeIcon, UserPlusIcon } from "@phosphor-icons/react";

const states = [
  { key:"share", label:"Share", kicker:"Your identity", title:"Ready when you meet.", copy:"Share a polished card with a QR code or tap.", action:"Show my QR" },
  { key:"capture", label:"Capture", kicker:"New encounter", title:"Eve Chen", copy:"Founder at Fieldnote Studio · ProductCon London", action:"Add encounter" },
  { key:"remember", label:"Remember", kicker:"Meeting context", title:"What mattered", copy:"Eve is preparing a September launch and wants sharper positioning.", action:"Save context" },
  { key:"act", label:"Act", kicker:"Suggested next move", title:"Send research deck", copy:"Monday · 9:00 AM · Email Eve", action:"Mark complete" },
] as const;

export function InteractiveAppDemo() {
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const [completed, setCompleted] = useState(false);
  const state = states[active];
  const select = (index:number) => { setDirection(index >= active ? 1 : -1); setActive(index); setCompleted(false); };
  const advance = () => { if (completed) return select(0); if (active === states.length - 1) return setCompleted(true); select(active + 1); };

  useEffect(() => {
    let frame = 0;
    let previous = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const section = sectionRef.current;
        if (!section || innerWidth <= 850) return;
        const rect = section.getBoundingClientRect();
        const distance = section.offsetHeight - innerHeight;
        const progress = Math.max(0, Math.min(.999, -rect.top / Math.max(distance,1)));
        const next = Math.min(3, Math.floor(progress * 4));
        section.style.setProperty("--app-progress", `${progress * 100}%`);
        if (next !== previous) {
          setDirection(next > previous ? 1 : -1);
          setActive(next);
          setCompleted(false);
          previous = next;
        }
      });
    };
    update();
    addEventListener("scroll", update, { passive:true });
    addEventListener("resize", update);
    return () => { removeEventListener("scroll", update); removeEventListener("resize", update); cancelAnimationFrame(frame); };
  }, []);

  return <section className="draft-app-demo draft-reveal" id="app-demo" ref={sectionRef}>
    <div className="draft-app-sticky section">
      <div className="section-label">03 / Try the product story</div>
      <div className="draft-app-layout">
      <div className="draft-app-copy">
        <h2>See the next move<br/><em>take shape.</em></h2>
        <p className="lede">Tap through one relationship—from exchanging details to completing a useful follow-up.</p>
        <div className="draft-app-tabs" role="tablist" aria-label="Product demo states">
          {states.map((item,index)=><button role="tab" aria-selected={active===index} className={active===index?"active":""} onClick={()=>select(index)} key={item.key}><span>0{index+1}</span><strong>{item.label}</strong></button>)}
        </div>
      </div>
      <div className="draft-phone-wrap">
        <div className="draft-phone" aria-live="polite">
          <div className="draft-phone-status"><span>9:41</span><b>ehllo</b><span>•••</span></div>
          <div className={`draft-phone-screen direction-${direction}`} key={`${active}-${completed}`}>
            <div className="draft-phone-screen-head"><small>{state.kicker}</small><span>{active===0?<QrCodeIcon/>:active===1?<UserPlusIcon/>:active===2?<MicrophoneIcon/>:<CheckIcon/>}</span></div>
            {active===0 && <div className="draft-qr"><div className="draft-qr-grid">{Array.from({length:49},(_,i)=><i className={(i*7+i*3)%5<2?"on":""} key={i}/>)}</div><strong>Rafael · ehllo</strong><small>Scan to connect</small></div>}
            {active===1 && <div className="draft-profile-visual"><span>EC</span><div><b>ProductCon London</b><small>Met just now</small></div></div>}
            {active===2 && <div className="draft-note-visual"><span>“</span><p>Discussed her September launch and positioning. Send the research deck on Monday.</p></div>}
            {active===3 && <div className={`draft-action-visual ${completed?"done":""}`}><span><CheckIcon size={18} weight="bold"/></span><div><b>{completed?"Follow-up complete":"Research deck"}</b><small>{completed?"Relationship moved forward":"Due Monday · 9:00 AM"}</small></div></div>}
            <div className="draft-phone-copy"><small>{active+1} of 4</small><h3>{completed?"Next move made.":state.title}</h3><p>{completed?"Eve’s context stays connected for the next conversation.":state.copy}</p></div>
            <button className="draft-phone-action" onClick={advance}>{completed?"Start again":state.action}<ArrowRightIcon size={17} weight="bold"/></button>
          </div>
          <div className="draft-phone-home"/>
        </div>
      </div>
    </div>
    </div>
  </section>;
}
