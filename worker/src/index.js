const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-device-token",
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

async function supabaseRpc(env, request, functionName, body) {
  return await supabase(env, request, "/rest/v1/rpc/" + functionName, {
    method: "POST",
    body: JSON.stringify(body)
  });
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
  const deviceToken = request.headers.get("X-Device-Token");
  if (!deviceToken) return null;
  const result = await supabaseRpc(env, request, "student_by_device", { p_device_token: deviceToken });
  if (!result.response.ok || !result.data?.student_id) return null;
  return result.data;
}

async function studentByAuth(env, request) {
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
        const deviceToken = String(body.device_token || request.headers.get("X-Device-Token") || "").trim();
        if (!studentId || !name || !deviceToken) return json({ error: "student_id, name and device_token are required." }, 400);
        if (deviceToken.length > 200) return json({ error: "Invalid device token." }, 400);
        const result = await supabaseRpc(env, request, "register_student_device", {
          p_student_id: studentId, p_name: name, p_device_token: deviceToken
        });
        if (!result.response.ok) {
          return json({ error: result.data?.message || result.data?.details || result.data?.hint || result.data?.error || "Device registration failed." }, result.response.status);
        }
        return json(result.data, 201);
      }

      if (url.pathname === "/students/me" && request.method === "GET") {
        const current = await student(env, request);
        if (!current) return json({ error: "Student not found." }, 404);
        return json(current);
      }

      if (url.pathname === "/attendance/current" && request.method === "GET") {
        const deviceToken = request.headers.get("X-Device-Token");
        if (!deviceToken) return json({ error: "Device is not registered." }, 404);
        const result = await supabaseRpc(env, request, "attendance_current_by_device_v2", { p_device_token: deviceToken });
        if (!result.response.ok) return json({ error: result.data?.message || "Unable to check attendance." }, result.response.status);
        return json(result.data);
      }

      if (url.pathname === "/attendance/history" && request.method === "GET") {
        const deviceToken = request.headers.get("X-Device-Token");
        if (!deviceToken) return json({ error: "Device is not registered." }, 404);
        const result = await supabaseRpc(env, request, "attendance_history_by_device_v2", {
          p_device_token: deviceToken
        });
        if (!result.response.ok) {
          return json({ error: result.data?.message || "Unable to load history." }, result.response.status);
        }
        return json(result.data);
      }

      if (url.pathname === "/attendance/entry" && request.method === "POST") {
        const deviceToken = request.headers.get("X-Device-Token");
        if (!deviceToken) return json({ error: "Device is not registered." }, 404);
        const result = await supabaseRpc(env, request, "attendance_entry_by_device_v2", { p_device_token: deviceToken });
        if (!result.response.ok) return json({ error: result.data?.message || "Unable to record entry." }, result.response.status);
        return json(result.data, 201);
      }

      if (url.pathname === "/attendance/exit" && request.method === "POST") {
        const deviceToken = request.headers.get("X-Device-Token");
        if (!deviceToken) return json({ error: "Device is not registered." }, 404);
        const result = await supabaseRpc(env, request, "attendance_exit_by_device_v2", { p_device_token: deviceToken });
        if (!result.response.ok) return json({ error: result.data?.message || "Unable to record exit." }, result.response.status);
        return json(result.data);
      }

      return json({ error: "Route not found", path: url.pathname }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: error?.message || "Unexpected Worker error." }, 500);
    }
  }
};