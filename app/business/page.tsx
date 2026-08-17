"use client";

import { ArrowRight as ArrowRightIcon } from "react-feather";
import { TrendingUp as ChartLineUpIcon } from "react-feather";
import { CreditCard as IdentificationCardIcon } from "react-feather";
import { Send as PaperPlaneTiltIcon } from "react-feather";
import { Users as UsersThreeIcon } from "react-feather";
import { BusinessShell } from "../components/BusinessShell";
import { LinkButton } from "../components/Button";
import "../app/product.css";
import "../app/flow.css";

export default function BusinessHomePage() {
  return (
    <BusinessShell
      active="home"
      title="Business"
      subtitle="Business / not consumer pilot: CRM, activation, and outbound."
    >
      <div className="flow-page">
        <section className="dashboard-hero">
          <div>
            <span className="step-pill">Business</span>
            <h1>Activate relationship data.</h1>
            <p>Card creation plus Contacts CRM, Activate, and Outbound. Everyday share and capture live in the consumer app.</p>
          </div>
        </section>

        <div className="dashboard-grid">
          <article className="dashboard-card dashboard-card-primary">
            <span>Identity</span>
            <IdentificationCardIcon size={30} />
            <h2>Create your card</h2>
            <p>Same card creation flow as mobile. Publish the identity your team shares.</p>
            <LinkButton href="/business/cards">Open my card <ArrowRightIcon size={16} /></LinkButton>
          </article>
          <article className="dashboard-card">
            <span>CRM</span>
            <UsersThreeIcon size={30} />
            <h2>Contacts CRM</h2>
            <p>Directory, imports, and HubSpot-ready contact records.</p>
            <LinkButton variant="secondary" href="/business/contacts">Open contacts <ArrowRightIcon size={16} /></LinkButton>
          </article>
          <article className="dashboard-card">
            <span>Activate</span>
            <ChartLineUpIcon size={30} />
            <h2>Activate data</h2>
            <p>HubSpot sync, campaigns, team workspace, and connected accounts.</p>
            <LinkButton variant="secondary" href="/business/activate">Open Activate <ArrowRightIcon size={16} /></LinkButton>
          </article>
          <article className="dashboard-card">
            <span>Outbound</span>
            <PaperPlaneTiltIcon size={30} />
            <h2>Outbound queue</h2>
            <p>Review-first drafts before send. Not part of the consumer pilot.</p>
            <LinkButton variant="secondary" href="/business/outbound">Open outbound <ArrowRightIcon size={16} /></LinkButton>
          </article>
        </div>
      </div>
    </BusinessShell>
  );
}
