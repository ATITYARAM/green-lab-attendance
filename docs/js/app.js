const form = document.getElementById("registrationForm");
const message = document.getElementById("message");

async function getOrCreateSession() {
    const { data, error } = await db.auth.getSession();

    if (error) {
        throw error;
    }

    if (data.session) {
        return data.session;
    }

    const { data: authData, error: authError } =
        await db.auth.signInAnonymously();

    if (authError) {
        throw authError;
    }

    return authData.session;
}

form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const studentId =
        document.getElementById("studentId").value.trim();

    const name =
        document.getElementById("name").value.trim();

    message.textContent = "Registering...";

    try {
        const session = await getOrCreateSession();

        const { error } = await db
            .from("students")
            .insert({
                student_id: studentId,
                name: name,
                auth_user_id: session.user.id
            });

        if (error) {
            if (error.code === "23505") {
                message.textContent = "Student ID already exists.";
                return;
            }
            throw error;
        }

        message.textContent = "Registration successful.";

        setTimeout(() => {
            window.location.href = "attendance.html";
        }, 700);
    } catch (error) {
        console.error(error);
        message.textContent =
            "Registration failed. Make sure Anonymous Sign-Ins are enabled in Supabase.";
    }
});
