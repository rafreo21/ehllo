// Both dependencies use npm: specifiers. A remote https://esm.sh import is
// rejected at boot ("A remote specifier was requested ... but --no-remote is
// specified") by the runtime the Management API deploys into, which takes the
// whole sign-in path down rather than failing a single send.
import { Webhook } from "npm:standardwebhooks@1.0.0";
import { Resend } from "npm:resend@4.0.1";

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const hookSecretRaw = Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "";
const hookSecret = hookSecretRaw.replace(/^v1,whsec_/, "");
const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "ehllo <onboarding@resend.dev>";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Supabase Auth discards this function's response body and logs only
// "Unexpected status code returned from hook: <status>". Without an explicit
// log line the real provider failure is unrecoverable after the fact, which is
// exactly what made a total sign-in outage undiagnosable. Never log the token,
// the API key, or the hook secret - only the delivery failure itself.
function logFailure(stage: string, action: string, error: unknown) {
  const detail = error as { name?: string; statusCode?: number; message?: string } | null;
  console.error(
    JSON.stringify({
      scope: "send-auth-email",
      stage,
      action,
      provider: "resend",
      from: fromEmail,
      errorName: detail?.name ?? (error instanceof Error ? error.name : "unknown"),
      statusCode: detail?.statusCode ?? null,
      message: detail?.message ?? (error instanceof Error ? error.message : String(error)),
    }),
  );
}

function subjectFor(action: string) {
  if (action === "recovery") return "Reset your ehllo password";
  if (action === "signup") return "Confirm your ehllo email";
  if (action === "email_change") return "Confirm your new ehllo email";
  return "Your ehllo sign-in code";
}

function introFor(action: string) {
  if (action === "recovery") return "Enter this code to reset your password:";
  if (action === "signup") return "Enter this code to confirm your email:";
  return "Enter this 6-digit code in ehllo to sign in:";
}

/**
 * Plain-text alternative, sent alongside the HTML.
 *
 * An HTML-only message is a long-standing spam signal and Apple Mail weights it
 * heavily - sign-in codes were landing in iCloud junk. A multipart message with a
 * real text part is what a legitimate transactional sender looks like.
 */
function textFor(action: string, token: string) {
  return [
    subjectFor(action),
    "",
    introFor(action),
    "",
    token,
    "",
    "This code expires shortly and can only be used once.",
    "If you didn't request this, you can ignore this email.",
    "",
    "ehllo",
  ].join("\n");
}

/**
 * A complete HTML document rather than a fragment.
 *
 * This previously began at <h2> with no doctype, html, head or body, which
 * filters read as malformed. Together with the missing text part and a body that
 * was nothing but a large spaced-out number, it had the shape of the phishing mail
 * these filters are built to catch.
 */
function htmlFor(action: string, token: string) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${subjectFor(action)}</title></head>
<body style="margin:0;padding:24px;background:#f2f5f0;font-family:Arial,Helvetica,sans-serif;color:#163300">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 18px;font-size:18px;font-weight:700">ehllo</p>
<h2 style="margin:0 0 10px;font-size:20px">${subjectFor(action)}</h2>
<p style="margin:0 0 6px;font-size:15px;line-height:22px">${introFor(action)}</p>
<p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:18px 0;color:#163300">${token}</p>
<p style="margin:0 0 6px;font-size:14px;line-height:20px;color:#454745">This code expires shortly and can only be used once.</p>
<p style="margin:0;font-size:14px;line-height:20px;color:#454745">If you didn't request this, you can ignore this email.</p>
</div>
<p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:18px;color:#667363">Sent by ehllo because a sign-in was requested for this address.</p>
</body>
</html>`;
}

// Resend refuses external recipients until a sender domain is verified. That
// is a configuration state the operator must fix, not a transient fault, so it
// gets its own status code and is never retried as if it were an outage.
function isSenderNotVerified(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("only send testing emails") ||
    lower.includes("only send test") ||
    lower.includes("you can only send") ||
    lower.includes("to your own email address") ||
    lower.includes("unverified domain") ||
    lower.includes("domain is not verified") ||
    lower.includes("verify a domain") ||
    lower.includes("resend.com/domains") ||
    (lower.includes("not verified") && lower.includes("from"))
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  if (!resend || !hookSecret) {
    logFailure("config", "unknown", {
      message: `missing ${!resend ? "RESEND_API_KEY" : ""}${!resend && !hookSecret ? " and " : ""}${!hookSecret ? "SEND_EMAIL_HOOK_SECRET" : ""}`,
    });
    return Response.json(
      { error: { message: "Email delivery is not configured (missing RESEND_API_KEY or hook secret)." } },
      { status: 500 },
    );
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(hookSecret);

  let user: { email: string; new_email?: string };
  let email_data: { token: string; token_new?: string; email_action_type: string };
  try {
    ({ user, email_data } = wh.verify(payload, headers) as {
      user: { email: string; new_email?: string };
      email_data: { token: string; token_new?: string; email_action_type: string };
    });
  } catch (error) {
    // A signature failure means this project's auth hook secret and this
    // function's SEND_EMAIL_HOOK_SECRET have drifted apart - rerun
    // `npm run configure:supabase-auth` against this environment.
    logFailure("verify", "unknown", error);
    const message = error instanceof Error ? error.message : "Webhook verification failed";
    return Response.json({ error: { message: `Hook signature rejected: ${message}` } }, { status: 401 });
  }

  const action = email_data.email_action_type;
  const sends: Array<{ to: string; token: string }> = [];

  if (action === "email_change" && email_data.token_new && user.new_email) {
    sends.push({ to: user.email, token: email_data.token });
    sends.push({ to: user.new_email, token: email_data.token_new });
  } else {
    sends.push({ to: user.email, token: email_data.token });
  }

  for (const send of sends) {
    let error: unknown = null;
    try {
      ({ error } = await resend.emails.send({
        from: fromEmail,
        to: [send.to],
        subject: subjectFor(action),
        html: htmlFor(action, send.token),
        text: textFor(action, send.token),
      }));
    } catch (thrown) {
      error = thrown;
    }

    if (error) {
      logFailure("send", action, error);
      const detail = error as { message?: string };
      const message = detail?.message ?? (error instanceof Error ? error.message : "Failed to send auth email");
      return Response.json({ error: { message } }, { status: isSenderNotVerified(message) ? 422 : 500 });
    }
  }

  return Response.json({}, { status: 200 });
});
