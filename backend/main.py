import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from routes.process import router as process_router
from routes.history import router as history_router

app = FastAPI(title="Audio Transcriber and Summariser")

_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
print(f"[CORS] Allowed origins: {_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"[REQUEST] {request.method} {request.url} | Origin: {request.headers.get('origin')}")
    response = await call_next(request)
    print(f"[RESPONSE] {response.status_code}")
    return response

app.include_router(process_router)
app.include_router(history_router)


@app.get("/")
def health_check():
    return {"status": "API is running"}
