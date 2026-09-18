import os
import sqlite3

import psycopg
from psycopg.rows import dict_row


SQLITE_DATABASE = "green_lab.db"


class DatabaseConnection:
    def __init__(self, connection, postgres=False):
        self.connection = connection
        self.postgres = postgres

    def execute(self, query, params=()):
        if self.postgres:
            query = query.replace("?", "%s")

        return self.connection.execute(query, params)

    def commit(self):
        self.connection.commit()

    def close(self):
        self.connection.close()


def get_connection():
    database_url = os.getenv("DATABASE_URL")

    if database_url:
        connection = psycopg.connect(
            database_url,
            row_factory=dict_row,
            sslmode="require"
        )

        return DatabaseConnection(
            connection,
            postgres=True
        )

    connection = sqlite3.connect(
        SQLITE_DATABASE
    )

    connection.row_factory = sqlite3.Row

    return DatabaseConnection(
        connection,
        postgres=False
    )


def create_tables():
    connection = get_connection()

    try:
        if connection.postgres:

            connection.execute("""
                CREATE TABLE IF NOT EXISTS students (
                    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    student_id TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL
                )
            """)

            connection.execute("""
                CREATE TABLE IF NOT EXISTS attendance_sessions (
                    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    entry_time TEXT NOT NULL,
                    exit_time TEXT,
                    duration_minutes INTEGER,
                    FOREIGN KEY (student_id)
                        REFERENCES students(student_id)
                )
            """)

            connection.execute("""
                CREATE TABLE IF NOT EXISTS student_devices (
                    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    device_token TEXT UNIQUE NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (student_id)
                        REFERENCES students(student_id)
                )
            """)

            connection.execute("""
                CREATE INDEX IF NOT EXISTS
                idx_attendance_student
                ON attendance_sessions(student_id)
            """)

            connection.execute("""
                CREATE INDEX IF NOT EXISTS
                idx_devices_student
                ON student_devices(student_id)
            """)

        else:

            connection.execute("""
                CREATE TABLE IF NOT EXISTS students (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL
                )
            """)

            connection.execute("""
                CREATE TABLE IF NOT EXISTS attendance_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id TEXT NOT NULL,
                    entry_time TEXT NOT NULL,
                    exit_time TEXT,
                    duration_minutes INTEGER
                )
            """)

            connection.execute("""
                CREATE TABLE IF NOT EXISTS student_devices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id TEXT NOT NULL,
                    device_token TEXT UNIQUE NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)

        connection.commit()

    finally:
        connection.close()
