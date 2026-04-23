"""
知识库业务逻辑层
"""
import os
from sqlalchemy.orm import Session
from typing import List, Optional

from .models import KnowledgeBase, Document, DocumentChunk
from .text_parser import parse_and_split
from . import embedding, milvus_ops
from ..core.config import settings


# ── 知识库 CRUD ──────────────────────────────────────────

def create_kb(db: Session, name: str, description: str = "", chunk_size: int = 800, chunk_overlap: int = 100) -> Optional[KnowledgeBase]:
    """创建知识库。"""
    kb = KnowledgeBase(
        name=name,
        description=description,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )
    db.add(kb)
    try:
        db.commit()
        db.refresh(kb)
        return kb
    except Exception:
        db.rollback()
        return None


def get_kb(db: Session, kb_id: str) -> Optional[KnowledgeBase]:
    """根据 ID 获取知识库。"""
    return db.query(KnowledgeBase).filter(KnowledgeBase.kb_id == kb_id).first()


def list_kbs(db: Session) -> List[KnowledgeBase]:
    """获取所有知识库列表。"""
    return db.query(KnowledgeBase).order_by(KnowledgeBase.updated_at.desc()).all()


def update_kb(db: Session, kb_id: str, name: Optional[str] = None, description: Optional[str] = None,
              chunk_size: Optional[int] = None, chunk_overlap: Optional[int] = None) -> Optional[KnowledgeBase]:
    """更新知识库信息。"""
    kb = get_kb(db, kb_id)
    if not kb:
        return None
    if name is not None:
        # 检查名称是否与其他知识库冲突
        existing = db.query(KnowledgeBase).filter(KnowledgeBase.name == name, KnowledgeBase.kb_id != kb_id).first()
        if existing:
            return None
        kb.name = name
    if description is not None:
        kb.description = description
    if chunk_size is not None:
        kb.chunk_size = chunk_size
    if chunk_overlap is not None:
        kb.chunk_overlap = chunk_overlap
    try:
        db.commit()
        db.refresh(kb)
        return kb
    except Exception:
        db.rollback()
        return None


def delete_kb(db: Session, kb_id: str) -> bool:
    """删除知识库（级联删除文档和分块）。"""
    kb = get_kb(db, kb_id)
    if not kb:
        return False

    # 级联删除 chunks → documents → knowledge_base
    db.query(DocumentChunk).filter(DocumentChunk.kb_id == kb_id).delete()
    db.query(Document).filter(Document.kb_id == kb_id).delete()
    db.delete(kb)
    db.commit()

    # 同步删除 Milvus 向量
    try:
        milvus_ops.delete_vectors_for_kb(kb_id)
    except Exception as exc:
        print(f"[WARNING] 删除 Milvus 向量失败: {exc}")

    return True


# ── 文档 CRUD ──────────────────────────────────────────

def create_document(db: Session, kb_id: str, filename: str, path: str, file_size: int = 0) -> Optional[Document]:
    """创建文档记录。"""
    doc = Document(
        kb_id=kb_id,
        filename=filename,
        path=path,
        file_size=file_size,
    )
    db.add(doc)
    try:
        db.commit()
        db.refresh(doc)
        return doc
    except Exception:
        db.rollback()
        return None


def get_document(db: Session, doc_id: str) -> Optional[Document]:
    """根据 ID 获取文档。"""
    return db.query(Document).filter(Document.doc_id == doc_id).first()


def list_documents(db: Session, kb_id: str) -> List[Document]:
    """获取某个知识库下的所有文档。"""
    return db.query(Document).filter(Document.kb_id == kb_id).order_by(Document.created_at.desc()).all()


def delete_document(db: Session, doc_id: str) -> Optional[Document]:
    """删除文档（同时删除 Milvus 向量和 chunk 记录）。"""
    doc = get_document(db, doc_id)
    if not doc:
        return None

    # 删除物理文件
    if doc.path and os.path.exists(doc.path):
        os.remove(doc.path)

    # 删除 Milvus 向量
    try:
        milvus_ops.delete_vectors_for_doc(doc.kb_id, doc.filename)
    except Exception as exc:
        print(f"[WARNING] 删除 Milvus 向量失败: {exc}")

    # 删除 SQLite chunk 记录
    db.query(DocumentChunk).filter(DocumentChunk.doc_id == doc_id).delete()
    db.delete(doc)
    db.commit()

    # 更新统计
    _update_kb_counts(db, doc.kb_id)

    return doc


# ── 索引构建 ──────────────────────────────────────────

def build_document_index(db: Session, doc_id: str) -> dict:
    """
    索引构建核心逻辑：解析文档 → 分块 → 生成向量 → 写入 Milvus。
    返回 {"total_chunks": int, "indexed_chunks": int}
    """
    doc = get_document(db, doc_id)
    if not doc:
        raise ValueError("文档不存在")

    kb = get_kb(db, doc.kb_id)
    if not kb:
        raise ValueError("知识库不存在")

    if not os.path.exists(doc.path):
        raise ValueError("文档文件不存在")

    # 1. 解析文档并分块
    chunks = parse_and_split(doc.path, chunk_size=kb.chunk_size, chunk_overlap=kb.chunk_overlap)
    total = len(chunks)
    if total == 0:
        return {"total_chunks": 0, "indexed_chunks": 0}

    # 2. 保存 chunk 到 SQLite
    db.query(DocumentChunk).filter(DocumentChunk.doc_id == doc_id).delete()
    for chunk in chunks:
        chunk_record = DocumentChunk(
            chunk_id=f"{doc_id}_{chunk['chunk_index']}",
            doc_id=doc_id,
            kb_id=doc.kb_id,
            chunk_index=chunk["chunk_index"],
            content=chunk["content"],
        )
        db.add(chunk_record)
    db.commit()

    # 3. 生成向量并写入 Milvus
    rows = []
    for chunk in chunks:
        try:
            emb = embedding.bge_model.embed(chunk["content"])
            dense_vec = embedding.get_dense_vector(emb)
            sparse_vec = embedding.get_sparse_vector(emb)

            rows.append({
                "pk": f"{doc_id}_{chunk['chunk_index']}",
                "kb_id": doc.kb_id,
                "source": doc.filename,
                "chunk_index": chunk["chunk_index"],
                "text": chunk["content"],
                "dense": dense_vec,
                "sparse": sparse_vec,
            })
        except Exception as exc:
            print(f"[WARNING] chunk #{chunk['chunk_index']} 向量生成失败: {exc}")

    indexed = 0
    if rows:
        milvus_ops.upsert_vectors(rows)
        indexed = len(rows)

    # 4. 更新统计
    doc.chunk_count = total
    db.commit()
    _update_kb_counts(db, doc.kb_id)

    return {"total_chunks": total, "indexed_chunks": indexed}


def _update_kb_counts(db: Session, kb_id: str):
    """更新知识库的文档数和 chunk 数。"""
    kb = get_kb(db, kb_id)
    if not kb:
        return
    doc_count = db.query(Document).filter(Document.kb_id == kb_id).count()
    chunk_count = db.query(DocumentChunk).filter(DocumentChunk.kb_id == kb_id).count()
    kb.doc_count = doc_count
    kb.chunk_count = chunk_count
    db.commit()


# ── RAG 检索 ──────────────────────────────────────────

def recall_search(
    db: Session,
    kb_id: str,
    query: str,
    retrieval_mode: str = "hybrid",
    top_k: int = 6,
    candidate_k: int = 20,
    dense_weight: float = 0.5,
    sparse_weight: float = 0.5,
    min_score: float = 0.6,
    enable_rerank: bool = False,
    max_chars: int = 15000,
) -> dict:
    """
    执行 RAG 检索：检索 → 融合 → 可选 Rerank → 截断。
    返回结构化检索结果。
    """
    kb = get_kb(db, kb_id)
    if not kb:
        raise ValueError("知识库不存在")

    # 根据检索模式调整权重
    if retrieval_mode == "dense_only":
        dense_weight, sparse_weight = 1.0, 0.0
    elif retrieval_mode == "sparse_only":
        dense_weight, sparse_weight = 0.0, 1.0

    # 1. 将查询文本向量化
    emb = embedding.bge_model.embed(query)
    dense_vec = embedding.get_dense_vector(emb)
    sparse_vec = embedding.get_sparse_vector(emb)

    # 2. Milvus 检索
    hits = milvus_ops.search_vectors(
        kb_id=kb_id,
        dense_vec=dense_vec,
        sparse_vec=sparse_vec,
        retrieval_mode=retrieval_mode,
        top_k=candidate_k,
    )

    # 3. 分数归一化 + 加权融合
    # 稀疏向量 IP 分数范围可能很大，需要归一化到 [0, 1] 范围
    max_sparse_score = max([h["sparse_score"] for h in hits if h["sparse_score"] > 0], default=1.0)
    
    nodes = []
    for hit in hits:
        d_norm = hit["dense_score"]  # COSINE 距离直接作为相似度，范围 [0, 1]
        s_norm = hit["sparse_score"] / max_sparse_score if max_sparse_score > 0 else 0.0  # 归一化到 [0, 1]

        if retrieval_mode == "dense_only":
            fused = d_norm
        elif retrieval_mode == "sparse_only":
            fused = s_norm
        else:
            fused = dense_weight * d_norm + sparse_weight * s_norm

        nodes.append({
            "pk": hit["pk"],
            "source": hit["source"],
            "chunk_index": hit["chunk_index"],
            "content": hit["text"],
            "dense_score": d_norm,
            "sparse_score": s_norm,
            "fused_score": fused,
        })

    # 4. Rerank 精排
    rerank_applied = False
    if enable_rerank and nodes:
        try:
            contents = [n["content"] for n in nodes]
            rerank_results = embedding.bge_model.rerank(query, contents, top_k=len(nodes))
            if rerank_results:
                for item in rerank_results:
                    idx = item.get("index")
                    if idx is not None and 0 <= idx < len(nodes):
                        nodes[idx]["rerank_score"] = item.get("relevance_score", 0.0)
                        nodes[idx]["fused_score"] = item.get("relevance_score", nodes[idx]["fused_score"])
                rerank_applied = True
        except Exception as exc:
            print(f"[WARNING] Rerank 失败，使用原始分数排序: {exc}")

    # 5. 按 fused_score 降序排列，截取 top_k，过滤 min_score
    nodes.sort(key=lambda x: x["fused_score"], reverse=True)

    items = []
    total_chars = 0
    for idx, node in enumerate(nodes[:top_k], start=1):
        score = node["fused_score"]
        if score < min_score:
            continue

        content = node["content"]
        # 检查字符数限制
        if total_chars + len(content) > max_chars and items:
            break
        total_chars += len(content)

        items.append({
            "rank": idx,
            "source": node["source"],
            "chunk_index": node["chunk_index"],
            "content": content,
            "dense_score": round(node["dense_score"], 6),
            "sparse_score": round(node["sparse_score"], 6),
            "fused_score": round(score, 4),
            "rerank_score": round(node.get("rerank_score", 0), 4) if rerank_applied else None,
        })

    return {
        "items": items,
        "total": len(items),
        "avg_similarity": round(sum(x["fused_score"] for x in items) / len(items), 4) if items else 0.0,
        "total_chars": total_chars,
    }
