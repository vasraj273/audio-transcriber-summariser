import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.process import router as process_router
from routes.chat import router as chat_router
from routes.jobs import router as jobs_router
from routes.analysis import router as analysis_router
from routes.admin import router as admin_router

app = FastAPI(title="Audio Transcriber and Summariser")

_base_origins = [
    "https://audio-transcriber-summariser.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
]
_env_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
_allowed_origins = list(dict.fromkeys(_base_origins + _env_origins))
print(f"[CORS] allowed origins: {', '.join(_allowed_origins)}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(process_router)
app.include_router(chat_router)
app.include_router(jobs_router)
app.include_router(analysis_router)
app.include_router(admin_router)


@app.get("/")
def health_check():
    return {"status": "API is running"}


@app.get("/ping")
def ping():
    return {"ok": True}
