"use client";

import { useEffect, useRef, useState } from "react";
const states = [
  { key:"share", label:"Share", image:"/homepage-app/ehllo-share.png", alt:"ehllo Quick Share screen running in the iPhone 17 Pro simulator" },
  { key:"capture", label:"Capture", image:"/homepage-app/ehllo-capture.png", alt:"ehllo Capture Context screen running in the iPhone 17 Pro simulator" },
  { key:"remember", label:"Remember", image:"/homepage-app/ehllo-home.png", alt:"ehllo relationship overview running in the iPhone 17 Pro simulator" },
  { key:"act", label:"Act", image:"/homepage-app/ehllo-followups.png", alt:"ehllo Follow-ups screen running in the iPhone 17 Pro simulator" },
] as const;

export function InteractiveAppDemo() {
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const state = states[active];
  const select = (index:number) => { setDirection(index >= active ? 1 : -1); setActive(index); };

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
        <p className="lede">Real screens from the ehllo iPhone 17 Pro simulator—from sharing a card to managing the next action.</p>
        <div className="draft-app-tabs" role="tablist" aria-label="Product demo states">
          {states.map((item,index)=><button role="tab" aria-selected={active===index} className={active===index?"active":""} onClick={()=>select(index)} key={item.key}><span>0{index+1}</span><strong>{item.label}</strong></button>)}
        </div>
      </div>
      <div className="draft-phone-wrap">
        <div className="draft-phone" aria-live="polite">
          <i className="draft-phone-button draft-phone-button--action" aria-hidden="true"/>
          <i className="draft-phone-button draft-phone-button--volume-up" aria-hidden="true"/>
          <i className="draft-phone-button draft-phone-button--volume-down" aria-hidden="true"/>
          <i className="draft-phone-button draft-phone-button--power" aria-hidden="true"/>
          <div className="draft-phone-glass">
            <div className={`draft-simulator-screen direction-${direction}`} key={active}>
              <img src={state.image} alt={state.alt}/>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  </section>;
}
