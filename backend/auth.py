import os
import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from .database import get_db
from . import crud, models, schemas

bearer_scheme = HTTPBearer()

_jwks_cache: dict | None = None

def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    clerk_domain = os.environ.get("CLERK_ISSUER_DOMAIN")
    if not clerk_domain:
        raise RuntimeError("CLERK_ISSUER_DOMAIN env variable not set")
    url = f"https://{clerk_domain}/.well-known/jwks.json"
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    _jwks_cache = resp.json()
    return _jwks_cache

def _decode_token(token: str) -> dict:
    clerk_domain = os.environ.get("CLERK_ISSUER_DOMAIN")
    if not clerk_domain:
        raise RuntimeError("CLERK_ISSUER_DOMAIN env variable not set")
    jwks = _get_jwks()
    try:
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            options={"verify_aud": False},
            issuer=f"https://{clerk_domain}",
        )
        return payload
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    payload = _decode_token(credentials.credentials)

    # `sub` is the Clerk user ID (e.g. "user_2abc...") — always present in every Clerk JWT
    clerk_id: str | None = payload.get("sub")
    if not clerk_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub claim")

    # Email and name are optional — only present if a custom Clerk JWT template includes them
    email: str | None = payload.get("email")
    name: str | None = (
        payload.get("name")
        or f"{payload.get('first_name', '')} {payload.get('last_name', '')}".strip()
        or email
        or clerk_id
    )

    user = crud.get_user_by_clerk_id(db, clerk_id=clerk_id)
    if not user:
        user = crud.create_user(db, schemas.UserCreate(clerk_id=clerk_id, email=email, name=name or clerk_id))
    else:
        # Keep name/email up to date if they changed
        changed = False
        if name and user.name != name:
            user.name = name
            changed = True
        if email and user.email != email:
            user.email = email
            changed = True
        if changed:
            db.commit()
            db.refresh(user)

    return user
