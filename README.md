# Querent

**The social network where every post can be peer-reviewed.**
Science, made social. Rigor, made visible. Scientists, made human.

This repository is the private-beta codebase described in the *Technical Build Specification* (v1.1) and the *PRD* (v2.1).

## What works today

| Area | Implemented |
|---|---|
| Sign-in | Passwordless email links (15-minute, single-use, hashed), 30-day sessions in HttpOnly cookies |
| ORCID | Connect an ORCID iD via OAuth `/authenticate` scope (proves ownership only; never grants reviewer status) |
| Posts | Video explainer, Visual, Thread, Behind the Paper and Open Question formats; DOI field with Crossref lookup; AI-assistance disclosure |
| Rigor labels | Unreviewed · Source-linked · Source-checked · Expert-reviewed · Disputed · Source retracted, **derived** from sources, reviews and moderation (`src/lib/rigor.ts`), never from likes |
| Open peer review | Verified reviewers submit source-fidelity, methodological, statistical or clinical-relevance reviews with checklist, required conflict declaration, optional signature and study-quality ratings; labels update automatically |
| Discussion | Typed contributions (question, evidence, objection, interpretation, correction); evidence requires a DOI; threaded replies |
| Social | Feed (For you, Following, Reviewed, Open questions) with transparent ranking and a "Shown because…" line; likes and *insightful* reactions; saves; follows |
| Questions | Persistent questions with follow, linked posts and an evidence summary |
| Profiles | Bio, current work, ORCID, verified-reviewer badge, posts, reviews written, contribution credits |
| Moderation | Reports, moderator queue, Disputed state with public rationale, author notifications |
| Integrity | Append-only `audit_events` table (UPDATE/DELETE blocked by trigger) for posts, reviews, labels, reports and roles |
| Data rights | `GET /api/v1/me/export` downloads all of a user's data as JSON |
| Jobs | `npm run jobs:sync-sources` re-checks DOIs against Crossref, resolves pending ones and records corrections and retractions |
| API | `GET /api/v1/questions`, `GET /api/v1/posts/:id` (rigor + signed reviews), `GET /api/v1/me/export` |

## Stack

Next.js 15 (App Router, server actions) · React 19 · TypeScript · PostgreSQL 16 · Drizzle ORM · Zod · Vitest. No client-side state library; almost everything renders on the server.

## Run it locally

Requirements: Node 20.9+ and Docker (or any PostgreSQL 16).

```bash
docker compose up -d            # PostgreSQL on localhost:5432
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed                 # fictional demo people, questions and posts
npm run dev                     # http://localhost:3000
```

**Signing in during development:** without `RESEND_API_KEY`, the sign-in link is printed in the terminal running `npm run dev`. Open it in the browser.

Demo accounts (all fictional): `admin@example.com` (moderator + reviewer), `marcuslee@example.com`, `priyashah@example.com` (reviewers), `sofiamendes@example.com` (member).

**Granting roles:** a person signs in once, then:

```bash
npm run admin:grant -- someone@university.edu reviewer "Cardiology,Clinical trials"
npm run admin:grant -- someone@university.edu moderator
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Develop, build and serve |
| `npm test` | Unit tests (rigor rules, DOI parsing, Crossref mapping) |
| `npm run typecheck` | TypeScript check |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Load demo data (refuses to run in production) |
| `npm run jobs:sync-sources` | Nightly Crossref sync (schedule with cron) |
| `npm run admin:grant` | Grant a role |

## Project structure

```
src/
  app/                  routes (feed, posts, reviews, questions, profiles, moderation, settings, auth, api/v1)
    actions.ts          all server actions: validation, permissions, transactions, audit, notifications
  components/           ui.tsx (server), client.tsx (forms), rail.tsx
  db/                   schema.ts, migrate.ts, seed.ts
  lib/                  rigor.ts, doi.ts, queries.ts, auth.ts, audit.ts, email.ts, text.ts
  jobs/                 sync-sources.ts
drizzle/                SQL migrations (0001 makes audit_events append-only)
scripts/grant-role.ts
```

## Deploying

**Demo deployment on Vercel (no email provider needed):** import the repo in Vercel, add a Neon Postgres database from the Storage tab (it sets `DATABASE_URL`), and set `APP_URL` to the deployment URL, `ALLOW_DEMO_SEED=1` and `DEMO_ACCOUNTS=1`. The build runs migrations and seeds demo data on first deploy, and the sign-in page offers one-click demo accounts. Remove `DEMO_ACCOUNTS` and set `ALLOW_DEMO_SEED=0` before inviting real users.

**Production:**

1. Create a PostgreSQL database (Neon or Supabase) and set `DATABASE_URL`.
2. Deploy to Vercel; set `APP_URL`, `CROSSREF_MAILTO`, `RESEND_API_KEY`, `EMAIL_FROM` and, optionally, the `ORCID_*` variables.
3. Run `npm run db:migrate` against the production database (from CI or locally).
4. Schedule `npm run jobs:sync-sources` daily (Vercel Cron, GitHub Actions schedule or any worker).
5. Verify your sending domain in Resend (SPF, DKIM, DMARC) before inviting users.

## Next up (from the technical spec backlog)

- Video upload with Mux (direct upload, transcoding, auto-captions)
- Exporting completed reviews to ORCID (`/activities/update` scope)
- Rate limiting on writes and sign-in requests
- Reviewer verification workflow in the UI (currently `admin:grant`)
- Weekly digest emails and notification preferences
- Consent-gated product analytics (PostHog) and the WEGSI weekly metric job
- Project spaces for collaborations
- Accessibility audit (WCAG 2.2 AA) and load test before the beta

## Principles enforced in code

- Reach never changes rigor: reactions live in their own table and are not inputs to `computeRigor`.
- Unverified DOIs are labeled as such and can't be reviewed; metadata is never invented.
- Reviews require a declared conflict of interest; unsigned reviews still count for the reviewer but never appear on their public profile.
- Moderation decisions require a rationale that the author can see, and nothing is silently deleted.
