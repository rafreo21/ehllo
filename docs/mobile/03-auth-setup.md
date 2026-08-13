# Mobile auth setup

ehllo uses **6-digit email codes** for passwordless sign-in (no magic links).

## Standard stack

| Piece | Role |
|-------|------|
| **Supabase Auth** | Generates OTP, verifies `verifyOtp` |
| **Send Email hook** | Edge function `send-auth-email` |
| **Resend** | Delivers code-only emails |

No Vercel Resend integration required. Resend MCP (`https://mcp.resend.com/mcp`) can manage API keys and domains.

## One-time setup

Add to `site/.env.local`:

```dotenv
SUPABASE_ACCESS_TOKEN=sbp_...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=ehllo <onboarding@resend.dev>
SEND_EMAIL_HOOK_SECRET=v1,whsec_...
```

Then:

```bash
cd site
npm run deploy:send-auth-email   # edge function
npm run configure:supabase-auth  # hook + secrets + redirect URLs
```

**Testing sender:** `onboarding@resend.dev` only delivers to the email on your Resend account. For any recipient, add a domain in [Resend Domains](https://resend.com/domains) and set `RESEND_FROM_EMAIL=ehllo <auth@yourdomain.com>`.

## Mobile `.env`

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://tgpzxgrvdmmwnodxrooh.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
EXPO_PUBLIC_CARD_BASE_URL=https://aftermeet-beta.vercel.app
```

## Sign-in flow

1. Enter email → **Continue**
2. Enter **6-digit code** from email → **Verify**

## Useful links (open in your browser)

- [Resend API keys](https://resend.com/api-keys)
- [Resend domains](https://resend.com/domains)
- [Supabase Auth hooks](https://supabase.com/dashboard/project/tgpzxgrvdmmwnodxrooh/auth/hooks)
- [Resend MCP docs](https://resend.com/docs/mcp-server)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No email | Check [Resend logs](https://resend.com/emails); confirm sender domain |
| Link instead of code | Send Email hook must be enabled (rerun configure script) |
| Invalid code | Use newest email; codes expire quickly |
| Expo Go SDK mismatch | Install SDK 57 from https://expo.dev/go |
