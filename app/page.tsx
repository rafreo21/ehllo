import { ArrowDownIcon } from "@phosphor-icons/react/dist/ssr/ArrowDown";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/ssr/ArrowUp";
import { BrandMark } from "./components/BrandMark";
import { IconLinkButton, LinkButton } from "./components/Button";
import { LifecycleDemo } from "./homepage-draft/LifecycleDemo";
import { DraftMotion } from "./homepage-draft/DraftMotion";
import { HorizontalLoops } from "./homepage-draft/HorizontalLoops";
import { InteractiveAppDemo } from "./homepage-draft/InteractiveAppDemo";

export default function Home() {
  return <main className="homepage-draft">
    <DraftMotion/>
    <nav className="nav">
      <a className="brand" href="#top" aria-label="ehllo home"><BrandMark className="brand-mark" size={38}/><span>ehllo</span></a>
      <div className="nav-links"><LinkButton size="small" variant="ghost" href="/auth">Login</LinkButton><LinkButton className="nav-cta" size="small" href="/auth?next=/onboarding">Start for free <ArrowRightIcon size={15} weight="bold"/></LinkButton></div>
    </nav>

    <section className="hero draft-hero" id="top">
      <div className="eyebrow draft-hero-eyebrow"><span/> Your relationship workspace</div>
      <h1><span>Remember every person.</span><br/><span><em>Make the next move.</em></span></h1>
      <div className="hero-bottom"><p>Meet someone, remember what mattered, and know what to do next. <small>ehllo keeps the people, context and next actions connected.</small></p><IconLinkButton className="circle-link" size="normal" variant="secondary" href="#lifecycle" aria-label="See how it works"><ArrowDownIcon size={21} weight="bold"/></IconLinkButton></div>
    </section>

    <section className="study section draft-reveal" id="lifecycle">
      <div className="section-label">01 / From meeting to next move</div>
      <div className="draft-story-grid">
        <div><h2>One conversation.<br/><em>A relationship remembered.</em></h2><p className="lede">ehllo turns the moment you meet into context you can use—without turning the conversation into CRM admin.</p></div>
        <LifecycleDemo/>
      </div>
      <div className="draft-path" aria-label="Meeting to next move lifecycle">{["Meeting", "Encounter", "Person", "Context", "Next move"].map((item, index) => <div className="draft-reveal-item" style={{transitionDelay: `${index * 70}ms`}} key={item}><span>0{index + 1}</span><strong>{item}</strong>{index < 4 && <ArrowRightIcon size={15} weight="bold"/>}</div>)}</div>
    </section>

    <HorizontalLoops/>
    <InteractiveAppDemo/>

    <section className="mvp section draft-reveal">
      <div className="section-label">04 / A real encounter</div>
      <div className="draft-person">
        <div className="draft-person-intro"><span>EC</span><div><small>Person</small><h2>Eve Chen</h2><p>Founder at Fieldnote Studio</p></div></div>
        <div className="draft-person-cards"><article className="draft-reveal-item"><small>Met at</small><h3>ProductCon London</h3><p>6 people met · 3 follow-ups</p></article><article className="draft-reveal-item" style={{transitionDelay:"100ms"}}><small>Context</small><h3>September launch</h3><p>Discussed positioning and the upcoming release.</p></article><article className="highlight draft-reveal-item" style={{transitionDelay:"200ms"}}><small>Next move</small><h3>Send research deck</h3><p>Monday · 9:00 AM</p></article></div>
      </div>
    </section>

    <section className="roadmap section draft-reveal">
      <div className="section-label">05 / Built around the habit</div>
      <div className="roadmap-head"><h2>Useful after<br/><em>every meeting.</em></h2><p>Start with a simple exchange. Build a reliable memory of the people you meet. Then activate that context when the moment is right.</p></div>
      <div className="metric"><div className="metric-window"><span>Follow-up window</span><strong>72h</strong></div><div className="metric-copy"><span>The outcome that matters</span><h3>A completed next move.</h3><p>Not another contact stored. A relationship moved forward with something timely, useful and personal.</p></div></div>
    </section>

    <footer><div><BrandMark className="brand-mark" size={38}/><strong>ehllo</strong></div><p>Meet someone. Remember what mattered. Make the next move.</p><LinkButton variant="ghost" href="/auth?next=/onboarding">Start for free <ArrowUpIcon size={15} weight="bold"/></LinkButton></footer>
  </main>;
}
