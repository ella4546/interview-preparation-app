from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import gemini_client

router = APIRouter()


# ============================================================
# Legacy follow-up endpoint (unchanged)
# ============================================================

class FollowUpTurn(BaseModel):
    role: str  # "interviewer" | "candidate"
    content: str


class FollowUpRequest(BaseModel):
    topic: str
    history: list[FollowUpTurn]


class FollowUpResponse(BaseModel):
    next_question: str


@router.post("/follow-up", response_model=FollowUpResponse)
def follow_up(req: FollowUpRequest) -> FollowUpResponse:
    try:
        question = gemini_client.follow_up_question(
            [t.model_dump() for t in req.history], req.topic
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return FollowUpResponse(next_question=question)


# ============================================================
# Mock Interview: start / continue / evaluate
# ============================================================

Role = Literal["interviewer", "candidate"]


class InterviewTurn(BaseModel):
    role: Role
    content: str


class StartInterviewRequest(BaseModel):
    focus: str
    display_name: str | None = None


class StartInterviewResponse(BaseModel):
    opening_message: str


class NextTurnRequest(BaseModel):
    focus: str
    transcript: list[InterviewTurn]


class NextTurnResponse(BaseModel):
    interviewer_message: str


class EvaluateRequest(BaseModel):
    focus: str
    transcript: list[InterviewTurn]


class EvaluateResponse(BaseModel):
    overall_score: int
    hire_recommendation: str
    technical_depth: int
    communication: int
    problem_solving: int
    summary: str
    strengths: list[str]
    weaknesses: list[str]
    study_recommendations: list[str]


@router.post("/start", response_model=StartInterviewResponse)
def start_interview(req: StartInterviewRequest) -> StartInterviewResponse:
    try:
        opener = gemini_client.interview_opener(req.focus, req.display_name)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return StartInterviewResponse(opening_message=opener)


@router.post("/next-turn", response_model=NextTurnResponse)
def next_turn(req: NextTurnRequest) -> NextTurnResponse:
    if len(req.transcript) == 0:
        raise HTTPException(status_code=400, detail="Transcript cannot be empty")
    try:
        message = gemini_client.interview_next_turn(
            req.focus, [t.model_dump() for t in req.transcript]
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return NextTurnResponse(interviewer_message=message)


@router.post("/evaluate", response_model=EvaluateResponse)
def evaluate(req: EvaluateRequest) -> EvaluateResponse:
    if len(req.transcript) < 2:
        raise HTTPException(
            status_code=400, detail="Need at least 2 turns to evaluate"
        )
    try:
        result = gemini_client.interview_evaluate(
            req.focus, [t.model_dump() for t in req.transcript]
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return EvaluateResponse(**result)