import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Integer,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from .config import DB_URL

connect_args = {"check_same_thread": False} if DB_URL.startswith("sqlite") else {}
engine = create_engine(DB_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


class ProfileModel(Base):
    __tablename__ = "profiles"

    id = Column(String(36), primary_key=True, default=new_uuid)
    full_name = Column(String(255), nullable=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    avatar_url = Column(Text, nullable=True)
    reset_token = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class OrganizationModel(Base):
    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True, default=new_uuid)
    name = Column(String(255), nullable=False)
    owner_id = Column(
        String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class OrganizationMemberModel(Base):
    __tablename__ = "organization_members"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_org_member"),
    )

    id = Column(String(36), primary_key=True, default=new_uuid)
    organization_id = Column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        String(36),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(32), nullable=False, default="owner")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class ScanBatchModel(Base):
    __tablename__ = "scan_batches"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_id = Column(
        String(36),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id = Column(
        String(36),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    batch_name = Column(String(255), nullable=False)
    total_images = Column(Integer, nullable=False, default=0)
    completed_count = Column(Integer, nullable=False, default=0)
    failed_count = Column(Integer, nullable=False, default=0)
    pending_count = Column(Integer, nullable=False, default=0)
    status = Column(String(32), nullable=False, default="pending", index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class CardScanModel(Base):
    __tablename__ = "card_scans"

    id = Column(String(36), primary_key=True, default=new_uuid)
    batch_id = Column(
        String(36),
        ForeignKey("scan_batches.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    user_id = Column(
        String(36),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id = Column(
        String(36),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    original_image_path = Column(Text, nullable=False)
    processed_image_path = Column(Text, nullable=True)
    raw_ocr_text = Column(Text, nullable=True)
    ocr_output = Column(JSON, nullable=False, default=list)
    extracted_data = Column(JSON, nullable=False, default=dict)
    extraction_confidence = Column(JSON, nullable=False, default=dict)
    status = Column(String(32), nullable=False, default="uploaded", index=True)
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)


class ContactModel(Base):
    __tablename__ = "contacts"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_id = Column(
        String(36),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id = Column(
        String(36),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    scan_id = Column(
        String(36),
        ForeignKey("card_scans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    full_name = Column(String(255), nullable=True, index=True)
    first_name = Column(String(128), nullable=True)
    last_name = Column(String(128), nullable=True)
    company_name = Column(String(255), nullable=True, index=True)
    designation = Column(String(255), nullable=True)
    phone = Column(String(64), nullable=True, index=True)
    alternate_phone = Column(String(64), nullable=True)
    email = Column(String(255), nullable=True, index=True)
    website = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(128), nullable=True)
    state = Column(String(128), nullable=True)
    postal_code = Column(String(32), nullable=True)
    country = Column(String(128), nullable=True)
    education = Column(String(255), nullable=True)
    linkedin_url = Column(String(255), nullable=True)
    additional_information = Column(JSON, nullable=False, default=dict)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class TagModel(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_tag_name"),)

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_id = Column(
        String(36),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id = Column(
        String(36),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
    )
    name = Column(String(100), nullable=False)
    color = Column(String(32), nullable=False, default="#3478F6")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class ContactTagModel(Base):
    __tablename__ = "contact_tags"

    contact_id = Column(
        String(36),
        ForeignKey("contacts.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id = Column(
        String(36),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )


class ContactNoteModel(Base):
    __tablename__ = "contact_notes"

    id = Column(String(36), primary_key=True, default=new_uuid)
    contact_id = Column(
        String(36),
        ForeignKey("contacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        String(36),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    note = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

