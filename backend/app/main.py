from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.app.database import create_tables, get_connection

app = FastAPI(title="Green Lab Attendance System")
app.mount("/frontend", StaticFiles(directory="frontend", html=True), name="frontend")

class StudentRegistration(BaseModel):
    student_id: str
    name: str

class AttendanceEntry(BaseModel):
    student_id: str

class AttendanceExit(BaseModel):
    student_id: str

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

@app.post("/attendance/entry")
def record_entry(attendance: AttendanceEntry):
    connection = get_connection()

    try:
        # Check whether the student exists
        student = connection.execute(
            """
            SELECT student_id, name
            FROM students
            WHERE student_id = ?
            """,
            (attendance.student_id,)
        ).fetchone()

        if student is None:
            raise HTTPException(
                status_code=404,
                detail="Student not registered"
            )

        # Check whether the student already has an active session
        active_session = connection.execute(
            """
            SELECT id
            FROM attendance_sessions
            WHERE student_id = ?
              AND exit_time IS NULL
            """,
            (attendance.student_id,)
        ).fetchone()

        if active_session is not None:
            raise HTTPException(
                status_code=400,
                detail="Student already has an active session"
            )

        # Create a new attendance session
        connection.execute(
            """
            INSERT INTO attendance_sessions
                (student_id, entry_time)
            VALUES
                (?, datetime('now', 'localtime'))
            """,
            (attendance.student_id,)
        )

        connection.commit()

        return {
            "message": "Entry recorded successfully",
            "student_id": student["student_id"],
            "name": student["name"]
        }

    finally:
        connection.close()

@app.post("/attendance/exit")
def record_exit(attendance: AttendanceExit):
    connection = get_connection()

    try:
        # Find the student's active session
        session = connection.execute(
            """
            SELECT id, entry_time
            FROM attendance_sessions
            WHERE student_id = ?
              AND exit_time IS NULL
            ORDER BY id DESC
            LIMIT 1
            """,
            (attendance.student_id,)
        ).fetchone()

        if session is None:
            raise HTTPException(
                status_code=400,
                detail="No active attendance session found"
            )

        # Calculate exit time and duration
        connection.execute(
            """
            UPDATE attendance_sessions
            SET
                exit_time = datetime('now', 'localtime'),
                duration_minutes = CAST(
                    (julianday(datetime('now', 'localtime')) - julianday(entry_time))
                    * 24 * 60
                    AS INTEGER
                )
            WHERE id = ?
            """,
            (session["id"],)
        )

        connection.commit()

        return {
            "message": "Exit recorded successfully",
            "student_id": attendance.student_id
        }

    finally:
        connection.close()

@app.get("/attendance/student/{student_id}")
def get_student_attendance(student_id: str):
    connection = get_connection()

    try:
        # Check whether the student exists
        student = connection.execute(
            """
            SELECT student_id, name
            FROM students
            WHERE student_id = ?
            """,
            (student_id,)
        ).fetchone()

        if student is None:
            raise HTTPException(
                status_code=404,
                detail="Student not registered"
            )

        # Get attendance history
        sessions = connection.execute(
            """
            SELECT
                student_id,
                entry_time,
                exit_time,
                duration_minutes
            FROM attendance_sessions
            WHERE student_id = ?
            ORDER BY id DESC
            """,
            (student_id,)
        ).fetchall()

        return [
            {
                "student_id": session["student_id"],
                "name": student["name"],
                "entry_time": session["entry_time"],
                "exit_time": session["exit_time"],
                "duration_minutes": session["duration_minutes"]
            }
            for session in sessions
        ]

    finally:
        connection.close()
