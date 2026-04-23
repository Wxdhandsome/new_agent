"""
知识库管理 API
"""
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field, field_serializer
from datetime import datetime

from ..core.database import get_db
from ..core.config import settings
from ..knowledge_base import (
    create_kb,
    get_kb,
    list_kbs,
    update_kb,
    delete_kb,
    create_document,
    get_document,
    list_documents,
    delete_document,
    build_document_index,
    recall_search,
)
from ..knowledge_base.models import KnowledgeBase as KBModel

router = APIRouter(prefix="/kb", tags=["knowledge-base"])


# ── Pydantic 模型 ────────────────────────────────────────

class KBCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    chunk_size: int = Field(800, ge=100, le=2000)
    chunk_overlap: int = Field(100, ge=0, le=1000)


class KBResponse(BaseModel):
    kb_id: str
    name: str
    description: Optional[str]
    chunk_size: int
    chunk_overlap: int
    doc_count: int
    chunk_count: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

    @field_serializer('created_at', 'updated_at')
    def serialize_datetime(self, dt: Optional[datetime]) -> Optional[str]:
        return dt.isoformat() if dt else None


class RecallRequest(BaseModel):
    query: str = Field(..., min_length=1)
    retrieval_mode: str = Field("hybrid")
    top_k: int = Field(6, ge=1, le=20)
    candidate_k: int = Field(30, ge=1, le=50)
    dense_weight: float = Field(0.7, ge=0.0, le=1.0)
    sparse_weight: float = Field(0.3, ge=0.0, le=1.0)
    min_score: float = Field(0.5, ge=0.0, le=1.0)
    enable_rerank: bool = Field(False)
    max_chars: int = Field(15000, ge=1000, le=50000)


# ── 知识库路由 ──────────────────────────────────────────

@router.get("", response_model=List[KBResponse])
def api_list_kbs(db: Session = Depends(get_db)):
    """获取知识库列表"""
    return list_kbs(db)


@router.post("", response_model=KBResponse)
def api_create_kb(payload: KBCreateRequest, db: Session = Depends(get_db)):
    """创建知识库"""
    kb = create_kb(
        db,
        name=payload.name,
        description=payload.description or "",
        chunk_size=payload.chunk_size,
        chunk_overlap=payload.chunk_overlap,
    )
    if kb is None:
        raise HTTPException(status_code=409, detail=f"知识库名称 '{payload.name}' 已存在")
    return kb


@router.put("/{kb_id}", response_model=KBResponse)
def api_update_kb(kb_id: str, payload: KBCreateRequest, db: Session = Depends(get_db)):
    """更新知识库"""
    kb = update_kb(
        db,
        kb_id=kb_id,
        name=payload.name,
        description=payload.description or "",
        chunk_size=payload.chunk_size,
        chunk_overlap=payload.chunk_overlap,
    )
    if kb is None:
        raise HTTPException(status_code=404, detail="知识库不存在或名称已冲突")
    return kb


@router.delete("/{kb_id}")
def api_delete_kb(kb_id: str, db: Session = Depends(get_db)):
    """删除知识库"""
    deleted = delete_kb(db, kb_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="知识库不存在")
    return {"message": "知识库删除成功", "kb_id": kb_id}


# ── 文档路由 ──────────────────────────────────────────

@router.post("/{kb_id}/documents/upload")
async def api_upload_document(
    kb_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """上传文档到指定知识库，并自动构建向量索引"""
    kb = get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    safe_filename = os.path.basename(file.filename)
    ext = os.path.splitext(safe_filename)[1].lower()
    if ext not in {".pdf", ".txt", ".md"}:
        raise HTTPException(status_code=400, detail="仅支持 PDF / TXT / MD 文件")

    # 确保上传目录存在
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest_path = settings.UPLOAD_DIR / safe_filename

    try:
        with open(dest_path, "wb") as f:
            while True:
                chunk_data = await file.read(1024 * 1024)
                if not chunk_data:
                    break
                f.write(chunk_data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"保存文件失败: {exc}")
    finally:
        await file.close()

    file_size = os.path.getsize(dest_path)
    doc = create_document(db, kb_id=kb_id, filename=safe_filename, path=str(dest_path), file_size=file_size)
    if doc is None:
        os.remove(dest_path)
        raise HTTPException(status_code=409, detail=f"文件 '{safe_filename}' 已存在于该知识库中")

    # 自动构建索引
    index_result = {"total_chunks": 0, "indexed_chunks": 0}
    try:
        index_result = build_document_index(db, doc.doc_id)
    except Exception as exc:
        print(f"[WARNING] 自动索引构建失败: {exc}")

    return {
        "doc_id": doc.doc_id,
        "filename": doc.filename,
        "file_size": doc.file_size,
        "index_status": "completed" if index_result["indexed_chunks"] > 0 else "failed",
        **index_result,
    }


@router.get("/{kb_id}/documents")
def api_list_documents(kb_id: str, db: Session = Depends(get_db)):
    """获取指定知识库的文档列表"""
    kb = get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    items = list_documents(db, kb_id)
    return {"items": items}


@router.delete("/documents/{doc_id}")
def api_delete_document(doc_id: str, db: Session = Depends(get_db)):
    """删除文档"""
    doc = delete_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    return {"message": "文档删除成功", "doc_id": doc_id}


# ── 召回测试 / RAG 检索 ─────────────────────────────────

@router.post("/{kb_id}/recall")
def api_recall(kb_id: str, payload: RecallRequest, db: Session = Depends(get_db)):
    """在指定知识库内执行 RAG 检索"""
    kb = get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    try:
        result = recall_search(
            db=db,
            kb_id=kb_id,
            query=payload.query,
            retrieval_mode=payload.retrieval_mode,
            top_k=payload.top_k,
            candidate_k=payload.candidate_k,
            dense_weight=payload.dense_weight,
            sparse_weight=payload.sparse_weight,
            min_score=payload.min_score,
            enable_rerank=payload.enable_rerank,
            max_chars=payload.max_chars,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"检索失败: {exc}")

    return {
        "kb_id": kb_id,
        "query": payload.query,
        **result,
    }
