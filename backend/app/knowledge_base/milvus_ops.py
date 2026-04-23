"""
Milvus 向量数据库操作层
"""
from ..core.config import settings


def get_milvus_client():
    """获取 Milvus 客户端连接。"""
    from pymilvus import MilvusClient
    uri = f"http://{settings.MILVUS_HOST}:{settings.MILVUS_PORT}"
    return MilvusClient(uri=uri, db_name="default")


def ensure_collection() -> None:
    """确保 hybrid 集合存在，不存在则创建。"""
    from pymilvus import connections, utility, FieldSchema, CollectionSchema, DataType, Collection

    connections.connect(alias="default", host=settings.MILVUS_HOST, port=settings.MILVUS_PORT)
    if utility.has_collection(settings.MILVUS_COLLECTION):
        return

    fields = [
        FieldSchema(name="pk", dtype=DataType.VARCHAR, is_primary=True, max_length=64),
        FieldSchema(name="kb_id", dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=255),
        FieldSchema(name="chunk_index", dtype=DataType.INT64),
        FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=65535),
        FieldSchema(name="dense", dtype=DataType.FLOAT_VECTOR, dim=settings.BGE_DENSE_DIM),
        FieldSchema(name="sparse", dtype=DataType.SPARSE_FLOAT_VECTOR),
    ]
    schema = CollectionSchema(fields=fields, description="Workflow KB hybrid collection")
    coll = Collection(name=settings.MILVUS_COLLECTION, schema=schema)

    coll.create_index(
        field_name="dense",
        index_params={
            "metric_type": "COSINE",
            "index_type": "HNSW",
            "params": {"M": 16, "efConstruction": 200},
        },
    )
    coll.create_index(
        field_name="sparse",
        index_params={
            "metric_type": "IP",
            "index_type": "SPARSE_INVERTED_INDEX",
            "params": {"drop_ratio_build": 0.2},
        },
    )


def upsert_vectors(rows: list[dict]) -> None:
    """批量写入向量到 Milvus。"""
    if not rows:
        return

    ensure_collection()
    client = get_milvus_client()

    batch_size = 32
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        client.upsert(collection_name=settings.MILVUS_COLLECTION, data=batch)

    client.flush(collection_name=settings.MILVUS_COLLECTION)


def delete_vectors_for_kb(kb_id: str) -> None:
    """删除某个知识库的所有向量。"""
    try:
        from pymilvus import connections, Collection
        connections.connect(alias="default", host=settings.MILVUS_HOST, port=settings.MILVUS_PORT)
        ensure_collection()
        coll = Collection(settings.MILVUS_COLLECTION)
        coll.load()
        coll.delete(expr=f'kb_id == "{kb_id}"')
    except Exception as exc:
        print(f"[WARNING] 删除向量失败: {exc}")


def delete_vectors_for_doc(kb_id: str, filename: str) -> None:
    """删除某个知识库下指定文件的所有向量。"""
    try:
        from pymilvus import connections, Collection
        connections.connect(alias="default", host=settings.MILVUS_HOST, port=settings.MILVUS_PORT)
        ensure_collection()
        coll = Collection(settings.MILVUS_COLLECTION)
        coll.load()
        safe_filename = (filename or "").replace('"', '\\"')
        coll.delete(expr=f'kb_id == "{kb_id}" and source == "{safe_filename}"')
    except Exception as exc:
        print(f"[WARNING] 删除向量失败: {exc}")


def search_vectors(
    kb_id: str,
    dense_vec: list[float],
    sparse_vec: dict[int, float],
    retrieval_mode: str = "hybrid",
    top_k: int = 20,
) -> list[dict]:
    """
    在指定知识库内进行向量检索。
    返回: [{"pk": str, "source": str, "chunk_index": int, "text": str,
            "dense_score": float, "sparse_score": float}, ...]
    """
    from pymilvus import connections, Collection

    connections.connect(alias="default", host=settings.MILVUS_HOST, port=settings.MILVUS_PORT)
    ensure_collection()
    coll = Collection(settings.MILVUS_COLLECTION)
    coll.load()

    expr = f'kb_id == "{kb_id}"'
    output_fields = ["pk", "source", "chunk_index", "text"]

    dense_hits = []
    sparse_hits = []

    if retrieval_mode in {"dense_only", "hybrid"}:
        dense_hits = coll.search(
            data=[dense_vec],
            anns_field="dense",
            limit=top_k,
            expr=expr,
            output_fields=output_fields,
            param={"metric_type": "COSINE", "params": {"ef": 256}},
        )[0]

    if retrieval_mode in {"sparse_only", "hybrid"}:
        sparse_hits = coll.search(
            data=[sparse_vec],
            anns_field="sparse",
            limit=top_k,
            expr=expr,
            output_fields=output_fields,
            param={"metric_type": "IP", "params": {}},
        )[0]

    merged: dict[str, dict] = {}
    for h in dense_hits:
        pk = str(h.id)
        merged[pk] = {
            "pk": pk,
            "source": h.entity.get("source"),
            "chunk_index": h.entity.get("chunk_index"),
            "text": h.entity.get("text"),
            "dense_score": float(h.distance),
            "sparse_score": 0.0,
        }
    for h in sparse_hits:
        pk = str(h.id)
        if pk in merged:
            merged[pk]["sparse_score"] = float(h.distance)
        else:
            merged[pk] = {
                "pk": pk,
                "source": h.entity.get("source"),
                "chunk_index": h.entity.get("chunk_index"),
                "text": h.entity.get("text"),
                "dense_score": 0.0,
                "sparse_score": float(h.distance),
            }

    return list(merged.values())
