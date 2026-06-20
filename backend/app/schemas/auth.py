from pydantic import BaseModel, EmailStr


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    org_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    user_id: str
    org_id: str | None = None


class MembershipOut(BaseModel):
    org_id: str
    role: str


class MeResponse(BaseModel):
    user_id: str
    email: str
    memberships: list[MembershipOut]
