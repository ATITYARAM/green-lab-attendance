const WORKER_URL = "https://green-lab.atityaramsureshmanickam.workers.dev";

async function workerRequest(path, options = {}) {
    const sessionResult = await db.auth.getSession();

    if (sessionResult.error) {
        throw new Error("Supabase session error: " + sessionResult.error.message);
    }

    const token = sessionResult.data.session?.access_token;

    if (!token) {
        throw new Error("No Supabase authentication session found.");
    }

    const deviceId = localStorage.getItem("green_lab_device_id");

    if (!deviceId) {
        throw new Error("This browser is not registered.");
    }

    const response = await fetch(WORKER_URL + path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
            "X-Device-Token": deviceId,
            ...(options.headers || {})
        }
    });

    const text = await response.text();

    let data;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = { error: text || "Worker returned an invalid response." };
    }

    if (!response.ok) {
        throw new Error(
            data?.error ||
            data?.message ||
            "Worker request failed with HTTP " + response.status
        );
    }

    return data;
}
