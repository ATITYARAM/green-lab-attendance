from fastapi import FastAPI

app = FastAPI(title="Green Lab Attendance System")


@app.get("/")
def home():
    return {
        "message": "Green Lab Attendance System is running!"
    }
