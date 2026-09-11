from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.app.database import create_tables, get_connection

app = FastAPI(title="Green Lab Attendance System")
app.mount("/frontend", StaticFiles(directory="frontend", html=True), name="frontend")

class StudentRegistration(BaseModel):
    student_id: str
    name: str


@app.on_event("startup")
def startup():
    create_tables()


@app.get("/")
def home():
    return {
        "message": "Green Lab Attendance System is running!"
    }


@app.post("/students/register")
def register_student(student: StudentRegistration):
    connection = get_connection()

    try:
        connection.execute(
            """
            INSERT INTO students (student_id, name)
            VALUES (?, ?)
            """,
            (student.student_id, student.name)
        )

        connection.commit()

        return {
            "message": "Student registered successfully",
            "student_id": student.student_id,
            "name": student.name
        }

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Student ID already exists"
        )

    finally:
        connection.close()
