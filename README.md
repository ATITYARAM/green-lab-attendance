# Green Lab Attendance

Green Lab Attendance is a lightweight web application for recording student entry, exit, and time spent in the Green Lab.

## Architecture

- **Astro** — static frontend at the repository root
- **GitHub Pages** — hosts the generated frontend in `docs/`
- **Supabase Auth** — provides the browser authentication session
- **Cloudflare Worker** — handles authenticated attendance API requests
- **Supabase PostgreSQL** — stores students, browser registrations, and attendance sessions

The project is intentionally kept as a static frontend + hosted backend architecture, so students can use the system without being connected to the lab's local network.

## Project structure

```text
src/
├── layouts/          # Shared Astro layouts
└── pages/            # Astro pages

public/
├── css/              # Stylesheets
└── js/               # Frontend JavaScript

docs/                 # Generated GitHub Pages output
worker/               # Cloudflare Worker API
backend/              # Legacy local FastAPI implementation
astro.config.mjs
package.json
tsconfig.json
README.md
```

Astro is configured at the repository root. There is no nested Astro project.

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Start the development server

```bash
npm run dev
```

Astro will start a local development server and provide the local URL in the terminal.

### 3. Build the production site

```bash
npm run build
```

The production build is written to `docs/`. This keeps the existing GitHub Pages deployment structure unchanged.

### 4. Preview the production build

```bash
npm run preview
```

## Attendance workflow

1. A student registers the browser using their Student ID and name.
2. A random browser/device identifier is stored locally in `localStorage`.
3. The browser identifier is sent with authenticated API requests.
4. The home page checks the current attendance session from the backend.
5. If the student is outside the lab, the **Entry** action is available.
6. If the student is inside the lab, the **Exit** action is available.
7. Exit closes the active session and records the time spent.
8. The attendance page displays recent sessions using India Standard Time (`Asia/Kolkata`) for human-readable timestamps.

### Two-hour attendance limit

Each recorded entry has a server-side two-hour validity window.

- The expiry timestamp is stored in the attendance session in the database.
- A manual exit before two hours closes the session as a **manual exit**.
- When two hours are reached, the session is closed as an **automatic exit** with a recorded duration of 120 minutes.
- Automatic expiry is performed by Supabase Cron every minute, so it does not depend on the student's browser, JavaScript timers, local storage, or device remaining online.
- The attendance API also checks expiry synchronously, so a session cannot be kept active by avoiding a browser refresh or by reaching the API just after the two-hour boundary.

The browser may display a countdown and refresh the current state periodically, but the database is the source of truth for the two-hour rule.



### Browser identity

The browser identifier is a random locally stored value. It is **not** a physical device identifier and does not use IMEI, MAC address, GPS, SIM information, or fingerprinting.

A student can use multiple browsers/devices. Each browser has its own locally stored identifier.

Because the identifier is stored in browser `localStorage`, clearing site data, using private browsing, or switching browsers can result in a new browser identity and require registration again.

## QR entry and exit

The system provides separate pages for QR-based attendance actions:

- `entry.html` — opens the entry flow
- `exit.html` — opens the exit flow
- `qr.html` — generates/prints the QR codes

The QR code only needs to open the corresponding web page. Attendance status and recording are handled by the application and Worker API.

## Backend API

The Cloudflare Worker source is located at:

```text
worker/src/index.js
```

The frontend communicates with the Worker through the configured Worker URL. Authenticated requests include the Supabase access token and the locally stored browser identifier.

The legacy FastAPI implementation remains under `backend/` for local development/reference and is not required for the deployed GitHub Pages workflow.

## Configuration and security

Frontend Supabase configuration is stored in:

```text
public/js/config.js
```

Only the Supabase publishable/anonymous client key should be exposed to the frontend.

Never commit:

- Supabase service-role keys
- database passwords
- Cloudflare secrets
- private credentials
- local environment files containing secrets

Worker secrets should be configured through Cloudflare rather than committed to the repository.

## Deployment

The frontend is built with Astro and the generated `docs/` directory is deployed through GitHub Pages.

The API runs separately on Cloudflare Workers and uses Supabase for authentication and persistent data.

Typical update flow:

```bash
npm run build
git status
git add .
git commit -m "your message"
git push origin green
```

## Status

The project currently provides the core registration, browser identity, QR entry/exit, attendance session, time tracking, and attendance history flow. Administrative reporting and further attendance-management features can be added on top of this foundation.
