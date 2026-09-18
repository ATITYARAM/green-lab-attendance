# Green Lab Attendance

Green Lab student attendance and lab time tracking system.

## Deployment architecture

Student browser
-> GitHub Pages
-> Supabase Auth (anonymous session)
-> Cloudflare Worker
-> Supabase PostgreSQL + RLS

The browser uses Supabase Auth only to create/restore its anonymous session. Student registration and attendance data operations go through the Cloudflare Worker.

## GitHub repository

Repository: RakhulJM/green-lab-attendance
Active deployment branch: green

GitHub Pages:
- Source branch: green
- Folder: /docs

Cloudflare Worker source:
- worker/src/index.js
- worker/wrangler.toml

## Cloudflare Worker

Worker name:

green-lab

Worker URL:

https://green-lab.atityaramsureshmanickam.workers.dev

### API routes

GET /
GET /health
POST /students/register
GET /students/me
GET /attendance/current
GET /attendance/history
POST /attendance/entry
POST /attendance/exit

### Exact Worker source

The deployable Worker source is stored in:

worker/src/index.js

Paste that file into Cloudflare Workers if creating the Worker from the Cloudflare dashboard.

The Worker:
1. Accepts CORS requests from GitHub Pages.
2. Reads the Supabase Auth bearer token from Authorization.
3. Verifies the token by calling Supabase Auth.
4. Finds the student linked to that Auth user.
5. Reads/writes attendance through the Supabase REST API.
6. Never requires a Supabase service-role key.

## Cloudflare runtime configuration

Set these in the Cloudflare Worker.

Variable:
SUPABASE_URL

Value:
https://dvxfxbvdsubigemrqiph.supabase.co

Secret:
SUPABASE_PUBLISHABLE_KEY

Value:
Use the Green Lab Supabase publishable key.

Recommended CLI setup:

npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler deploy

Do NOT put a database connection password or Supabase service-role key in GitHub or in public Worker code.

SUPABASE_URL is already defined in worker/wrangler.toml.

## Cloudflare dashboard setup

When creating the Worker:
1. Create Worker named green-lab.
2. Replace the starter Worker code with worker/src/index.js.
3. Deploy it.
4. Open Settings -> Variables and Secrets.
5. Add SUPABASE_URL as a variable.
6. Add SUPABASE_PUBLISHABLE_KEY as a secret.
7. Redeploy if the dashboard requests it.
8. Confirm the Worker URL is:
   https://green-lab.atityaramsureshmanickam.workers.dev

## Supabase

Project: Green Lab
Project ref: dvxfxbvdsubigemrqiph
Region: ap-northeast-1

Required:
- Anonymous Sign-Ins enabled.
- RLS enabled on students and attendance_sessions.
- students.auth_user_id linked to the Supabase Auth user.

The publishable key is safe to use in browser/Worker public applications, but it does not replace RLS. Never use a service-role key in frontend code.

## Local deployment

From the repository:

cd worker
npm install -D wrangler
npx wrangler login
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler deploy

## Legacy backend

backend/ contains the previous FastAPI implementation. It is not required for the current green deployment.
