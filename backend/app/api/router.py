from fastapi import APIRouter
from .workflow import router as workflow_router
from .knowledge_base import router as kb_router

router = APIRouter()

router.include_router(workflow_router)
router.include_router(kb_router)


@router.get("/")
def api_root():
    return {"message": "API v1"}
