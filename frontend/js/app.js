const form = document.getElementById("registrationForm");
const message = document.getElementById("message");

form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const studentId = document.getElementById("studentId").value;
    const name = document.getElementById("name").value;

    try {
        const response = await fetch("http://127.0.0.1:8000/students/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                student_id: studentId,
                name: name
            })
        });

        const data = await response.json();

        if (response.ok) {
            message.textContent = "Registration successful!";
            form.reset();
        } else {
            message.textContent = data.detail || "Registration failed.";
        }

    } catch (error) {
        message.textContent = "Could not connect to the server.";
        console.error(error);
    }
});

