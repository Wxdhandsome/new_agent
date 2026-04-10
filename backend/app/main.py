from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.database import engine, Base
from .models import Workflow, WorkflowRun
from .api import router as api_router

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AI Workflow Builder API",
    description="基于 React+LangGraph 的 AI 工作流搭建系统",
    version="1.0.0"
)

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
