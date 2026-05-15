# Droparabia Full Funnel — Handoff Guide for Claude

This document describes the complete tracking and subscription system built in `d:\Projects\droparabia-landing`.
It tells you exactly how it was built, how it works, and how to implement the same system on top of the existing survey setup in this directory (`d:\Projects\droparabia-book`).

---

## Overview of the Full Flow

```
Landing Page (VSL)
      ↓
User fills inline subscribe form (name, email, phone)
      ↓
POST /api/subscribe → Brevo list: "VSL Subscribed" (ID 11)
      ↓
userData saved to sessionStorage → video unlocks
      ↓
User clicks "Book a Call" CTA → /survey
      ↓
/survey page loads → POST /api/subscribe → Brevo list: "Didn't Finish Survey" (ID 6)
      ↓
User answers 6 questions
      ↓
isQualified?
  YES → POST /api/subscribe → Brevo list: "Qualified No Book" (ID 7) → /choose-schedule
  NO  → POST /api/subscribe → Brevo list: "Unqualified" (ID 10)      → /get-free-program
      ↓
/choose-schedule: User books via Calendly
      ↓
POST /api/subscribe → Brevo list: "Booked" (ID 12) → redirect to thank-you page
```

---

## Why a Server-Side API Route (Not Direct Brevo Forms)

The original approach used Brevo's hosted embed forms with `no-cors` fetch or `sendBeacon`.
The problem: with `no-cors` you cannot read the response — you never know if it succeeded.
With `sendBeacon` it fires on page unload but also can't confirm success.

The solution: a server-side Astro API route (`src/pages/api/subscribe.ts`) that:
- Receives `{ name, email, phone, list }` as JSON
- Calls the Brevo REST API directly using an API key
- Returns `{ success: true }` or `{ success: false, error: "..." }`
- Lets the client `await` the response before proceeding

This means every subscription is confirmed before the next step happens.

---

## The Server-Side Subscribe Endpoint

**File:** `src/pages/api/subscribe.ts`

```typescript
export const prerender = false;

import type { APIRoute } from 'astro';

function getListId(list: string): number | null {
  switch (list) {
    case 'vsl':               return Number(import.meta.env.BREVO_LIST_VSL_SUBSCRIBED)      || null;
    case 'survey':            return Number(import.meta.env.BREVO_LIST_DIDNT_FINISH_SURVEY)  || null;
    case 'qualified_no_book': return Number(import.meta.env.BREVO_LIST_QUALIFIED_NO_BOOK)    || null;
    case 'unqualified':       return Number(import.meta.env.BREVO_LIST_UNQUALIFIED)          || null;
    case 'booked':            return Number(import.meta.env.BREVO_LIST_BOOKED)               || null;
    default:                  return null;
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, email, phone, list } = body;

    if (!email || !list) {
      return json({ success: false, error: 'Missing email or list' }, 400);
    }

    const listId = getListId(list);
    if (!listId) {
      return json({ success: false, error: `Unknown or unconfigured list: ${list}` }, 400);
    }

    const nameParts = (name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': import.meta.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        email,
        attributes: {
          FIRSTNAME: firstName,
          LASTNAME: lastName,
          SMS: phone ? (phone.startsWith('+') ? phone : '+961' + phone) : '',
        },
        listIds: [listId],
        updateEnabled: true,
      }),
    });

    if (res.status === 201 || res.status === 204) {
      return json({ success: true }, 200);
    }

    const errBody = await res.text();
    return json({ success: false, error: errBody }, res.status);

  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Critical notes:**
- Use a `switch` statement for env vars — `import.meta.env[dynamicKey]` does NOT work in Vite (static replacement only)
- Phone must be prefixed with `+961` if not already international format — Brevo rejects bare numbers
- `updateEnabled: true` means existing contacts get their list updated instead of throwing a duplicate error
- Brevo returns `201` for new contacts and `204` for updated contacts — both are success

---

## Environment Variables

Create a `.env` file at the project root. These are the actual values:

```
BREVO_API_KEY=REDACTED

# Brevo list IDs
BREVO_LIST_VSL_SUBSCRIBED=11
BREVO_LIST_DIDNT_FINISH_SURVEY=6
BREVO_LIST_QUALIFIED_NO_BOOK=7
BREVO_LIST_UNQUALIFIED=10
BREVO_LIST_BOOKED=12
```

**Make sure `.env` is in `.gitignore`.** Never commit it.

When deploying to Cloudflare Pages, add all 6 variables in:
Cloudflare Pages → your project → Settings → Environment Variables

---

## Brevo List IDs Reference

| List Name | ID | Subscribed when |
|---|---|---|
| VSL Subscribed | 11 | User submits the VSL gate form |
| Didn't Finish Survey | 6 | User lands on /survey page |
| Qualified — No Book | 7 | Survey completed + qualified (before redirect to /choose-schedule) |
| Unqualified | 10 | Survey completed + not qualified (before redirect to /get-free-program) |
| Booked a Call | 12 | Calendly `event_scheduled` fires on /choose-schedule |

---

## SessionStorage System

All user data and page-access tokens are stored in `sessionStorage` (not localStorage — clears on tab close).

### Keys

**`userData`** — written on VSL form success, read by every downstream page:
```js
sessionStorage.setItem('userData', JSON.stringify({ name, email, phone }));
```

**`userTokens`** — object of access tokens gating each page:
```js
// Written on survey page load:
tokens.takeSurvey = Math.random().toString(36).substring(2) + Date.now().toString(36);

// Written on survey completion:
tokens[qualified ? 'qualified' : 'unqualified'] = Math.random().toString(36).substring(2) + Date.now().toString(36);
```

### How pages check tokens

Every gated page runs an inline IIFE before showing any content:

```js
(function() {
  try {
    const tokens = JSON.parse(sessionStorage.getItem('userTokens') || '{}');
    if (tokens.qualified) {
      document.getElementById('main-content').style.display = 'block';
      // initialize Calendly etc.
    } else {
      document.getElementById('no-access').style.display = 'flex';
    }
  } catch(_) {
    document.getElementById('no-access').style.display = 'flex';
  }
})();
```

The page HTML starts with both `#main-content` and `#no-access` set to `display:none`.
The IIFE reveals exactly one of them before the page is visible — no flash.

---

## The Survey Page (Pure Vanilla HTML/JS)

**Important:** Do NOT use React for the survey. A React JSX runtime error (`jsxDEV is not a function`) breaks the page in production. The survey was completely rewritten as pure vanilla HTML/JS and works perfectly.

### Structure

- 6 questions, one visible at a time using `style="display:none"` on Q2–Q6 (not CSS classes — Astro scoped CSS doesn't apply reliably to inline elements)
- Progress bar and "Question X of 6" counter updated via JS
- Loading overlay shown while the `/api/subscribe` call completes for the `survey` list
- Previous/Next navigation with validation

### Qualification Logic

```js
var qualified =
  answers.budget !== 'no' &&
  answers.time !== 'no' &&
  (answers.effort === 'willing' || answers.effort === 'whatever') &&
  answers.startTime !== 'notReady';
```

### Subscription on completion

```js
var list = qualified ? 'qualified_no_book' : 'unqualified';
var userData = JSON.parse(sessionStorage.getItem('userData') || '{}');

if (userData.email) {
  fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: userData.name, email: userData.email, phone: userData.phone, list }),
  }).finally(function() {
    window.location.href = qualified ? '/choose-schedule' : '/get-free-program';
  });
} else {
  window.location.href = qualified ? '/choose-schedule' : '/get-free-program';
}
```

`.finally()` ensures the redirect happens regardless of success or failure.

### Survey loading sequence

```js
(async function() {
  // 1. Set takeSurvey token
  var tokens = JSON.parse(sessionStorage.getItem('userTokens') || '{}');
  tokens.takeSurvey = Math.random().toString(36).substring(2) + Date.now().toString(36);
  sessionStorage.setItem('userTokens', JSON.stringify(tokens));

  // 2. Push GTM event
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: 'survey_started' });

  // 3. Subscribe to "Didn't Finish Survey" list (awaited — user sees spinner)
  var userData = JSON.parse(sessionStorage.getItem('userData') || 'null');
  if (userData && userData.email) {
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: userData.name, email: userData.email, phone: userData.phone, list: 'survey' }),
    });
  }

  // 4. Hide spinner, show survey
  document.getElementById('survey-loader').style.display = 'none';
  document.getElementById('survey-content').style.display = 'flex';
})();
```

---

## The Choose-Schedule Page (/choose-schedule)

- Token check: must have `userTokens.qualified` or shows "No cheating" screen
- Confetti animation fires on `DOMContentLoaded` (canvas-confetti CDN)
- Calendly inline widget initialized via JS API (NOT `data-url` attribute):
  ```js
  Calendly.initInlineWidget({
    url: 'https://calendly.com/d/cx6h-n22-cr7/45-min-droparabia-advisory-call',
    parentElement: document.getElementById('calendly-widget'),
  });
  ```
- Loading spinner shown while Calendly loads, hidden on `calendly.profile_page_viewed` or after 5s fallback
- On booking confirmed:
  ```js
  window.addEventListener('message', function(e) {
    if (e.data && e.data.event === 'calendly.event_scheduled') {
      silentBrevoSubmit('booked').then(function() {
        window.location.href = 'https://thank-you.droparabia.com';
      });
    }
  });
  ```
- `silentBrevoSubmit` reads `userData` from sessionStorage and POSTs to `/api/subscribe`
- On `beforeunload` without booking: pushes `call_not_booked` GTM event (NO Brevo call — already handled at survey completion)

---

## The Get-Free-Program Page (/get-free-program)

- Token check: must have `userTokens.unqualified`
- Shows free guide download button + Instagram follow button
- No Brevo call here — subscription to `unqualified` list already happened at survey completion
- No forms, no hidden auto-submit — completely passive page

---

## GTM Data Layer Events

| Event | Where fired | Payload |
|---|---|---|
| `subscription_success_inline` | index.astro — inline VSL form success | — |
| `subscription_success_popup` | index.astro — modal VSL form success | — |
| `survey_started` | survey.astro — on page load | — |
| `survey_completed` | survey.astro — on last question answered | `survey_qualified`, `user_name`, `user_email`, `user_phone` |
| `survey_abandoned` | survey.astro — `beforeunload` if not completed | — |
| `call_booked` | choose-schedule.astro — Calendly event_scheduled | — |
| `call_not_booked` | choose-schedule.astro — `beforeunload` if no booking | — |
| `video_complete` | index.astro — user reaches 80% of video | — |

---

## Cloudflare Pages Deployment

### The Problem with @astrojs/cloudflare v13

`@astrojs/cloudflare` v13 changed its build output format. It now produces:
- `dist/client/` — static HTML and assets
- `dist/server/` — Cloudflare Worker code (`entry.mjs`)

But Cloudflare Pages Advanced Mode expects `dist/_worker.js` at the output root.
Without it, Cloudflare Pages returns 404 on everything.

### The Fix: `output: 'static'` + postbuild shim

**`astro.config.mjs`:**
```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  devToolbar: { enabled: false },
  site: 'https://droparabia.com',
  output: 'static',
  adapter: cloudflare(),
  integrations: [react()],
});
```

With `output: 'static'`:
- All Astro pages are pre-rendered to static HTML at build time (fast, no SSR needed)
- Only routes marked `export const prerender = false` are handled by the worker (i.e. `/api/subscribe`)

**`postbuild.mjs`** (at project root):
```js
import { cpSync, writeFileSync } from 'node:fs';

// Copy pre-rendered HTML/assets to dist root so Cloudflare Pages serves them directly
cpSync('dist/client', 'dist', { recursive: true });

// Create _worker.js shim — activates Cloudflare Pages Advanced Mode
// Cloudflare serves static files BEFORE calling the worker, so this only
// handles truly dynamic routes (e.g. /api/subscribe)
writeFileSync('dist/_worker.js', `export { default } from './server/entry.mjs';\n`);

console.log('[postbuild] dist/ ready for Cloudflare Pages (Advanced Mode)');
```

**`package.json` build script:**
```json
"build": "astro build && node postbuild.mjs"
```

### How Cloudflare Pages Advanced Mode works

1. A request comes in to `/survey`
2. Cloudflare finds `dist/survey/index.html` → serves it directly (no worker involved)
3. A request comes in to `/api/subscribe`
4. No matching static file → Cloudflare calls `dist/_worker.js`
5. Worker (`dist/server/entry.mjs`) handles the request and calls Brevo

### Cloudflare Pages Dashboard Settings

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Node.js version:** 20

### Cache Headers (`public/_headers`)

```
/*
  Cache-Control: no-cache, no-store, must-revalidate
  CDN-Cache-Control: no-store
  Pragma: no-cache
  Expires: 0
```

`CDN-Cache-Control: no-store` is Cloudflare-specific — it tells Cloudflare's edge cache not to cache responses. Without it, Cloudflare serves stale pages even after a successful deployment.

---

## Files to Create

To implement this system in your project, you need:

| File | Purpose |
|---|---|
| `src/pages/api/subscribe.ts` | Server-side Brevo API endpoint |
| `src/pages/survey.astro` | Vanilla JS survey (6 questions) |
| `src/pages/choose-schedule.astro` | Calendly booking page |
| `src/pages/get-free-program.astro` | Unqualified landing page |
| `postbuild.mjs` | Cloudflare Pages output shim |
| `.env` | API key + list IDs (never commit) |
| `public/_headers` | Cache control headers |

---

## Implementation Checklist

- [ ] Create `.env` with all 6 variables listed above
- [ ] Add `.env` to `.gitignore`
- [ ] Create `src/pages/api/subscribe.ts` (copy exactly as shown above)
- [ ] Change `astro.config.mjs` to `output: 'static'`
- [ ] Create `postbuild.mjs` at project root
- [ ] Update `package.json` build script to `astro build && node postbuild.mjs`
- [ ] Add `public/_headers` with CDN cache headers
- [ ] Rewrite survey page as pure vanilla HTML/JS (no React)
- [ ] Ensure all CTA buttons point to `/survey` (not directly to Calendly)
- [ ] Add environment variables to Cloudflare Pages dashboard
- [ ] Set build output directory to `dist` in Cloudflare Pages
- [ ] After deploy: purge Cloudflare cache (Dashboard → Caching → Purge Everything)
