# tldr

tldr is a website-first reading simplifier that offers instant, client-side analysis and optional AI-powered simplification per paragraph. It is designed to support a future browser extension.

## Features

- Paste text and get readability insights, keyword highlights, and key sentences.
- Opt-in AI simplification per paragraph (no streaming responses).
- Auth.js OAuth login with Google and GitHub.
- Supabase Postgres persistence for profiles, usage, and cached simplifications.
- Stripe subscriptions with Free, Starter, and Pro tiers plus a 14-day free trial.
- Extension token minting endpoint ready for browser extension integration.

## PowerShell setup (Windows)

1. Install dependencies:

```powershell
npm install
```

2. Create a `.env.local` file based on `.env.example` and fill in all secrets.

3. Apply the Supabase schema:

- Open the Supabase SQL editor.
- Paste the contents of `supabase/schema.sql`.
- Run the query.

4. Configure OAuth redirect URLs:

- Local: `http://localhost:3000/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/github`
- Production: `https://your-domain.com/api/auth/callback/google` and `https://your-domain.com/api/auth/callback/github`

5. Configure Stripe webhooks:

- Local testing:

```powershell
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

- Production: set the webhook endpoint to `https://your-domain.com/api/stripe/webhook`

6. Run the development server:

```powershell
npm run dev
```

Open `http://localhost:3000` in your browser.

## Environment variables

See `.env.example` for the full list of required environment variables.
