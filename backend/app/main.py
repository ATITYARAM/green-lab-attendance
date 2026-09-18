import secrets
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.app.database import create_tables, get_connection


app = FastAPI(title="Green Lab Attendance System")


# --------------------------------------------------
# CORS
# --------------------------------------------------

ALLOWED_ORIGINS = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://rakhuljm.github.io",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Local frontend
# --------------------------------------------------

app.mount(
    "/frontend",
    StaticFiles(directory="docs", html=True),
    name="frontend"
)


# --------------------------------------------------
# Authentication
# --------------------------------------------------

SESSION_PREFIX = "Bearer "

LOCAL_TIMEZONE = ZoneInfo("Asia/Kolkata")


def current_time():
    return datetime.now(
        LOCAL_TIMEZONE
    ).strftime("%Y-%m-%d %H:%M:%S")


def get_current_student(
    authorization: str | None
):
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )

    if not authorization.startswith(SESSION_PREFIX):
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication format"
        )

    session_token = authorization[
        len(SESSION_PREFIX):
    ].strip()

    if not session_token:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token"
        )

    connection = get_connection()

    try:
        student = connection.execute(
            """
            SELECT
                s.student_id,
                s.name
            FROM student_devices d
            JOIN students s
                ON s.student_id = d.student_id
            WHERE d.device_token = ?
            """,
            (session_token,)
        ).fetchone()

        if student is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication token"
            )

        return student

    finally:
        connection.close()


# --------------------------------------------------
# Request models
# --------------------------------------------------

class StudentRegistration(BaseModel):
    student_id: str
    name: str


# --------------------------------------------------
# Startup
# --------------------------------------------------

@app.on_event("startup")
def startup():
    create_tables()


# --------------------------------------------------
# Home
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "Green Lab Attendance System is running"
    }


# --------------------------------------------------
# Student registration
# --------------------------------------------------

@app.post("/students/register")
def register_student(
    student: StudentRegistration
):
    connection = get_connection()

    try:
        existing_student = connection.execute(
            """
            SELECT student_id
            FROM students
            WHERE student_id = ?
            """,
            (student.student_id,)
        ).fetchone()

        if existing_student is not None:
            raise HTTPException(
                status_code=400,
                detail="Student ID already exists"
            )

        connection.execute(
            """
            INSERT INTO students
                (student_id, name)
            VALUES
                (?, ?)
            """,
            (
                student.student_id,
                student.name
            )
        )

        session_token = secrets.token_urlsafe(32)

        connection.execute(
            """
            INSERT INTO student_devices
                (student_id, device_token, created_at)
            VALUES
                (?, ?, ?)
            """,
            (
                student.student_id,
                session_token,
                current_time()
            )
        )

        connection.commit()

        return {
            "message": "Registration successful",
            "student_id": student.student_id,
            "name": student.name,
            "session_token": session_token
        }

    finally:
        connection.close()


# --------------------------------------------------
# Current student identity
# --------------------------------------------------

@app.get("/auth/me")
def get_current_identity(
    authorization: str | None = Header(
        default=None
    )
):
    student = get_current_student(
        authorization
    )

    return {
        "student_id": student["student_id"],
        "name": student["name"]
    }


# --------------------------------------------------
# Current attendance state
# --------------------------------------------------

@app.get("/attendance/current")
def get_current_attendance(
    authorization: str | None = Header(
        default=None
    )
):
    student = get_current_student(
        authorization
    )

    connection = get_connection()

    try:
        session = connection.execute(
            """
            SELECT
                id,
                entry_time,
                exit_time,
                duration_minutes
            FROM attendance_sessions
            WHERE student_id = ?
              AND exit_time IS NULL
            ORDER BY id DESC
            LIMIT 1
            """,
            (student["student_id"],)
        ).fetchone()

        if session is None:
            return {
                "inside_lab": False,
                "student_id": student["student_id"],
                "name": student["name"]
            }

        return {
            "inside_lab": True,
            "student_id": student["student_id"],
            "name": student["name"],
            "entry_time": session["entry_time"]
        }

    finally:
        connection.close()


# --------------------------------------------------
# Automatic ENTRY / EXIT
# --------------------------------------------------

@app.post("/attendance/toggle")
def toggle_attendance(
    authorization: str | None = Header(
        default=None
    )
):
    student = get_current_student(
        authorization
    )

    connection = get_connection()

    try:
        active_session = connection.execute(
            """
            SELECT
                id,
                entry_time
            FROM attendance_sessions
            WHERE student_id = ?
              AND exit_time IS NULL
            ORDER BY id DESC
            LIMIT 1
            """,
            (student["student_id"],)
        ).fetchone()

        # ------------------------------------------
        # ENTRY
        # ------------------------------------------

        if active_session is None:

            entry_time = current_time()

            connection.execute(
                """
                INSERT INTO attendance_sessions
                    (student_id, entry_time)
                VALUES
                    (?, ?)
                """,
                (
                    student["student_id"],
                    entry_time
                )
            )

            connection.commit()

            return {
                "action": "entry",
                "message": "Entry recorded successfully",
                "student_id": student["student_id"],
                "name": student["name"],
                "entry_time": entry_time
            }

        # ------------------------------------------
        # EXIT
        # ------------------------------------------

        exit_time = current_time()

        entry_datetime = datetime.strptime(
            active_session["entry_time"],
            "%Y-%m-%d %H:%M:%S"
        )

        exit_datetime = datetime.strptime(
            exit_time,
            "%Y-%m-%d %H:%M:%S"
        )

        duration_minutes = max(
            0,
            int(
                (
                    exit_datetime - entry_datetime
                ).total_seconds() / 60
            )
        )

        connection.execute(
            """
            UPDATE attendance_sessions
            SET
                exit_time = ?,
                duration_minutes = ?
            WHERE id = ?
            """,
            (
                exit_time,
                duration_minutes,
                active_session["id"]
            )
        )

        connection.commit()

        return {
            "action": "exit",
            "message": "Exit recorded successfully",
            "student_id": student["student_id"],
            "name": student["name"],
            "entry_time": active_session["entry_time"],
            "exit_time": exit_time,
            "duration_minutes": duration_minutes
        }

    finally:
        connection.close()


# --------------------------------------------------
# Attendance history
# --------------------------------------------------

@app.get("/attendance/me")
def get_my_attendance(
    authorization: str | None = Header(
        default=None
    )
):
    student = get_current_student(
        authorization
    )

    connection = get_connection()

    try:
        sessions = connection.execute(
            """
            SELECT
                entry_time,
                exit_time,
                duration_minutes
            FROM attendance_sessions
            WHERE student_id = ?
            ORDER BY id DESC
            """,
            (student["student_id"],)
        ).fetchall()

        return [
            {
                "student_id":
                    student["student_id"],
                "name":
                    student["name"],
                "entry_time":
                    session["entry_time"],
                "exit_time":
                    session["exit_time"],
                "duration_minutes":
                    session["duration_minutes"]
            }
            for session in sessions
        ]

    finally:
        connection.close()
