from typing import Literal

from pydantic import BaseModel, EmailStr


class AddMemberRequest(BaseModel):
    email: EmailStr
    role: Literal["viewer", "editor", "owner"]


class MemberOut(BaseModel):
    user_id: str
    email: str
    role: str
