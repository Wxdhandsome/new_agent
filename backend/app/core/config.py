from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    # 基础配置
    DATABASE_URL: str = "sqlite:///./workflow.db"
    SECRET_KEY: str = "your-secret-key-here-change-in-production"
    
    # LLM API 配置
    API_KEY: Optional[str] = None
    BASE_URL: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    
    # 后端服务配置
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8001

    # RAG / Knowledge Base Config
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    
    # BGE Embedding 服务配置
    BGE_URL: str = "http://1.194.201.134:50183"
    BGE_DENSE_DIM: int = 1024
    
    # Milvus 向量数据库配置
    MILVUS_HOST: str = "192.168.99.151"
    MILVUS_PORT: str = "19530"
    MILVUS_COLLECTION: str = "workflow_kb_hybrid"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
