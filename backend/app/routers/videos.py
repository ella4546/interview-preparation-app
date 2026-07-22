from fastapi import APIRouter, HTTPException

from app.schemas.video import VideoItem, VideosForConceptResponse
from app.services import youtube_client

router = APIRouter()


@router.get("/for-concept", response_model=VideosForConceptResponse)
async def videos_for_concept(concept: str) -> VideosForConceptResponse:
    try:
        raw = await youtube_client.search_videos(concept, max_results=3)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"YouTube API error: {e}")

    return VideosForConceptResponse(
        concept=concept,
        videos=[VideoItem(**v) for v in raw],
    )