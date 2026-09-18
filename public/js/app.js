const form = document.getElementById("registrationForm");
const message = document.getElementById("message");
const DEVICE_STORAGE_KEY = "green_lab_device_id";

function getOrCreateDeviceId() {
    let deviceId = localStorage.getItem(DEVICE_STORAGE_KEY);

    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
    }

    return deviceId;
}

async function getOrCreateSession() {
    const { data, error } = await db.auth.getSession();

    if (error) {
        throw new Error("Supabase session error: " + error.message);
    }

    if (data.session) return data.session;

    const { data: authData, error: authError } =
        await db.auth.signInAnonymously();

    if (authError) {
        throw new Error(authError.message || "Anonymous sign-in failed.");
    }

    if (!authData.session) {
        throw new Error("Supabase did not return an authentication session.");
    }

    return authData.session;
}

function showRegistrationError(error) {
    const text = String(error?.message || error || "");
    console.error("Registration error:", error);

    if (
        text.includes("anonymous_provider_disabled") ||
        text.toLowerCase().includes("anonymous sign-ins are disabled")
    ) {
        message.textContent = "Anonymous Sign-Ins are disabled in Supabase.";
        return;
    }

    if (
        text.includes("23505") ||
        text.toLowerCase().includes("already registered") ||
        text.toLowerCase().includes("duplicate")
    ) {
        message.textContent = "This Student ID is already registered.";
        return;
    }

    message.textContent = "Registration failed: " + text;
}

async function openAttendanceIfRegistered() {
    try {
        const deviceId = localStorage.getItem(DEVICE_STORAGE_KEY);
        if (!deviceId) return false;

        await getOrCreateSession();
        await workerRequest("/students/me");

        window.location.href = "attendance.html";
        return true;
    } catch {
        return false;
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const studentId = document.getElementById("studentId").value.trim();
    const name = document.getElementById("name").value.trim();

    if (!studentId || !name) {
        message.textContent = "Student ID and Name are required.";
        return;
    }

    message.textContent = "Connecting...";

    try {
        const deviceId = getOrCreateDeviceId();
        await getOrCreateSession();

        message.textContent = "Registering this device...";

        await workerRequest("/students/register", {
            method: "POST",
            body: JSON.stringify({
                student_id: studentId,
                name,
                device_token: deviceId
            })
        });

        message.textContent = "Device registered. Opening attendance...";

        setTimeout(() => {
            window.location.href = "attendance.html";
        }, 500);
    } catch (error) {
        showRegistrationError(error);
    }
});

(async function init() {
    const action = new URLSearchParams(window.location.search).get("action");

    if (await openAttendanceIfRegistered()) {
        if (action === "entry" || action === "exit") {
            window.location.href = "attendance.html?action=" + action;
        }
    }
})();
