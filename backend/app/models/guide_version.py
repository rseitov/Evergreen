from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import new_id, utcnow


class GuideVersion(Base):
    __tablename__ = "guide_versions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    guide_id: Mapped[str] = mapped_column(String(32), ForeignKey("guides.id"), nullable=False, index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
