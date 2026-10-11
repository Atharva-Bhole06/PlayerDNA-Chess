from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.routes.auth import SESSION_COOKIE
from backend.services.auth_service import AuthService


def current_user(request: Request, session: Session = Depends(get_db)):
    user = AuthService(session).authenticate(request.cookies.get(SESSION_COOKIE))
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user
