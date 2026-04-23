from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router as api_router
from .core.database import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AI Workflow Builder API",
    description="基于 React+LangGraph 的 AI 工作流搭建系统",
    version="1.1.0"
)

# 启动时初始化 Milvus
@app.on_event("startup")
def on_startup():
    try:
        from .knowledge_base import milvus_ops
        milvus_ops.ensure_collection()
        print("[startup] Milvus 集合已就绪")
    except Exception as exc:
        print(f"[WARNING] Milvus 集合初始化失败: {exc}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/")
def root():
    return {"message": "AI Workflow Builder API", "version": "1.0.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
