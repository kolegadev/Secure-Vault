from typing import List

from pydantic import BaseModel


class ClientConfig(BaseModel):
    allowed_profiles: List[str]
    can_sign: bool = False
    is_admin: bool = False
    api_key: str


class ProfileConfig(BaseModel):
    allowed_secrets: List[str] = []
    allowed_skills: List[str] = []
