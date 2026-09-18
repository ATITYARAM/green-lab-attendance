const studentInfo = document.getElementById("studentInfo");
const statusElement = document.getElementById("status");
const timerElement = document.getElementById("timer");
const toggleButton = document.getElementById("toggleButton");
const messageElement = document.getElementById("message");
const historyElement = document.getElementById("history");

let currentEntryTime = null;
let timerInterval = null;

async function getCurrentStudent() {
    const { data: sessionData, error: sessionError } =
        await db.auth.getSession();

    if (sessionError || !sessionData.session) {
        throw new Error("Browser is not registered");
    }

    const { data, error } = await db
        .from("students")
        .select("student_id, name")
        .eq("auth_user_id", sessionData.session.user.id)
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function loadStudent() {
    const student = await getCurrentStudent();

    studentInfo.innerHTML = `
        <strong>${student.name}</strong>
        <br>
        Student ID: ${student.student_id}
    `;

    return student;
}

async function loadCurrentAttendance() {
    const student = await getCurrentStudent();

    const { data, error } = await db
        .from("attendance_sessions")
        .select("id, entry_time, exit_time, duration_minutes")
        .eq("student_id", student.student_id)
        .is("exit_time", null)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw error;
    }

    updateAttendanceUI({
        inside_lab: Boolean(data),
        entry_time: data?.entry_time ?? null
    });
}

function updateAttendanceUI(data) {
    if (data.inside_lab) {
        currentEntryTime = new Date(
            data.entry_time.replace(" ", "T")
        );

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
            Math.floor(
                (Date.now() - currentEntryTime.getTime()) / 1000
            )
        );

        const hours = Math.floor(difference / 3600);
        const minutes = Math.floor((difference % 3600) / 60);
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

async function toggleAttendance() {
    toggleButton.disabled = true;
    messageElement.textContent = "Recording...";

    try {
        const student = await getCurrentStudent();

        const { data: active, error: activeError } = await db
            .from("attendance_sessions")
            .select("id, entry_time")
            .eq("student_id", student.student_id)
            .is("exit_time", null)
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (activeError) {
            throw activeError;
        }

        if (!active) {
            const { error } = await db
                .from("attendance_sessions")
                .insert({
                    student_id: student.student_id,
                    entry_time: new Date().toISOString()
                });

            if (error) {
                throw error;
            }

            messageElement.textContent = "Entry recorded successfully.";
        } else {
            const exitDate = new Date();
            const entryDate = new Date(
                active.entry_time.replace(" ", "T")
            );

            const durationMinutes = Math.max(
                0,
                Math.floor((exitDate - entryDate) / 60000)
            );

            const { error } = await db
                .from("attendance_sessions")
                .update({
                    exit_time: exitDate.toISOString(),
                    duration_minutes: durationMinutes
                })
                .eq("id", active.id);

            if (error) {
                throw error;
            }

            messageElement.textContent =
                `Exit recorded. Time spent: ${durationMinutes} minutes.`;
        }

        await loadCurrentAttendance();
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
        const student = await getCurrentStudent();

        const { data, error } = await db
            .from("attendance_sessions")
            .select("entry_time, exit_time, duration_minutes")
            .eq("student_id", student.student_id)
            .order("id", { ascending: false })
            .limit(10);

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {
            historyElement.textContent = "No attendance records yet.";
            return;
        }

        historyElement.innerHTML = data.map(session => `
            <div class="history-item">
                <div><strong>Entry:</strong> ${session.entry_time}</div>
                <div><strong>Exit:</strong> ${session.exit_time || "Inside Lab"}</div>
                <div><strong>Duration:</strong> ${session.duration_minutes ?? "Active"}${session.duration_minutes !== null ? " min" : ""}</div>
            </div>
        `).join("");
    } catch (error) {
        console.error(error);
        historyElement.textContent = "Unable to load attendance history.";
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
            `Open <a href="index.html">Student Registration</a>`;
    }
}

toggleButton.addEventListener("click", toggleAttendance);
start();
