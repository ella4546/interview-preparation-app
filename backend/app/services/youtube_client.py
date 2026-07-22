"""YouTube Data API v3 client for finding explainer videos."""
import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"


async def search_videos(query: str, max_results: int = 3) -> list[dict]:
    """Search YouTube for videos matching a concept."""
    settings = get_settings()
    if not settings.youtube_api_key:
        raise RuntimeError("YOUTUBE_API_KEY is not set in .env")

    params = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": max_results,
        "key": settings.youtube_api_key,
        "safeSearch": "strict",
        "relevanceLanguage": "en",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(_YOUTUBE_SEARCH_URL, params=params)
        response.raise_for_status()
        data = response.json()

    videos = []
    for item in data.get("items", []):
        video_id = item["id"]["videoId"]
        snippet = item["snippet"]
        videos.append(
            {
                "video_id": video_id,
                "title": snippet["title"],
                "channel": snippet["channelTitle"],
                "thumbnail_url": snippet["thumbnails"]["medium"]["url"],
                "url": f"https://www.youtube.com/watch?v={video_id}",
            }
        )
    return videos