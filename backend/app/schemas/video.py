from pydantic import BaseModel


class VideoItem(BaseModel):
    video_id: str
    title: str
    channel: str
    thumbnail_url: str
    url: str


class VideosForConceptResponse(BaseModel):
    concept: str
    videos: list[VideoItem]