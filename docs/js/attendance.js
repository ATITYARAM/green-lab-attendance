function getAuthHeaders() {
    const token = localStorage.getItem("green_lab_session");

    if (!token) {
        return {};
    }

    return {
        "Authorization": `Bearer ${token}`
    };
}

const studentInfo = document.getElementById("studentInfo");
const statusElement = document.getElementById("status");
const timerElement = document.getElementById("timer");
const toggleButton = document.getElementById("toggleButton");
const messageElement = document.getElementById("message");
const historyElement = document.getElementById("history");

let currentEntryTime = null;
let timerInterval = null;


// --------------------------------------------------
// Get current student
// --------------------------------------------------

async function loadStudent() {
    const response = await fetch(
    `${API_BASE_URL}/auth/me`,
    {
        headers: getAuthHeaders()
    }
);
    if (!response.ok) {
        throw new Error("Browser is not registered");
    }

    const student = await response.json();

    studentInfo.innerHTML = `
        <strong>${student.name}</strong>
        <br>
        Student ID: ${student.student_id}
    `;
}


// --------------------------------------------------
// Load current attendance state
// --------------------------------------------------

async function loadCurrentAttendance() {
    const response = await fetch(
    `${API_BASE_URL}/attendance/current`,
    {
        headers: getAuthHeaders()
    }
);
    if (!response.ok) {
        throw new Error("Could not load attendance");
    }

    const data = await response.json();

    updateAttendanceUI(data);
}


// --------------------------------------------------
// Update UI
// --------------------------------------------------

function updateAttendanceUI(data) {

    if (data.inside_lab) {

        currentEntryTime = new Date(
            data.entry_time.replace(" ", "T")
        );

        statusElement.textContent = "Currently inside Green Lab";
        toggleButton.textContent = "Scan to Exit";

        startTimer();

    } else {

        currentEntryTime = null;

        statusElement.textContent = "Currently outside Green Lab";
        toggleButton.textContent = "Scan to Enter";

        stopTimer();
        timerElement.textContent = "00:00:00";
    }
}


// --------------------------------------------------
// Timer
// --------------------------------------------------

function startTimer() {

    stopTimer();

    function updateTimer() {

        if (!currentEntryTime) {
            return;
        }

        const now = new Date();

        const difference = Math.max(
            0,
            Math.floor(
                (now - currentEntryTime) / 1000
            )
        );

        const hours = Math.floor(difference / 3600);
        const minutes = Math.floor(
            (difference % 3600) / 60
        );
        const seconds = difference % 60;

        timerElement.textContent =
            `${String(hours).padStart(2, "0")}:` +
            `${String(minutes).padStart(2, "0")}:` +
            `${String(seconds).padStart(2, "0")}`;
    }

    updateTimer();

    timerInterval = setInterval(updateTimer, 1000);
}


function stopTimer() {

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}


// --------------------------------------------------
// Toggle attendance
// --------------------------------------------------

async function toggleAttendance() {

    toggleButton.disabled = true;
    messageElement.textContent = "Recording...";

    try {
        const response = await fetch(
    `${API_BASE_URL}/attendance/toggle`,
    {
        method: "POST",
        headers: getAuthHeaders()
    }
);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.detail || "Attendance failed"
            );
        }

        if (data.action === "entry") {

            messageElement.textContent =
                `Entry recorded at ${data.entry_time}`;

        } else {

            messageElement.textContent =
                `Exit recorded. Time spent: ` +
                `${data.duration_minutes} minutes`;

        }

        await loadCurrentAttendance();
        await loadHistory();

    } catch (error) {

        console.error(error);

        messageElement.textContent =
            error.message;

    } finally {

        toggleButton.disabled = false;
    }
}


// --------------------------------------------------
// Attendance history
// --------------------------------------------------

async function loadHistory() {

    const response = await fetch(
    `${API_BASE_URL}/attendance/me`,
    {
        headers: getAuthHeaders()
    }
);
    if (!response.ok) {
        historyElement.textContent =
            "Unable to load attendance history.";
        return;
    }

    const history = await response.json();

    if (history.length === 0) {
        historyElement.textContent =
            "No attendance records yet.";
        return;
    }

    historyElement.innerHTML = history
        .slice(0, 10)
        .map(session => {

            const duration =
                session.duration_minutes !== null
                    ? `${session.duration_minutes} min`
                    : "Active";

            return `
                <div class="history-item">
                    <div>
                        <strong>Entry:</strong>
                        ${session.entry_time}
                    </div>

                    <div>
                        <strong>Exit:</strong>
                        ${session.exit_time || "Inside Lab"}
                    </div>

                    <div>
                        <strong>Duration:</strong>
                        ${duration}
                    </div>
                </div>
            `;
        })
        .join("");
}


// --------------------------------------------------
// QR scan detection
// --------------------------------------------------

async function handleQRScan() {

    const params =
        new URLSearchParams(window.location.search);

    const action = params.get("action");

    if (action !== "scan") {
        return;
    }

    // Remove the query parameter immediately.
    // This prevents a browser refresh from
    // performing another attendance toggle.
    window.history.replaceState(
        {},
        document.title,
        window.location.pathname
    );

    await toggleAttendance();
}


// --------------------------------------------------
// Start application
// --------------------------------------------------

async function start() {

    try {

        await loadStudent();
        await loadCurrentAttendance();
        await loadHistory();

        await handleQRScan();

    } catch (error) {

        console.error(error);

        studentInfo.textContent =
            "This browser is not registered.";

        statusElement.textContent =
            "Please register this browser first.";

        toggleButton.disabled = true;

        messageElement.innerHTML =
            `Open <a href="/frontend/">Student Registration</a>`;
    }
}


toggleButton.addEventListener(
    "click",
    toggleAttendance
);

start();

