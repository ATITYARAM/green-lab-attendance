const form = document.getElementById("registrationForm");
const message = document.getElementById("message");

form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const studentId =
        document.getElementById("studentId")
            .value.trim();

    const name =
        document.getElementById("name")
            .value.trim();

    message.textContent = "Registering...";

    try {

        const response = await fetch(
            `${API_BASE_URL}/students/register`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    student_id: studentId,
                    name: name
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            message.textContent =
                data.detail ||
                "Registration failed.";

            return;
        }

        // Save browser session
        localStorage.setItem(
            "green_lab_session",
            data.session_token
        );

        message.textContent =
            "Registration successful.";

        setTimeout(() => {
            window.location.href =
                "attendance.html";
        }, 700);

    } catch (error) {

        console.error(error);

        message.textContent =
            "Could not connect to the server.";
    }
});

