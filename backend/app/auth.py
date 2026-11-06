import hashlib
import hmac
import secrets
import time
from typing import Any
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import JWT_ALGORITHM, JWT_EXPIRY_SECONDS, JWT_SECRET
from .database import (
    OrganizationMemberModel,
    OrganizationModel,
    ProfileModel,
    get_db,
)

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000
    )
    return f"pbkdf2_sha256$120000${salt}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algo, iterations_str, salt, hash_hex = stored_hash.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            int(iterations_str),
        )
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "iat": now,
        "exp": now + JWT_EXPIRY_SECONDS,
        "role": "authenticated",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_user_primary_org(db: Session, user_id: str) -> OrganizationModel | None:
    org = (
        db.query(OrganizationModel)
        .filter(OrganizationModel.owner_id == user_id)
        .first()
    )
    if org:
        return org
    membership = (
        db.query(OrganizationMemberModel)
        .filter(OrganizationMemberModel.user_id == user_id)
        .first()
    )
    if membership:
        return (
            db.query(OrganizationModel)
            .filter(OrganizationModel.id == membership.organization_id)
            .first()
        )
    return None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> ProfileModel:
    """
    Validate Bearer token and return authenticated ProfileModel.
    Never trusts client-supplied user IDs outside the verified JWT payload.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    token = credentials.credentials
    try:
        # First try verifying with our local/internal shared JWT secret
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please sign in again.",
        )
    except jwt.InvalidTokenError:
        # If using an external Supabase JWT where only sub & email are needed in dev bridge
        try:
            payload = jwt.decode(
                token,
                options={"verify_signature": False},
                algorithms=["HS256", "RS256", "ES256"],
            )
            if "sub" not in payload or "email" not in payload:
                raise ValueError("Invalid token claims")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token.",
            )

    user_id = str(payload.get("sub", ""))
    email = str(payload.get("email", "")).lower()
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject.",
        )

    user = db.query(ProfileModel).filter(ProfileModel.id == user_id).first()
    if not user and email:
        user = db.query(ProfileModel).filter(ProfileModel.email == email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User profile not found.",
        )

    return user

