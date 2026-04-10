from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class WorkflowNodeData(BaseModel):
    label: str
    extra: Optional[Dict[str, Any]] = None


class WorkflowNode(BaseModel):
    id: str
    type: str
    data: WorkflowNodeData
    position: Dict[str, float]


class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str
    source_handle: Optional[str] = None
    target_handle: Optional[str] = None


class WorkflowBase(BaseModel):
    workflow_name: str
    description: Optional[str] = None


class WorkflowCreate(WorkflowBase):
    graph_data: Optional[Dict[str, Any]] = None


class WorkflowUpdate(BaseModel):
    workflow_name: Optional[str] = None
    description: Optional[str] = None
    graph_data: Optional[Dict[str, Any]] = None
    status: Optional[str] = None


class WorkflowResponse(WorkflowBase):
    workflow_id: str
    creator_id: str
    graph_data: Dict[str, Any]
    status: str
    create_time: datetime
    update_time: datetime

    class Config:
        from_attributes = True


class WorkflowRunBase(BaseModel):
    workflow_id: str
    input_data: Optional[Dict[str, Any]] = None


class WorkflowRunCreate(WorkflowRunBase):
    operator_id: str


class WorkflowRunResponse(BaseModel):
    run_id: str
    workflow_id: str
    operator_id: str
    status: str
    input_data: Optional[Dict[str, Any]] = None
    context_data: Optional[Dict[str, Any]] = None
    final_result: Optional[Dict[str, Any]] = None
    error_msg: Optional[str] = None
    run_start_time: datetime
    run_end_time: Optional[datetime] = None
    duration: Optional[str] = None

    class Config:
        from_attributes = True
