import logging

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import require_user, UserIdentity, DEV_SESSION_TOKEN

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    email: str
    password: str | None = None


class UserProfile(BaseModel):
    email: str
    name: str
    role: str
    token: str


def _supabase_login(email: str, password: str) -> dict:
    """Exchange credentials for a Supabase session via GoTrue."""
    if not (settings.SUPABASE_URL and settings.SUPABASE_ANON_KEY):
        raise HTTPException(
            status_code=503,
            detail="Supabase authentication is not configured on this deployment.",
        )

    try:
        response = requests.post(
            f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={
                "apikey": settings.SUPABASE_ANON_KEY,
                "Content-Type": "application/json",
            },
            json={"email": email, "password": password},
            timeout=10,
        )
    except requests.RequestException as e:
        logger.error("Supabase auth request failed: %s", e)
        raise HTTPException(
            status_code=502,
            detail="Identity provider unreachable. Please retry.",
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
        )

    data = response.json()
    user = data.get("user", {})
    meta = user.get("user_metadata") or {}
    access_token = data.get("access_token", "")

    return {
        "email": user.get("email", email),
        "name": meta.get("name") or email.split("@")[0].replace(".", " ").title(),
        "role": "Logistics Dispatcher",
        "token": access_token,
    }


@router.post("/login", response_model=UserProfile)
def login(req: LoginRequest):
    if settings.supabase_configured:
        password = req.password or ""
        profile = _supabase_login(req.email, password)
        return UserProfile(**profile)

    # ---- Development mode (no Supabase configured) ----
    if not req.password:
        raise HTTPException(
            status_code=400,
            detail="Password is required.",
        )

    name = req.email.split("@")[0].replace(".", " ").title()

    return UserProfile(
        email=req.email,
        name=name,
        role="Logistics Mission Controller",
        token=DEV_SESSION_TOKEN,
    )


@router.get("/me", response_model=UserProfile)
def get_current_user(identity: UserIdentity = Depends(require_user)):
    return UserProfile(
        email=identity.email,
        name=identity.name,
        role=identity.role,
        token="active-session",
    )