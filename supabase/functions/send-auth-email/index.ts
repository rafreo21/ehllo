import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend@4.0.1";

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const hookSecretRaw = Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "";
const hookSecret = hookSecretRaw.replace(/^v1,whsec_/, "");
const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "Ehllo <onboarding@resend.dev>";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

function subjectFor(action: string) {
  if (action === "recovery") return "Reset your Ehllo password";
  if (action === "signup") return "Confirm your Ehllo email";
  if (action === "email_change") return "Confirm your new Ehllo email";
  return "Your Ehllo sign-in code";
}

function htmlFor(action: string, token: string) {
  const intro =
    action === "recovery"
      ? "Enter this code to reset your password:"
      : action === "signup"
        ? "Enter this code to confirm your email:"
        : "Enter this 6-digit code in Ehllo to sign in:";

  return `<h2>${subjectFor(action)}</h2>
<p>${intro}</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:20px 0">${token}</p>
<p>This code expires shortly and can only be used once.</p>
<p>If you didn't request this, you can ignore this email.</p>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  if (!resend || !hookSecret) {
    return Response.json(
      { error: { message: "Email delivery is not configured (missing RESEND_API_KEY or hook secret)." } },
      { status: 500 },
    );
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(hookSecret);

  try {
    const { user, email_data } = wh.verify(payload, headers) as {
      user: { email: string; new_email?: string };
      email_data: {
        token: string;
        token_new?: string;
        email_action_type: string;
      };
    };

    const action = email_data.email_action_type;
    const sends: Array<{ to: string; token: string }> = [];

    if (action === "email_change" && email_data.token_new && user.new_email) {
      sends.push({ to: user.email, token: email_data.token });
      sends.push({ to: user.new_email, token: email_data.token_new });
    } else {
      sends.push({ to: user.email, token: email_data.token });
    }

    for (const send of sends) {
      const { error } = await resend.emails.send({
        from: fromEmail,
        to: [send.to],
        subject: subjectFor(action),
        html: htmlFor(action, send.token),
      });
      if (error) throw error;
    }

    return Response.json({}, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send auth email";
    const status = message.toLowerCase().includes("only send testing emails") ? 422 : 500;
    return Response.json({ error: { message } }, { status });
  }
});
