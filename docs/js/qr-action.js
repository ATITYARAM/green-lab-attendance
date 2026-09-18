const DEVICE_STORAGE_KEY = "green_lab_device_id";

async function getOrCreateSessionForQR() {
    const { data, error } = await db.auth.getSession();

    if (error) {
        throw new Error("Authentication session error: " + error.message);
    }

    if (data.session) return data.session;

    const { data: authData, error: authError } =
        await db.auth.signInAnonymously();

    if (authError || !authData.session) {
        throw new Error("This device is not registered.");
    }

    return authData.session;
}

async function runAttendanceAction(action) {
    const status = document.getElementById("actionStatus");
    const message = document.getElementById("actionMessage");

    const deviceId = localStorage.getItem(DEVICE_STORAGE_KEY);

    if (!deviceId) {
        window.location.replace("index.html");
        return;
    }

    try {
        await getOrCreateSessionForQR();

        status.textContent =
            action === "entry" ? "Marking Entry..." : "Marking Exit...";

        const current = await workerRequest("/attendance/current");

        if (action === "entry") {
            if (current.inside_lab) {
                status.textContent = "Already inside Green Lab";
                message.textContent = "Your entry is already recorded.";
            } else {
                await workerRequest("/attendance/entry", { method: "POST" });
                status.textContent = "Entry Recorded";
                message.textContent = "Your Green Lab entry has been recorded.";
            }
        } else {
            if (!current.inside_lab) {
                status.textContent = "No Active Entry";
                message.textContent = "There is no active entry to close.";
            } else {
                const result = await workerRequest("/attendance/exit", {
                    method: "POST"
                });

                const session = Array.isArray(result) ? result[0] : result;
                status.textContent = "Exit Recorded";
                message.textContent =
                    "Your exit has been recorded. Time spent: " +
                    (session?.duration_minutes ?? 0) +
                    " minutes.";
            }
        }

        setTimeout(() => {
            window.location.replace("attendance.html");
        }, 1200);
    } catch (error) {
        console.error(error);
        status.textContent = "Device Not Registered";
        message.textContent =
            "This device is not registered. Redirecting to registration...";

        setTimeout(() => {
            window.location.replace("index.html");
        }, 1200);
    }
}