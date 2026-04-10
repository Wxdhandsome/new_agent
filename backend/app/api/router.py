from fastapi import APIRouter
from .workflow import router as workflow_router

router = APIRouter()

router.include_router(workflow_router)


@router.get("/")
def api_root():
    return {"message": "API v1"}
