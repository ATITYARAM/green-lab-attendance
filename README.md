# Green Lab Attendance

Green Lab student attendance and lab time tracking system.

## Stack

- Astro static frontend
- GitHub Pages for the static site
- Supabase Auth for browser sessions
- Cloudflare Worker for API requests
- Supabase PostgreSQL for persistent attendance data

## Project structure

```text
src/
  layouts/
  pages/

public/
  css/
  js/

docs/                 # Generated GitHub Pages output
worker/               # Cloudflare Worker API
backend/              # Legacy local FastAPI implementation
astro.config.mjs
package.json
tsconfig.json
```

The repository uses Astro at the root. There is no nested Astro project.

## Development

Install dependencies:

```bash
npm install
```

Start the Astro development server:

```bash
npm run dev
```

Build the static GitHub Pages site:

```bash
npm run build
```

The Astro build writes the static site to `docs/` so the existing GitHub Pages deployment path remains unchanged.

## Attendance flow

Student registration creates a Supabase anonymous session and links the browser session to the registered student.

The attendance pages use the existing Worker API to:

- identify the registered student
- record entry
- record exit
- calculate time spent
- display recent attendance

The QR entry and exit pages remain:

- `entry.html`
- `exit.html`

## Cloudflare Worker

Worker source:

`worker/src/index.js`

Runtime configuration:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` as a Worker secret

Never commit database passwords or service-role keys.
