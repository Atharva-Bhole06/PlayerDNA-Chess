from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.schemas.auth import AuthenticatedProfile, Credentials
from backend.services.auth_service import AuthService, InvalidCredentialsError, UsernameTakenError


router = APIRouter(prefix="/auth", tags=["authentication"])
SESSION_COOKIE = "playerdna_session"


def get_auth_service(session: Session = Depends(get_db)) -> AuthService:
    return AuthService(session)


@router.post("/register", response_model=AuthenticatedProfile, status_code=201)
def register(credentials: Credentials, response: Response, service: AuthService = Depends(get_auth_service)):
    try:
        user, token = service.register(credentials.username, credentials.password)
    except UsernameTakenError as exc:
        raise HTTPException(status_code=409, detail="Username is already in use") from exc
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Username is already in use") from exc
    response.set_cookie(SESSION_COOKIE, token, httponly=True, secure=service.secure_cookies,
                        samesite="lax", max_age=service.session_seconds, path="/")
    return service.profile(user)


@router.post("/login", response_model=AuthenticatedProfile)
def login(credentials: Credentials, response: Response, service: AuthService = Depends(get_auth_service)):
    try:
        user, token = service.login(credentials.username, credentials.password)
    except InvalidCredentialsError as exc:
        raise HTTPException(status_code=401, detail="Invalid username or password") from exc
    response.set_cookie(SESSION_COOKIE, token, httponly=True, secure=service.secure_cookies,
                        samesite="lax", max_age=service.session_seconds, path="/")
    return service.profile(user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, service: AuthService = Depends(get_auth_service)):
    # Logout is idempotent; revoke the presented session when one exists.
    service.logout(request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, secure=service.secure_cookies, samesite="lax")
    response.status_code = 204
    return response


@router.get("/me", response_model=AuthenticatedProfile)
def me(request: Request, service: AuthService = Depends(get_auth_service)):
    user = service.authenticate(request.cookies.get(SESSION_COOKIE))
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return service.profile(user)
