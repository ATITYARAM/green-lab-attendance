const form = document.getElementById("registrationForm");
const message = document.getElementById("message");

async function getOrCreateSession() {
    const { data, error } = await db.auth.getSession();

    if (error) {
        throw new Error("Supabase session error: " + error.message);
    }

    if (data.session) {
        return data.session;
    }

    const { data: authData, error: authError } =
        await db.auth.signInAnonymously();

    if (authError) {
        throw new Error(
            authError.message ||
            "Anonymous sign-in failed. Enable Anonymous Sign-Ins in Supabase."
        );
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
        text.toLowerCase().includes("anonymous sign-ins are disabled") ||
        text.toLowerCase().includes("anonymous provider is disabled")
    ) {
        message.textContent =
            "Supabase Anonymous Sign-Ins are disabled. Enable Authentication > Sign In / Providers > Anonymous in the Green Lab project, then reload this page.";
        return;
    }

    if (
        text.includes("23505") ||
        text.toLowerCase().includes("already registered") ||
        text.toLowerCase().includes("duplicate")
    ) {
        message.textContent =
            "This Student ID is already registered on another browser.";
        return;
    }

    message.textContent = "Registration failed: " + text;
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
        await getOrCreateSession();

        message.textContent = "Registering...";

        await workerRequest("/students/register", {
            method: "POST",
            body: JSON.stringify({
                student_id: studentId,
                name
            })
        });

        message.textContent = "Registration successful. Opening attendance...";

        setTimeout(() => {
            window.location.href = "attendance.html";
        }, 500);
    } catch (error) {
        showRegistrationError(error);
    }
});