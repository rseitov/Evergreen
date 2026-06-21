from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import new_id, utcnow


class ShareLink(Base):
    __tablename__ = "share_links"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id"), nullable=False, index=True)
    guide_id: Mapped[str] = mapped_column(String(32), ForeignKey("guides.id"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
