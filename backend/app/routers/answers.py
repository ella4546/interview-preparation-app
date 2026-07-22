from fastapi import APIRouter, HTTPException

from app.schemas.answer import GradeRequest, GradeResponse
from app.services import gamification, gemini_client

router = APIRouter()


@router.post("/grade", response_model=GradeResponse)
def grade_answer(req: GradeRequest) -> GradeResponse:
    try:
        result = gemini_client.grade_answer(req.question_text, req.answer_text)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    score = int(result.get("score", 0))
    xp = gamification.xp_for_answer(score, req.hints_used)
    return GradeResponse(
        score=score,
        correct=bool(result.get("correct", False)),
        verdict=result.get("verdict") or gamification.verdict_for_score(score),
        feedback=result.get("feedback", ""),
        missed_concepts=result.get("missed_concepts", []),
        strong_concepts=result.get("strong_concepts", []),
        xp_earned=xp,
    )