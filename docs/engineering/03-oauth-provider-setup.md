# OAuth provider setup (Google, LinkedIn, X)

ehllo already supports social sign-in in the app. Providers stay disabled until you create OAuth apps and register credentials in Supabase.

**Supabase project:** `tgpzxgrvdmmwnodxrooh`  
**Provider callback URL (register this in every OAuth app):**

`https://tgpzxgrvdmmwnodxrooh.supabase.co/auth/v1/callback`

**App callback URL (register in Supabase redirect allow list):**

- `http://localhost:3000/auth/callback`
- `http://localhost:3001/auth/callback` (if port 3000 is taken)
- Your production URL, e.g. `https://ehllo.io/auth/callback`

When a provider is enabled, `/auth` picks it up automatically — no deploy required.

---

## 1. Google

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth client ID** → **Web application**.
3. **Authorized JavaScript origins**
   - `http://localhost:3000`
   - Your production origin (when you have one)
4. **Authorized redirect URIs**
   - `https://tgpzxgrvdmmwnodxrooh.supabase.co/auth/v1/callback`
5. Save the **Client ID** and **Client secret**.

Guide: [Supabase — Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)

---

## 2. LinkedIn (OIDC)

Use **LinkedIn (OIDC)** in Supabase, not the legacy LinkedIn provider.

1. Open [LinkedIn Developer Apps](https://www.linkedin.com/developers/apps).
2. Create an app (or open an existing one).
3. Under **Auth**, add this **Redirect URL**:

   `https://tgpzxgrvdmmwnodxrooh.supabase.co/auth/v1/callback`

4. Enable **Sign In with LinkedIn using OpenID Connect**.
5. Copy the **Client ID** and **Client secret** from the Auth tab.

Guide: [Supabase — Login with LinkedIn](https://supabase.com/docs/guides/auth/social-login/auth-linkedin)

---

## 3. X (OAuth 2.0)

Use **X / Twitter (OAuth 2.0)**, not OAuth 1.0a.

1. Open [X Developer Portal](https://developer.x.com/en/portal/dashboard).
2. Create a project and app (or use an existing one).
3. Under **User authentication settings** → **Set up**:
   - Turn on **Request email from users**
   - App type: **Web App**
   - **Callback URL:** `https://tgpzxgrvdmmwnodxrooh.supabase.co/auth/v1/callback`
   - **Website URL:** `http://localhost:3000` for local dev (or your production URL)
4. On **Keys and tokens**, copy **Client ID** and regenerate/copy **Client secret**.

Guide: [Supabase — Login with X](https://supabase.com/docs/guides/auth/social-login/auth-twitter)

---

## 4. Register credentials in Supabase

### Option A — Dashboard (manual)

1. [Supabase → Authentication → Providers](https://supabase.com/dashboard/project/tgpzxgrvdmmwnodxrooh/auth/providers)
2. Enable **Google**, **LinkedIn (OIDC)**, and **X / Twitter (OAuth 2.0)** with the client IDs/secrets from above.
3. [Supabase → Authentication → URL Configuration](https://supabase.com/dashboard/project/tgpzxgrvdmmwnodxrooh/auth/url-configuration)
   - **Site URL:** `https://ehllo.io` (production) or `http://localhost:3000` (local)
   - **Redirect URLs:** add production and localhost callback URLs listed above

### Option C — Redirect URLs only

If OAuth credentials are already configured and you only need production redirects:

```bash
export SUPABASE_ACCESS_TOKEN="sbp_..."
node scripts/configure-auth-redirects.mjs
```

1. Create a [Supabase personal access token](https://supabase.com/dashboard/account/tokens).
2. Export credentials and run:

```bash
cd aftermeet/site

export SUPABASE_ACCESS_TOKEN="sbp_..."
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
export LINKEDIN_CLIENT_ID="..."
export LINKEDIN_CLIENT_SECRET="..."
export X_CLIENT_ID="..."
export X_CLIENT_SECRET="..."

node scripts/configure-oauth-providers.mjs
```

The script also sets `site_url` and `uri_allow_list` for local dev.

---

## 5. Verify

1. Open `http://localhost:3000/auth` (or `:3001`).
2. Google / LinkedIn / X buttons should show **Account** or **Profile**, not **Soon**.
3. Complete a test sign-in; you should land on `/auth/callback` then `/onboarding` or `/app`.

If OAuth fails after redirect:

- Confirm the provider callback URL matches Supabase exactly.
- Confirm `/auth/callback` is in Supabase **Redirect URLs**.
- Confirm `NEXT_PUBLIC_APP_URL` in `.env.local` matches the port you use locally.
