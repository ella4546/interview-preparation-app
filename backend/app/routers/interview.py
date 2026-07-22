from pydantic import BaseModel

from fastapi import APIRouter, HTTPException

from app.services import gemini_client

router = APIRouter()


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