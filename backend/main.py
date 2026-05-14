from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.process import router as process_router
from routes.chat import router as chat_router
from routes.jobs import router as jobs_router
from routes.analysis import router as analysis_router

app = FastAPI(title="Audio Transcriber and Summariser")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(process_router)
app.include_router(chat_router)
app.include_router(jobs_router)
app.include_router(analysis_router)


@app.get("/")
def health_check():
    return {"status": "API is running"}


@app.get("/ping")
def ping():
    return {"ok": True}
