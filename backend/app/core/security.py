import base64
import logging
from datetime import datetime, timedelta, timezone

import jwt
import requests
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------
# Development fallback
# -------------------------------------------------------------------

DEV_SESSION_TOKEN = "routeiq-ops-session-token"

DEV_OPS_IDENTITY = {
    "sub": "local-ops-controller",
    "email": "ops.lead@routeiq-logistics.com",
    "name": "Operations Lead",
    "role": "Logistics Mission Controller",
    "iss": "routeiq-local",
}

bearer_scheme = HTTPBearer(auto_error=False)


# -------------------------------------------------------------------
# User identity
# -------------------------------------------------------------------

class UserIdentity:
    """Verified caller identity attached to protected requests."""

    def __init__(
        self,
        sub: str,
        email: str,
        name: str,
        role: str,
    ):
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


# -------------------------------------------------------------------
# Supabase JWKS
# -------------------------------------------------------------------

def _get_supabase_jwks() -> dict:
    """Fetch Supabase's public JWT signing keys."""

    if not settings.SUPABASE_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase URL is not configured.",
        )

    if not settings.SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase API key is not configured.",
        )

    jwks_url = (
        settings.SUPABASE_URL.rstrip("/")
        + "/auth/v1/.well-known/jwks.json"
    )

    try:
        response = requests.get(
            jwks_url,
            headers={
                "apikey": settings.SUPABASE_ANON_KEY,
            },
            timeout=10,
        )

        response.raise_for_status()

        return response.json()

    except requests.RequestException as exc:
        logger.exception("Unable to fetch Supabase JWKS")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to fetch Supabase signing keys.",
        ) from exc


# -------------------------------------------------------------------
# EC public key helpers
# -------------------------------------------------------------------

def _base64url_to_int(value: str) -> int:
    """
    Convert a base64url encoded EC coordinate into an integer.
    """

    padding = "=" * (-len(value) % 4)

    decoded = base64.urlsafe_b64decode(
        value + padding
    )

    return int.from_bytes(decoded, byteorder="big")


def _jwk_to_ec_public_key(key_data: dict):
    """
    Convert a Supabase ES256 JWK into a cryptography EC public key.
    """

    if key_data.get("kty") != "EC":
        raise ValueError("Signing key is not an EC key.")

    if key_data.get("crv") != "P-256":
        raise ValueError("Unsupported EC curve.")

    x = key_data.get("x")
    y = key_data.get("y")

    if not x or not y:
        raise ValueError("EC signing key is missing x/y coordinates.")

    x_int = _base64url_to_int(x)
    y_int = _base64url_to_int(y)

    public_numbers = ec.EllipticCurvePublicNumbers(
        x_int,
        y_int,
        ec.SECP256R1(),
    )

    return public_numbers.public_key()


# -------------------------------------------------------------------
# Find Supabase signing key
# -------------------------------------------------------------------

def _get_supabase_signing_key(token: str):
    """Find and construct the public key matching the JWT kid."""

    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token.",
        ) from exc

    token_kid = header.get("kid")
    token_alg = header.get("alg")

    if not token_kid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token is missing signing key information.",
        )

    if token_alg != "ES256":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unsupported session token algorithm.",
        )

    jwks = _get_supabase_jwks()

    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == token_kid:
            try:
                return _jwk_to_ec_public_key(key_data)

            except Exception as exc:
                logger.exception(
                    "Unable to build Supabase signing key"
                )

                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Unable to process Supabase signing key.",
                ) from exc

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session signing key was not found.",
    )


# -------------------------------------------------------------------
# Supabase JWT verification
# -------------------------------------------------------------------

def _verify_supabase_token(token: str) -> UserIdentity:
    """Verify a Supabase ES256 access token."""

    try:
        signing_key = _get_supabase_signing_key(token)

        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["ES256"],
            audience="authenticated",
            options={
                "require": [
                    "sub",
                    "exp",
                ]
            },
        )

    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired.",
        ) from exc

    except jwt.InvalidAudienceError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session audience.",
        ) from exc

    except jwt.InvalidTokenError as exc:
        logger.warning(
            "Supabase JWT validation failed: %s",
            exc,
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token.",
        ) from exc

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception(
            "Unexpected Supabase JWT validation error"
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token.",
        ) from exc

    user_id = str(payload.get("sub", ""))
    email = str(payload.get("email", ""))

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token does not contain a user identity.",
        )

    if not email:
        email = "authenticated-user"

    user_metadata = payload.get("user_metadata") or {}

    name = (
        user_metadata.get("name")
        or user_metadata.get("full_name")
        or email.split("@")[0]
    )

    role = user_metadata.get(
        "role",
        "Logistics Dispatcher",
    )

    return UserIdentity(
        sub=user_id,
        email=email,
        name=str(name),
        role=str(role),
    )


# -------------------------------------------------------------------
# Development token verification
# -------------------------------------------------------------------

def _verify_dev_token(token: str) -> UserIdentity:
    """Verify the local development session token."""

    if token != DEV_SESSION_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token.",
        )

    return UserIdentity(
        sub=DEV_OPS_IDENTITY["sub"],
        email=DEV_OPS_IDENTITY["email"],
        name=DEV_OPS_IDENTITY["name"],
        role=DEV_OPS_IDENTITY["role"],
    )


# -------------------------------------------------------------------
# Main authentication dependency
# -------------------------------------------------------------------

def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
) -> UserIdentity:
    """Protect API endpoints with Supabase authentication."""

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    if (
        settings.ENVIRONMENT == "development"
        and not settings.supabase_configured
        and token == DEV_SESSION_TOKEN
    ):
        return _verify_dev_token(token)

    return _verify_supabase_token(token)


# -------------------------------------------------------------------
# Current user dependency
# -------------------------------------------------------------------

def get_current_user(
    user: UserIdentity = Depends(require_user),
) -> UserIdentity:
    return user


# -------------------------------------------------------------------
# Development token generator
# -------------------------------------------------------------------

def issue_dev_token() -> str:
    """Return the local development token."""

    return DEV_SESSION_TOKEN


# -------------------------------------------------------------------
# Local JWT helper
# -------------------------------------------------------------------

def create_local_jwt(
    subject: str = "local-ops-controller",
    email: str = "ops.lead@routeiq-logistics.com",
    name: str = "Operations Lead",
    role: str = "Logistics Mission Controller",
) -> str:
    """Create a short-lived local HS256 JWT."""

    if not settings.SUPABASE_JWT_SECRET:
        raise RuntimeError(
            "SUPABASE_JWT_SECRET is not configured."
        )

    now = datetime.now(timezone.utc)

    payload = {
        "sub": subject,
        "email": email,
        "name": name,
        "role": role,
        "iat": now,
        "exp": now + timedelta(hours=1),
        "aud": "authenticated",
    }

    return jwt.encode(
        payload,
        settings.SUPABASE_JWT_SECRET,
        algorithm="HS256",
    )
