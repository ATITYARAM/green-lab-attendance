const studentInfo = document.getElementById("studentInfo");
const statusElement = document.getElementById("status");
const timerElement = document.getElementById("timer");
const toggleButton = document.getElementById("toggleButton");
const messageElement = document.getElementById("message");
const historyElement = document.getElementById("history");

let currentEntryTime = null;
let timerInterval = null;

async function getCurrentStudent() {
    const { data, error } = await db.auth.getSession();

    if (error || !data.session) {
        throw new Error("Browser is not registered");
    }

    return await workerRequest("/students/me");
}

async function loadStudent() {
    const student = await getCurrentStudent();

    studentInfo.innerHTML =
        "<strong>" + student.name + "</strong><br>" +
        "Student ID: " + student.student_id;

    return student;
}

async function loadCurrentAttendance() {
    const data = await workerRequest("/attendance/current");

    updateAttendanceUI({
        inside_lab: data.inside_lab,
        entry_time: data.session?.entry_time || null
    });
}

function updateAttendanceUI(data) {
    if (data.inside_lab) {
        currentEntryTime = new Date(data.entry_time);

        statusElement.textContent = "Currently inside Green Lab";
        toggleButton.textContent = "Mark Exit";
        startTimer();
    } else {
        currentEntryTime = null;
        statusElement.textContent = "Currently outside Green Lab";
        toggleButton.textContent = "Mark Entry";
        stopTimer();
        timerElement.textContent = "00:00:00";
    }
}

function startTimer() {
    stopTimer();

    function updateTimer() {
        if (!currentEntryTime) return;

        const difference = Math.max(
            0,
            Math.floor((Date.now() - currentEntryTime.getTime()) / 1000)
        );

        const hours = Math.floor(difference / 3600);
        const minutes = Math.floor((difference % 3600) / 60);
        const seconds = difference % 60;

        timerElement.textContent =
            String(hours).padStart(2, "0") + ":" +
            String(minutes).padStart(2, "0") + ":" +
            String(seconds).padStart(2, "0");
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

async function toggleAttendance() {
    toggleButton.disabled = true;
    messageElement.textContent = "Recording...";

    try {
        const current = await workerRequest("/attendance/current");

        if (!current.inside_lab) {
            const result = await workerRequest("/attendance/entry", {
                method: "POST"
            });

            messageElement.textContent = "Entry recorded successfully.";

            const session = Array.isArray(result) ? result[0] : result;
            updateAttendanceUI({
                inside_lab: true,
                entry_time: session?.entry_time || new Date().toISOString()
            });
        } else {
            const result = await workerRequest("/attendance/exit", {
                method: "POST"
            });

            const session = Array.isArray(result) ? result[0] : result;

            messageElement.textContent =
                "Exit recorded. Time spent: " +
                (session?.duration_minutes ?? 0) +
                " minutes.";

            updateAttendanceUI({
                inside_lab: false,
                entry_time: null
            });
        }

        await loadHistory();
    } catch (error) {
        console.error(error);
        messageElement.textContent =
            "Could not record attendance. Please try again.";
    } finally {
        toggleButton.disabled = false;
    }
}

async function loadHistory() {
    try {
        const data = await workerRequest("/attendance/history");

        if (!data || data.length === 0) {
            historyElement.textContent = "No attendance records yet.";
            return;
        }

        historyElement.innerHTML = data.map((session) => {
            const duration =
                session.duration_minutes === null ||
                session.duration_minutes === undefined
                    ? "Active"
                    : session.duration_minutes + " min";

            return (
                '<div class="history-item">' +
                "<div><strong>Entry:</strong> " + session.entry_time + "</div>" +
                "<div><strong>Exit:</strong> " +
                (session.exit_time || "Inside Lab") +
                "</div>" +
                "<div><strong>Duration:</strong> " + duration + "</div>" +
                "</div>"
            );
        }).join("");
    } catch (error) {
        console.error(error);
        historyElement.textContent =
            "Unable to load attendance history.";
    }
}

async function handleQRScan() {
    const params = new URLSearchParams(window.location.search);

    if (params.get("action") !== "scan") return;

    window.history.replaceState(
        {},
        document.title,
        window.location.pathname
    );

    await toggleAttendance();
}

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
            '<a href="index.html">Student Registration</a>';
    }
}

toggleButton.addEventListener("click", toggleAttendance);
start();