const form = document.getElementById("registrationForm");
const registrationArea = document.getElementById("registrationArea");
const attendanceActionArea = document.getElementById("attendanceActionArea");
const attendanceActionButton = document.getElementById("attendanceActionButton");
const attendanceStatus = document.getElementById("attendanceStatus");
const pageSubtitle = document.getElementById("pageSubtitle");
const message = document.getElementById("message");

const DEVICE_STORAGE_KEY = "green_lab_device_id";
const EXIT_UI_UNTIL_KEY = "green_lab_exit_ui_until";
const EXIT_UI_DURATION = 7000;

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

function showRegistrationArea() {
    registrationArea.hidden = false;
    attendanceActionArea.hidden = true;
    pageSubtitle.textContent = "Student Registration";
    message.textContent = "";
}

function showAttendanceArea() {
    registrationArea.hidden = true;
    attendanceActionArea.hidden = false;
    pageSubtitle.textContent = "Attendance";
}

function setAttendanceButton(insideLab) {
    attendanceActionButton.textContent = insideLab ? "Exit" : "Entry";
    attendanceStatus.textContent = insideLab
        ? "Currently inside Green Lab"
        : "Currently outside Green Lab";
}

function hideAttendanceButton() {
    attendanceActionArea.hidden = true;
}

function showPostExitEntryButton() {
    showAttendanceArea();
    setAttendanceButton(false);

    const expiresAt = Date.now() + EXIT_UI_DURATION;
    localStorage.setItem(EXIT_UI_UNTIL_KEY, String(expiresAt));

    window.setTimeout(() => {
        const currentExpiry = Number(localStorage.getItem(EXIT_UI_UNTIL_KEY));

        if (currentExpiry && Date.now() >= currentExpiry) {
            localStorage.removeItem(EXIT_UI_UNTIL_KEY);
            hideAttendanceButton();
        }
    }, EXIT_UI_DURATION);
}

function shouldShowPostExitButton() {
    const expiresAt = Number(localStorage.getItem(EXIT_UI_UNTIL_KEY));

    if (!expiresAt) return false;

    if (Date.now() >= expiresAt) {
        localStorage.removeItem(EXIT_UI_UNTIL_KEY);
        return false;
    }

    return true;
}

async function loadAttendanceAction(showEntryWhenOutside = false) {
    const current = await workerRequest("/attendance/current");

    if (current.inside_lab) {
        localStorage.removeItem(EXIT_UI_UNTIL_KEY);
        showAttendanceArea();
        setAttendanceButton(true);
        return;
    }

    if (showEntryWhenOutside || shouldShowPostExitButton()) {
        showAttendanceArea();
        setAttendanceButton(false);
        return;
    }

    hideAttendanceButton();
}

async function handleAttendanceAction() {
    attendanceActionButton.disabled = true;
    message.textContent = "Recording...";

    try {
        const current = await workerRequest("/attendance/current");

        if (!current.inside_lab) {
            await workerRequest("/attendance/entry", {
                method: "POST"
            });

            localStorage.removeItem(EXIT_UI_UNTIL_KEY);
            showAttendanceArea();
            setAttendanceButton(true);
            message.textContent = "Entry recorded successfully.";
            return;
        }

        await workerRequest("/attendance/exit", {
            method: "POST"
        });

        message.textContent = "Exit recorded successfully.";
        showPostExitEntryButton();
    } catch (error) {
        console.error(error);
        message.textContent =
            error?.message || "Could not record attendance. Please try again.";
    } finally {
        attendanceActionButton.disabled = false;
    }
}

async function registerDevice(event) {
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

        message.textContent = "Device registered successfully.";

        await loadAttendanceAction(true);
    } catch (error) {
        showRegistrationError(error);
    }
}

async function init() {
    try {
        const deviceId = localStorage.getItem(DEVICE_STORAGE_KEY);

        if (!deviceId) {
            showRegistrationArea();
            return;
        }

        await getOrCreateSession();

        // The database is the source of truth.
        // A cached browser ID alone does not mean this device is registered.
        try {
            await workerRequest("/students/me");
        } catch (error) {
            const text = String(error?.message || error || "").toLowerCase();

            if (
                text.includes("student not found") ||
                text.includes("device is not registered") ||
                text.includes("404")
            ) {
                localStorage.removeItem(DEVICE_STORAGE_KEY);
                localStorage.removeItem(EXIT_UI_UNTIL_KEY);
                showRegistrationArea();
                return;
            }

            throw error;
        }

        await loadAttendanceAction();
    } catch (error) {
        console.error("Home page initialization:", error);
        showRegistrationArea();
    }
}

form.addEventListener("submit", registerDevice);
attendanceActionButton.addEventListener("click", handleAttendanceAction);

init();
