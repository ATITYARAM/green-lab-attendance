const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

async function supabase(env, request, path, options = {}) {
  const headers = {
    apikey: env.SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json"
  };

  const authorization = request.headers.get("Authorization");
  if (authorization) headers.Authorization = authorization;

  const response = await fetch(env.SUPABASE_URL + path, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });

  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || "Supabase returned an invalid response." };
  }

  return { response, data };
}

async function authUser(env, request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;

  const result = await supabase(env, request, "/auth/v1/user", {
    method: "GET",
    headers: { Authorization: authorization }
  });

  return result.response.ok && result.data?.id ? result.data : null;
}

async function student(env, request) {
  const user = await authUser(env, request);
  if (!user) return null;

  const path =
    "/rest/v1/students?select=student_id,name" +
    "&auth_user_id=eq." + encodeURIComponent(user.id) +
    "&limit=1";

  const result = await supabase(env, request, path);

  if (!result.response.ok || !Array.isArray(result.data) || !result.data.length) {
    return null;
  }

  return result.data[0];
}

async function activeSession(env, request, studentId) {
  const path =
    "/rest/v1/attendance_sessions?select=id,entry_time" +
    "&student_id=eq." + encodeURIComponent(studentId) +
    "&exit_time=is.null&order=id.desc&limit=1";

  const result = await supabase(env, request, path);

  if (!result.response.ok || !Array.isArray(result.data) || !result.data.length) {
    return null;
  }

  return result.data[0];
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      const url = new URL(request.url);

      if (url.pathname === "/") {
        return json({ service: "Green Lab Attendance Worker", status: "running" });
      }

      if (url.pathname === "/health") {
        return json({ service: "green-lab", status: "ok" });
      }

      if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
        return json({ error: "Supabase runtime variables are not configured." }, 500);
      }

      if (url.pathname === "/students/register" && request.method === "POST") {
        const user = await authUser(env, request);
        if (!user) return json({ error: "Authentication required." }, 401);

        const body = await request.json();
        const studentId = String(body.student_id || "").trim();
        const name = String(body.name || "").trim();

        if (!studentId || !name) {
          return json({ error: "student_id and name are required." }, 400);
        }

        if (studentId.length > 50 || name.length > 100) {
          return json({ error: "Student ID or name is too long." }, 400);
        }

        // Same authenticated browser can safely retry registration.
        const existing = await student(env, request);

        if (existing) {
          if (existing.student_id !== studentId) {
            return json({
              error: "This browser is already registered with Student ID " + existing.student_id + "."
            }, 409);
          }
          return json(existing);
        }

        const result = await supabase(env, request, "/rest/v1/students", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            student_id: studentId,
            name,
            auth_user_id: user.id
          })
        });

        if (!result.response.ok) {
          const code = String(result.data?.code || "");

          if (result.response.status === 409 || code === "23505") {
            return json({ error: "This Student ID is already registered." }, 409);
          }

          return json({
            error:
              result.data?.message ||
              result.data?.hint ||
              result.data?.details ||
              result.data?.error ||
              "Student registration failed."
          }, result.response.status);
        }

        return json(result.data, 201);
      }

      if (url.pathname === "/students/me" && request.method === "GET") {
        const current = await student(env, request);
        if (!current) return json({ error: "Student not found." }, 404);
        return json(current);
      }

      if (url.pathname === "/attendance/current" && request.method === "GET") {
        const current = await student(env, request);
        if (!current) return json({ error: "Student not found." }, 404);

        const session = await activeSession(env, request, current.student_id);

        return json({
          inside_lab: Boolean(session),
          session
        });
      }

      if (url.pathname === "/attendance/history" && request.method === "GET") {
        const current = await student(env, request);
        if (!current) return json({ error: "Student not found." }, 404);

        const path =
          "/rest/v1/attendance_sessions?select=id,entry_time,exit_time,duration_minutes" +
          "&student_id=eq." + encodeURIComponent(current.student_id) +
          "&order=id.desc&limit=10";

        const result = await supabase(env, request, path);

        if (!result.response.ok) {
          return json({ error: result.data?.message || "Unable to load history." }, result.response.status);
        }

        return json(result.data);
      }

      if (url.pathname === "/attendance/entry" && request.method === "POST") {
        const current = await student(env, request);
        if (!current) return json({ error: "Student not found." }, 404);

        const active = await activeSession(env, request, current.student_id);
        if (active) return json({ error: "Student is already inside the lab." }, 409);

        const result = await supabase(env, request, "/rest/v1/attendance_sessions", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            student_id: current.student_id,
            entry_time: new Date().toISOString()
          })
        });

        if (!result.response.ok) {
          return json({ error: result.data?.message || "Unable to record entry." }, result.response.status);
        }

        return json(result.data, 201);
      }

      if (url.pathname === "/attendance/exit" && request.method === "POST") {
        const current = await student(env, request);
        if (!current) return json({ error: "Student not found." }, 404);

        const active = await activeSession(env, request, current.student_id);
        if (!active) return json({ error: "No active attendance session found." }, 409);

        const exitTime = new Date();
        const entryTime = new Date(active.entry_time);

        const durationMinutes = Math.max(
          0,
          Math.floor((exitTime.getTime() - entryTime.getTime()) / 60000)
        );

        const path =
          "/rest/v1/attendance_sessions?id=eq." +
          encodeURIComponent(active.id);

        const result = await supabase(env, request, path, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            exit_time: exitTime.toISOString(),
            duration_minutes: durationMinutes
          })
        });

        if (!result.response.ok) {
          return json({ error: result.data?.message || "Unable to record exit." }, result.response.status);
        }

        return json(result.data);
      }

      return json({ error: "Route not found", path: url.pathname }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: error?.message || "Unexpected Worker error." }, 500);
    }
  }
};