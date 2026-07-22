"""Auth stubs — real Supabase auth wiring comes in Batch 4+."""
from fastapi import APIRouter, HTTPException

from app.schemas.auth import AuthResponse, LoginRequest, SignUpRequest

router = APIRouter()


@router.post("/signup", response_model=AuthResponse)
def signup(req: SignUpRequest) -> AuthResponse:
    raise HTTPException(
        status_code=501,
        detail="Auth not implemented yet — coming in Batch 4",
    )


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest) -> AuthResponse:
    raise HTTPException(
        status_code=501,
        detail="Auth not implemented yet — coming in Batch 4",
    )