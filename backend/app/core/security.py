"""Auth helpers. Real JWT verification lands in Batch 4+."""
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status


async def get_current_user_id(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    """
    Placeholder auth: expects `Authorization: Bearer <user_id>`.
    We'll replace this with real Supabase JWT verification once auth is wired.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    return authorization.split(" ", 1)[1].strip()


# For routes that should work with or without a signed-in user
async def get_optional_user_id(
    authorization: Annotated[str | None, Header()] = None,
) -> str | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization.split(" ", 1)[1].strip()