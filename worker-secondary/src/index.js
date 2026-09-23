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

  const result = await supabaseRpc(
    env,
    request,
    "lab_student_by_device",
    { p_device_token: deviceToken }
  );

  if (!result.response.ok || !result.data?.student_code) return null;

  return result.data;
}

function rpcError(result, fallback) {
  return (
    result.data?.message ||
    result.data?.details ||
    result.data?.hint ||
    result.data?.error ||
    fallback
  );
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      const url = new URL(request.url);

      if (url.pathname === "/") {
        return json({
          service: "Green Lab Attendance Worker - Secondary",
          status: "running",
          database: "secondary"
        });
      }

      if (url.pathname === "/health") {
        return json({
          service: "green-lab-secondary",
          status: "ok",
          database: "secondary"
        });
      }

      if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
        return json(
          { error: "Secondary Supabase runtime variables are not configured." },
          500
        );
      }

      if (url.pathname === "/students/register" && request.method === "POST") {
        const user = await authUser(env, request);

        if (!user) {
          return json({ error: "Authentication required." }, 401);
        }

        const body = await request.json();

        const studentCode = String(body.student_id || "").trim();
        const fullName = String(body.name || "").trim();
        const deviceToken = String(
          body.device_token ||
          request.headers.get("X-Device-Token") ||
          ""
        ).trim();

        if (!studentCode || !fullName || !deviceToken) {
          return json(
            {
              error:
                "student_id, name and device_token are required."
            },
            400
          );
        }

        if (deviceToken.length > 200) {
          return json(
            { error: "Invalid device token." },
            400
          );
        }

        const result = await supabaseRpc(
          env,
          request,
          "lab_register_device",
          {
            p_student_code: studentCode,
            p_full_name: fullName,
            p_device_token: deviceToken
          }
        );

        if (!result.response.ok) {
          return json(
            {
              error: rpcError(
                result,
                "Device registration failed."
              )
            },
            result.response.status
          );
        }

        return json(result.data, 201);
      }

      if (url.pathname === "/students/me" && request.method === "GET") {
        const current = await student(env, request);

        if (!current) {
          return json({ error: "Student not found." }, 404);
        }

        return json(current);
      }

      if (url.pathname === "/attendance/current" && request.method === "GET") {
        const deviceToken = request.headers.get("X-Device-Token");

        if (!deviceToken) {
          return json(
            { error: "Device is not registered." },
            404
          );
        }

        const result = await supabaseRpc(
          env,
          request,
          "lab_attendance_current",
          { p_device_token: deviceToken }
        );

        if (!result.response.ok) {
          return json(
            {
              error: rpcError(
                result,
                "Unable to check attendance."
              )
            },
            result.response.status
          );
        }

        return json(result.data);
      }

      if (url.pathname === "/attendance/history" && request.method === "GET") {
        const deviceToken = request.headers.get("X-Device-Token");

        if (!deviceToken) {
          return json(
            { error: "Device is not registered." },
            404
          );
        }

        const result = await supabaseRpc(
          env,
          request,
          "lab_attendance_history",
          { p_device_token: deviceToken }
        );

        if (!result.response.ok) {
          return json(
            {
              error: rpcError(
                result,
                "Unable to load history."
              )
            },
            result.response.status
          );
        }

        return json(result.data);
      }

      if (url.pathname === "/attendance/entry" && request.method === "POST") {
        const deviceToken = request.headers.get("X-Device-Token");

        if (!deviceToken) {
          return json(
            { error: "Device is not registered." },
            404
          );
        }

        const result = await supabaseRpc(
          env,
          request,
          "lab_attendance_entry",
          {
            p_device_token: deviceToken,
            p_entry_source: "web"
          }
        );

        if (!result.response.ok) {
          return json(
            {
              error: rpcError(
                result,
                "Unable to record entry."
              )
            },
            result.response.status
          );
        }

        return json(result.data, 201);
      }

      if (url.pathname === "/attendance/exit" && request.method === "POST") {
        const deviceToken = request.headers.get("X-Device-Token");

        if (!deviceToken) {
          return json(
            { error: "Device is not registered." },
            404
          );
        }

        const result = await supabaseRpc(
          env,
          request,
          "lab_attendance_exit",
          { p_device_token: deviceToken }
        );

        if (!result.response.ok) {
          return json(
            {
              error: rpcError(
                result,
                "Unable to record exit."
              )
            },
            result.response.status
          );
        }

        return json(result.data);
      }

      return json(
        {
          error: "Route not found",
          path: url.pathname
        },
        404
      );
    } catch (error) {
      console.error(error);

      return json(
        {
          error:
            error?.message ||
            "Unexpected secondary Worker error."
        },
        500
      );
    }
  }
};
