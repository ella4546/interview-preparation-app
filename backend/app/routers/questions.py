import uuid

from fastapi import APIRouter, HTTPException

from app.schemas.question import (
    GenerateQuestionRequest,
    HintRequest,
    HintResponse,
    QuestionResponse,
)
from app.services import gemini_client

router = APIRouter()


@router.post("/generate", response_model=QuestionResponse)
def generate_question(req: GenerateQuestionRequest) -> QuestionResponse:
    try:
        text = gemini_client.generate_question(req.topic, req.difficulty, avoid=req.avoid)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return QuestionResponse(
        id=str(uuid.uuid4()),
        topic=req.topic,
        difficulty=req.difficulty,
        question_text=text,
    )


@router.post("/hint", response_model=HintResponse)
def get_hint(req: HintRequest) -> HintResponse:
    try:
        hint = gemini_client.generate_hint(req.question_text)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return HintResponse(hint=hint, xp_cost=3)