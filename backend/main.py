import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.process import router as process_router
from routes.history import router as history_router

app = FastAPI(title="Audio Transcriber and Summariser")

_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(process_router)
app.include_router(history_router)


@app.get("/")
def health_check():
    return {"status": "API is running"}
