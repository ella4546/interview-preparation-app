from fastapi import APIRouter

from app.schemas.progress import ProgressResponse, TopicMastery
from app.services import gamification

router = APIRouter()


@router.get("/{user_id}", response_model=ProgressResponse)
def get_progress(user_id: str) -> ProgressResponse:
    """
    Placeholder progress — returns mocked stats until DB queries are added.
    Real implementation lands in Batch 4 with Supabase queries.
    """
    total_xp = 640
    level, into_level, needed = gamification.level_for_total_xp(total_xp)
    return ProgressResponse(
        user_id=user_id,
        total_solved=42,
        accuracy_percent=68,
        hints_used=7,
        current_xp=into_level,
        xp_for_next_level=needed,
        current_level=level,
        current_streak=5,
        longest_streak=12,
        topics=[
            TopicMastery(topic="network_security", mastery_percent=38, attempts=12),
            TopicMastery(topic="system_design", mastery_percent=52, attempts=18),
            TopicMastery(topic="data_structures", mastery_percent=71, attempts=25),
        ],
    )