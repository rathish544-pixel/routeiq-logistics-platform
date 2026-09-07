import logging
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

logger = logging.getLogger(__name__)

# Accepted in development only, when Supabase is not configured.
DEV_SESSION_TOKEN = "routeiq-ops-session-token"
DEV_OPS_IDENTITY = {
    "sub": "local-ops-controller",
    "email": "ops.lead@routeiq-logistics.com",
    "name": "Operations Lead",
    "role": "Logistics Mission Controller",
    "iss": "routeiq-local",
}

bearer_scheme = HTTPBearer(auto_error=False)


class UserIdentity:
    """Verified caller identity attached to protected requests."""

    def __init__(self, sub: str, email: str, name: str, role: str):
        self.sub = sub
        self.email = email
        self.name = name
        self.role = role

    def to_profile(self) -> dict:
        return {
            "email": self.email,
            "name": self.name,
            "role": self.role,
        }


def _verify_supabase_token(token: str) -> UserIdentity:
    """Verify an HS256 JWT issued by Supabase GoTrue."""
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
            options={"require": ["sub", "exp"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email = payload.get("email") or payload.get("sub") or "authenticated@routeiq"
    return UserIdentity(
        sub=payload["sub"],
        email=email,
        name=(payload.get("user_metadata") or {}).get("name") or email.split("@")[0].replace(".", " ").title(),
        role=(payload.get("app_metadata") or {}).get("role") or (payload.get("user_metadata") or {}).get("role") or "Logistics Dispatcher",
    )


def _dev_identity_from_token(token: str) -> UserIdentity:
    """Development-mode identity when Supabase is not configured."""
    if token == DEV_SESSION_TOKEN:
        return UserIdentity(
            sub=DEV_OPS_IDENTITY["sub"],
            email=DEV_OPS_IDENTITY["email"],
            name=DEV_OPS_IDENTITY["name"],
            role=DEV_OPS_IDENTITY["role"],
        )

    # Accept locally-issued JWTs too (used by non-browser integrations)
    try:
        payload = jwt.decode(token, "routeiq-dev-secret", algorithms=["HS256"])
        return UserIdentity(
            sub=str(payload.get("sub") or "dev-user"),
            email=str(payload.get("email") or "ops@routeiq.test"),
            name=str(payload.get("name") or "Dev Operator"),
            role=str(payload.get("role") or "Logistics Mission Controller"),
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid development session token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def issue_dev_token(identity: dict | None = None) -> str:
    """Issue a signed dev token (never used when Supabase is configured)."""
    claims = dict(DEV_OPS_IDENTITY)
    if identity:
        claims.update(identity)
    claims["iat"] = datetime.now(timezone.utc)
    claims["exp"] = datetime.now(timezone.utc) + timedelta(hours=12)
    return jwt.encode(claims, "routeiq-dev-secret", algorithm="HS256")


def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserIdentity:
    """FastAPI dependency enforcing a valid session on protected endpoints."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a Bearer session token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    if settings.supabase_configured:
        return _verify_supabase_token(token)

    return _dev_identity_from_token(token)


def issue_tracking_token() -> str:
    """Short-lived token used by WebSocket clients to authenticate handshakes."""
    return uuid.uuid4().hex