from pydantic import BaseModel, Field


class GradeRequest(BaseModel):
    question_id: str
    question_text: str
    answer_text: str = Field(..., min_length=1)
    user_id: str | None = None
    hints_used: int = 0


class GradeResponse(BaseModel):
    score: int = Field(..., ge=0, le=10)
    correct: bool
    verdict: str  # "correct" | "partial" | "incorrect"
    feedback: str
    missed_concepts: list[str] = []
    strong_concepts: list[str] = []
    xp_earned: int
