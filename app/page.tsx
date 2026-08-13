import { ArrowDownIcon } from "@phosphor-icons/react/dist/ssr/ArrowDown";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/ssr/ArrowUp";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/ssr/DotsThree";
import { Button, IconLinkButton, LinkButton } from "./components/Button";
import { BrandMark } from "./components/BrandMark";

const capabilities = [
  ["Share identity", "QR, NFC, Wallet and signatures"],
  ["Capture people", "Cards, badges, LinkedIn and forms"],
  ["Remember context", "AI notes connected to every contact"],
  ["Activate data", "CRM sync, campaigns and attribution"],
] as const;

const buildStatus = [
  {
    number: "01",
    title: "Share identity",
    detail: "QR, public link, vCard, and email signature are in the app. Wallet and NFC come next.",
    status: "In the app",
  },
  {
    number: "02",
    title: "Capture people",
    detail: "Visitors can now share their details back from your public card. Imports and manual add already work.",
    status: "Shipping now",
  },
  {
    number: "03",
    title: "Remember context",
    detail: "Record meeting, private notes, shared summary, and follow-up actions. The flow you liked is live.",
    status: "In progress",
  },
  {
    number: "04",
    title: "Activate data",
    detail: "CRM sync, campaigns, and attribution stay out until the first three loops feel obvious.",
    status: "Later",
  },
];

const phases = [
  ["Phase 1", "Share identity", "Finish card, QR, vCard, signature, and wallet-ready sharing surfaces.", "Now"],
  ["Phase 2", "Capture people", "Reciprocal exchange, imports, and a unified contact record from every source.", "Now"],
  ["Phase 3", "Context + action", "Polish meeting capture, guest records, and the follow-up inbox.", "Next"],
  ["Phase 4", "Activate data", "CRM sync, reminders, outbound drafts, and analytics.", "Later"],
];

export default function Home() {
  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top" aria-label="ehllo home">
          <BrandMark className="brand-mark" size={38} />
          <span>ehllo</span>
        </a>
        <div className="nav-links">
          <LinkButton size="small" variant="ghost" href="/auth">Login</LinkButton>
          <LinkButton className="nav-cta" size="small" href="/auth?next=/onboarding">Start for free <ArrowRightIcon size={15} weight="bold" /></LinkButton>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="eyebrow"><span /> Relationship workspace · July 2026</div>
        <h1>Remember every person.<br /><em>Make the next move.</em></h1>
        <div className="hero-bottom">
          <p>ehllo connects four loops: <strong>share identity, capture people, remember context, activate data</strong>, without turning every meeting into CRM admin.</p>
          <IconLinkButton className="circle-link" size="normal" variant="secondary" href="#product" aria-label="See the four loops"><ArrowDownIcon size={21} weight="bold" /></IconLinkButton>
        </div>
      </section>

      <section className="study section" id="product">
        <div className="section-label">01 / The four loops</div>
        <div className="study-grid">
          <div>
            <h2>Four loops.<br />One product.</h2>
            <p className="lede">We ship them in order. Identity first, capture second, context third, activation last.</p>
          </div>
          <div className="system-list">
            <div className="system-head">
              <span>How the platform compounds</span>
              <p>Each capability makes the next one more valuable.</p>
            </div>
            <div className="system-grid">
              {capabilities.map(([title, detail], index) => (
                <div className="system-row" key={title}>
                  <div className="system-row-top">
                    <div className="system-number">0{index + 1}</div>
                  </div>
                  <div className="system-copy">
                    <h3>{title}</h3>
                    <p>{detail}</p>
                  </div>
                  <ArrowRightIcon className="system-arrow" size={18} weight="bold" aria-hidden="true" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="direction section" id="status">
        <div className="section-label light">02 / What we&apos;re shipping</div>
        <div className="direction-head">
          <h2>Build the missing<br />pieces first.</h2>
          <p>These are the same four loops, not a competitor story. The app is catching up to the product: identity and capture now, context polish next, activation later.</p>
        </div>
        <div className="opportunity-grid opportunity-grid--four">
          {buildStatus.map((item) => (
            <article className="opportunity" key={item.number}>
              <div className="opportunity-top">
                <span className="op-number">{item.number}</span>
              </div>
              <span className="op-status">{item.status}</span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <div className="verdict">Product loop<ArrowRightIcon size={17} weight="bold" /></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mvp section" id="mvp">
        <div className="section-label">03 / The core loop</div>
        <div className="concept-intro">
          <div>
            <span className="concept-name">ehllo</span>
            <h2>Share. Capture.<br /><em>Remember. Act.</em></h2>
          </div>
          <p>For consultants and small teams who win work through conversations, but need something lighter than a CRM and sharper than a static business card.</p>
        </div>

        <div className="loop" aria-label="Product loop">
          {[
            ["Share or scan", "Exchange details without requiring another app."],
            ["Capture context", "Record what mattered while the meeting is fresh."],
            ["Suggest follow-up", "Turn notes into a clear, editable next action."],
            ["Strengthen relationship", "Stay useful, timely, and genuinely personal."],
          ].map(([title, detail], index) => (
            <div className="loop-step" key={title}>
              <span>0{index + 1}</span>
              <div><strong>{title}</strong><p>{detail}</p></div>
              {index < 3 && <b aria-hidden="true"><ArrowRightIcon size={13} weight="bold" /></b>}
            </div>
          ))}
        </div>

        <div className="feature-layout">
          <div className="mock-phone">
            <div className="phone-top"><span>9:41</span><DotsThreeIcon size={18} weight="bold" aria-hidden="true" /></div>
            <div className="avatar">AM</div>
            <div className="contact-label">New encounter</div>
            <h3>Maya Chen</h3>
            <p>Founder at Fieldnote Studio</p>
            <div className="note">&ldquo;Discussed her September launch. Send the research deck on Monday and introduce her to Alex.&rdquo;</div>
            <div className="extracted">
              <span>Next move</span>
              <strong>Send research deck</strong>
              <small>Monday, 9:00 AM</small>
            </div>
            <Button fullWidth>Review follow-up <ArrowRightIcon size={17} weight="bold" /></Button>
          </div>
          <div className="feature-copy">
            <div className="feature"><span>01</span><div><h3>Share identity</h3><p>Card, QR, vCard, and email signature copy are in the app today. Wallet and NFC are still on the roadmap.</p></div></div>
            <div className="feature"><span>02</span><div><h3>Capture people</h3><p>Public cards now include a share-back form so visitors can send their details without creating an account.</p></div></div>
            <div className="feature"><span>03</span><div><h3>Remember context</h3><p>The record-meeting flow (consent, notes, shared summary, follow-up actions) is the path we are polishing before CRM sync.</p></div></div>
          </div>
        </div>
      </section>

      <section className="roadmap section" id="plan">
        <div className="section-label">04 / Practical route</div>
        <div className="roadmap-head">
          <h2>Prove the habit<br /><em>before scale.</em></h2>
          <p>Web app first. Native apps, NFC, ambient recording, and enterprise integrations come after the share → capture → context loop feels obvious.</p>
        </div>
        <div className="phases">
          {phases.map(([phase, title, text, time]) => (
            <article key={phase}>
              <div><span>{phase}</span><b>{time}</b></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <div className="metric">
          <div className="metric-window">
            <span>Success window</span>
            <strong>72h</strong>
          </div>
          <div className="metric-copy">
            <span>The metric that matters</span>
            <h3>Follow-up completed, not merely drafted.</h3>
            <p>Measure the share of captured contacts who receive a reviewed, completed follow-up within three days of the meeting.</p>
          </div>
        </div>
      </section>

      <footer>
        <div><BrandMark className="brand-mark" size={38} /><strong>ehllo</strong></div>
        <p>Share identity. Capture people. Remember context. Activate later.</p>
        <LinkButton variant="ghost" href="/auth?next=/onboarding">Open the app <ArrowUpIcon size={15} weight="bold" /></LinkButton>
      </footer>
    </main>
  );
}
