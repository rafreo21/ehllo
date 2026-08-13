import type { Metadata } from "next";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { BrandMark } from "../components/BrandMark";

export const metadata: Metadata = {
  title: "Privacy Policy · ehllo",
  description: "How ehllo collects, uses, and protects your data, including data accessed through Google and Microsoft integrations.",
};

const LAST_UPDATED = "August 10, 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-[760px] px-6 py-16 text-[#163300]">
      <a href="/" className="mb-10 inline-flex items-center gap-2 text-sm font-bold text-[#163300] hover:text-[#0e0f0c]">
        <ArrowLeftIcon size={15} weight="bold" />
        ehllo
      </a>
      <div className="mb-10 flex items-center gap-3">
        <BrandMark size={36} />
        <div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Privacy Policy</h1>
          <p className="mt-1 text-sm text-[#454745]">Last updated {LAST_UPDATED}</p>
        </div>
      </div>

      <div className="space-y-10 text-[15px] leading-relaxed text-[#163300]">
        <section>
          <p>
            ehllo (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a relationship workspace: you capture the people
            you meet, record what mattered, and get help turning that into a follow-up. This policy explains
            what data we collect, why, and how you stay in control of it &mdash; including data we access
            through optional Google and Microsoft account connections.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold tracking-tight">Data you give us directly</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Account information</strong> &mdash; your name, email address, and profile details when you sign up or sign in.</li>
            <li><strong>Contacts and encounters</strong> &mdash; people you capture, meeting notes, voice recordings you choose to transcribe, and shared meeting summaries.</li>
            <li><strong>Follow-ups</strong> &mdash; AI-drafted next actions generated from your notes, which you review and approve before anything is sent.</li>
            <li><strong>Events</strong> &mdash; events you add manually or paste a link for, and your going/not-going status for them.</li>
            <li><strong>Your public card</strong> &mdash; the profile information you choose to share when someone scans your QR code or visits your public link.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold tracking-tight">Data from Google and Microsoft (optional)</h2>
          <p className="mb-3">
            Connecting a Google or Microsoft account is entirely optional and is separate from signing in to
            ehllo. If you choose to connect one from Settings, we request only the following, and only for
            the purposes below:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Send email on your behalf</strong> (Gmail send / Outlook Mail.Send) &mdash; used only when
              you explicitly approve and send a follow-up email drafted in ehllo. We never read your inbox
              and never send anything without your review.
            </li>
            <li>
              <strong>View your calendar events</strong> (Google Calendar events / Microsoft Calendars.ReadWrite)
              &mdash; used to suggest events you may want to add to ehllo (for example, an upcoming meeting
              with external attendees) and, once you confirm an encounter happened during a calendar event, to
              automatically link the two together. We do not modify or delete your calendar events.
            </li>
            <li>
              <strong>App-created files</strong> (Google Drive drive.file / Microsoft OneDrive app folder) &mdash;
              scoped only to files ehllo itself creates; we cannot see or access any other file in your
              Drive or OneDrive.
            </li>
          </ul>
          <p className="mt-3">
            You can disconnect a Google or Microsoft account at any time from Settings &rarr; Connected
            accounts. Disconnecting immediately revokes our access and deletes the stored access/refresh
            tokens.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold tracking-tight">How we use your data</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>To operate the core product: capturing contacts, recording context, and drafting follow-ups.</li>
            <li>To generate AI summaries and follow-up drafts using third-party AI providers (currently Anthropic for text and Groq for transcription), who process the specific note or recording you submit and do not use it to train their own models under our agreements with them.</li>
            <li>To detect and suggest calendar events worth tracking, when you&apos;ve connected a calendar.</li>
            <li>To send transactional email (for example, magic-link sign-in) via our email provider.</li>
            <li>To keep the product secure and prevent abuse.</li>
          </ul>
          <p className="mt-3">We do not sell your data, and we do not use your private notes or contacts to serve ads.</p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold tracking-tight">Data sharing</h2>
          <p>
            We share data only with the service providers needed to run ehllo (hosting, database, AI
            processing, transactional email) under agreements that restrict them to providing that service, and
            with other ehllo users only to the extent you choose to share it &mdash; for example, publishing
            your card or sending someone a shared meeting summary. We do not share your connected Google or
            Microsoft data with any third party outside of what&apos;s described above.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold tracking-tight">Retention and deletion</h2>
          <p>
            You can export or delete your contacts, encounters, and account data at any time from Settings.
            Deleting your account removes your stored data, including any connected-account tokens, within a
            reasonable operational window.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold tracking-tight">Contact us</h2>
          <p>
            Questions about this policy or your data can be sent to{" "}
            <a className="font-bold underline" href="mailto:rafreo21@gmail.com">rafreo21@gmail.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
