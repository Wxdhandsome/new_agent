"""
知识库数据模型（SQLAlchemy）
与现有 Workflow 模型共存于同一数据库
"""
import uuid
from sqlalchemy import Column, String, Text, DateTime, Integer, JSON, func
from ..core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class KnowledgeBase(Base):
    __tablename__ = "knowledge_base"

    kb_id = Column(String(64), primary_key=True, index=True, default=generate_uuid)
    name = Column(String(128), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    chunk_size = Column(Integer, default=800)
    chunk_overlap = Column(Integer, default=100)
    doc_count = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Document(Base):
    __tablename__ = "kb_document"

    doc_id = Column(String(64), primary_key=True, index=True, default=generate_uuid)
    kb_id = Column(String(64), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    path = Column(Text, nullable=False)
    file_size = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DocumentChunk(Base):
    __tablename__ = "kb_document_chunk"

    chunk_id = Column(String(128), primary_key=True, index=True)
    doc_id = Column(String(64), nullable=False, index=True)
    kb_id = Column(String(64), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
