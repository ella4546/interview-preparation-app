"""FastAPI application entrypoint."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import answers, auth, interview, progress, questions, videos

settings = get_settings()

app = FastAPI(
    title="Interview Prep API",
    version="0.1.0",
    description="Backend for the AI-powered interview preparation app.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}


# Routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(questions.router, prefix="/questions", tags=["questions"])
app.include_router(answers.router, prefix="/answers", tags=["answers"])
app.include_router(videos.router, prefix="/videos", tags=["videos"])
app.include_router(interview.router, prefix="/interview", tags=["interview"])
app.include_router(progress.router, prefix="/progress", tags=["progress"])