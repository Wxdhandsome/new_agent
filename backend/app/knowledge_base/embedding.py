"""
BGE Embedding 服务封装
提供 dense + sparse 向量生成和 rerank 精排
"""
import base64
import pickle
import requests
from ..core.config import settings


class BgeModel:
    """BGE Embedding 服务客户端"""

    def __init__(self, url: str):
        self.url = url.rstrip("/")

    def embed(self, text: str) -> dict:
        """
        调用 BGE 服务生成向量。
        返回: {"dense": list[float], "sparse": dict[int, float]}
        """
        url = f"{self.url}/api/emb/embedding"
        response = requests.post(url, json={"content": text}, timeout=30).json()
        data = response["data"]
        data["dense"] = pickle.loads(base64.b64decode(data["dense"].encode("utf-8")))
        data["sparse"] = pickle.loads(base64.b64decode(data["sparse"].encode("utf-8")))
        return data

    def rerank(self, query: str, contents: list[str], top_k: int = 20) -> list[dict]:
        """
        调用 BGE 服务对检索结果进行精排。
        返回: [{"index": int, "relevance_score": float, "text": str}, ...]
        """
        url = f"{self.url}/api/emb/rerank"
        response = requests.post(
            url, json={"query": query, "contents": contents, "top_k": top_k}, timeout=30
        )
        return response.json().get("data", [])


# 全局实例
bge_model = BgeModel(settings.BGE_URL)


def get_dense_vector(embedding: dict) -> list[float]:
    """从 embed 结果中提取 dense 向量。"""
    dense = embedding.get("dense")
    if dense is None:
        raise ValueError("dense 向量为空")
    return dense[0]


def get_sparse_vector(embedding: dict) -> dict[int, float]:
    """从 embed 结果中提取 sparse 向量。"""
    sparse = embedding.get("sparse")
    if sparse is None:
        raise ValueError("sparse 向量为空")
    return sparse
