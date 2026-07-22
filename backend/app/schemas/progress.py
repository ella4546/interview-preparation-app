from pydantic import BaseModel


class TopicMastery(BaseModel):
    topic: str
    mastery_percent: int
    attempts: int


class ProgressResponse(BaseModel):
    user_id: str
    total_solved: int
    accuracy_percent: int
    hints_used: int
    current_xp: int
    xp_for_next_level: int
    current_level: int
    current_streak: int
    longest_streak: int
    topics: list[TopicMastery]