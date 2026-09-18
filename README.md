# Green Lab Attendance

Simple attendance and lab time-tracking system for Green Lab.

## Architecture

```
Student
  |
  v
GitHub Pages (static HTML/CSS/JS)
  |
  | supabase-js
  v
Supabase "Green Lab"
  +-- Auth
  +-- PostgreSQL
  +-- Row Level Security
```

The `green` branch uses GitHub Pages + Supabase only. No FastAPI or Render deployment is required.

## Working flow

1. Student opens the GitHub Pages registration page.
2. The browser creates a Supabase anonymous Auth session.
3. Student enters Student ID and name.
4. The student record is stored in `students` and linked to the Auth user.
5. The attendance page identifies the same browser through Supabase Auth.
6. Mark Entry creates an `attendance_sessions` row.
7. Mark Exit updates the active row with exit time and duration.
8. Recent attendance is loaded directly from Supabase.
9. Row Level Security limits each browser session to its own student records.

## Supabase

Project: **Green Lab**  
Project ref: `dvxfxbvdsubigemrqiph`  
Region: `ap-northeast-1`

Only the browser-safe Supabase publishable key belongs in frontend code. Never commit a database password or service-role/secret key.

Enable **Anonymous Sign-Ins** in Supabase Auth for the registration flow.

## GitHub Pages

Publish the `docs/` directory from the `green` branch using GitHub Pages.

## Legacy backend

The existing FastAPI backend remains in the repository for reference. It is not used by the `green` branch frontend.

## Cloudflare Worker

The connected repository integrations did not expose the existing Cloudflare Worker source, so no Worker implementation is being invented or copied. The current application does not require a Worker for its Supabase-only flow.
