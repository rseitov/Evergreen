from pydantic import BaseModel


class ShareLinkOut(BaseModel):
    token: str
    url_path: str
