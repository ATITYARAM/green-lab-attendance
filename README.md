# Green Lab Attendance

Simple attendance and lab time-tracking system for Green Lab.

## Architecture

Student -> GitHub Pages -> Cloudflare Worker -> Supabase Green Lab

The green branch contains the GitHub Pages frontend and Cloudflare Worker source.

## Cloudflare Worker

Worker URL:

https://green-lab.atityaramsureshmanickam.workers.dev

Source:

worker/src/index.js

Configuration:

worker/wrangler.toml

Routes:

- GET / - Worker status
- GET /health - health check
- POST /students/register - register the authenticated browser
- GET /students/me - current student
- GET /attendance/current - active session
- GET /attendance/history - recent attendance
- POST /attendance/entry - mark entry
- POST /attendance/exit - mark exit

The Worker forwards the user's Supabase Auth JWT to Supabase. It does not use a service-role key.

## Cloudflare runtime variables

Set these in the Worker:

SUPABASE_URL
https://dvxfxbvdsubigemrqiph.supabase.co

SUPABASE_PUBLISHABLE_KEY
Use the Green Lab Supabase publishable key.

Recommended deployment command:

npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler deploy

SUPABASE_URL is non-secret and is already in wrangler.toml.

Never commit a database password, service-role key, or other privileged secret.

## Supabase

Project: Green Lab
Project ref: dvxfxbvdsubigemrqiph
Region: ap-northeast-1

Enable Anonymous Sign-Ins in Supabase Auth.

RLS must remain enabled on the application tables.

## GitHub Pages

Publish the docs/ directory from the green branch using GitHub Pages.

docs/js/worker.js contains the Worker URL and sends the current Supabase Auth bearer token to the Worker.

The existing Supabase client is still used for Auth session management. Application data requests can use the Worker API.

## Legacy backend

The existing FastAPI backend remains in the repository for reference. It is not required for the Worker/GitHub Pages deployment.
