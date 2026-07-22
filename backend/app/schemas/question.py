from typing import Literal

from pydantic import BaseModel, Field

Difficulty = Literal["easy", "medium", "hard"]
Topic = Literal[
    "network_security",
    "system_design",
    "data_structures",
    "sql_databases",
    "algorithms",
    "operating_systems",
]


class GenerateQuestionRequest(BaseModel):
    topic: str
    difficulty: Difficulty = "medium"
    user_id: str | None = None
    avoid: list[str] | None = None


class QuestionResponse(BaseModel):
    id: str
    topic: str
    difficulty: Difficulty
    question_text: str


class HintRequest(BaseModel):
    question_id: str
    question_text: str


class HintResponse(BaseModel):
    hint: str
    xp_cost: int = 3