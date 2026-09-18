const form = document.getElementById("registrationForm");
const message = document.getElementById("message");

async function getOrCreateSession() {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    if (data.session) return data.session;

    const { data: authData, error: authError } =
        await db.auth.signInAnonymously();

    if (authError) throw authError;
    return authData.session;
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const studentId = document.getElementById("studentId").value.trim();
    const name = document.getElementById("name").value.trim();

    message.textContent = "Registering...";

    try {
        await getOrCreateSession();

        await workerRequest("/students/register", {
            method: "POST",
            body: JSON.stringify({
                student_id: studentId,
                name
            })
        });

        message.textContent = "Registration successful.";

        setTimeout(() => {
            window.location.href = "attendance.html";
        }, 700);
    } catch (error) {
        console.error(error);

        if (error.message && error.message.includes("23505")) {
            message.textContent = "Student ID already exists.";
        } else {
            message.textContent =
                "Registration failed. Make sure Anonymous Sign-Ins are enabled in Supabase.";
        }
    }
});