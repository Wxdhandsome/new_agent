from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
from datetime import datetime
from ..models import Workflow, WorkflowRun, WorkflowCreate, WorkflowUpdate


def generate_id() -> str:
    return str(uuid.uuid4())


def get_workflow(db: Session, workflow_id: str) -> Optional[Workflow]:
    return db.query(Workflow).filter(Workflow.workflow_id == workflow_id).first()


def list_workflows(db: Session, skip: int = 0, limit: int = 100) -> List[Workflow]:
    return db.query(Workflow).offset(skip).limit(limit).all()


def create_workflow(db: Session, workflow_create: WorkflowCreate, creator_id: str = "user_001") -> Workflow:
    workflow_id = generate_id()
    db_workflow = Workflow(
        workflow_id=workflow_id,
        workflow_name=workflow_create.workflow_name,
        description=workflow_create.description,
        creator_id=creator_id,
        graph_data=workflow_create.graph_data or {"nodes": [], "edges": []},
        status="draft",
    )
    db.add(db_workflow)
    db.commit()
    db.refresh(db_workflow)
    return db_workflow


def update_workflow(
    db: Session, workflow_id: str, workflow_update: WorkflowUpdate
) -> Optional[Workflow]:
    db_workflow = get_workflow(db, workflow_id)
    if not db_workflow:
        return None
    
    update_data = workflow_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_workflow, field, value)
    
    db.commit()
    db.refresh(db_workflow)
    return db_workflow


def delete_workflow(db: Session, workflow_id: str) -> bool:
    db_workflow = get_workflow(db, workflow_id)
    if not db_workflow:
        return False
    db.delete(db_workflow)
    db.commit()
    return True


def create_workflow_run(
    db: Session, workflow_id: str, operator_id: str, input_data: Optional[dict] = None
) -> WorkflowRun:
    run_id = generate_id()
    db_run = WorkflowRun(
        run_id=run_id,
        workflow_id=workflow_id,
        operator_id=operator_id,
        status="running",
        input_data=input_data,
    )
    db.add(db_run)
    db.commit()
    db.refresh(db_run)
    return db_run


def get_workflow_run(db: Session, run_id: str) -> Optional[WorkflowRun]:
    return db.query(WorkflowRun).filter(WorkflowRun.run_id == run_id).first()


def update_workflow_run_status(
    db: Session,
    run_id: str,
    status: str,
    context_data: Optional[dict] = None,
    final_result: Optional[dict] = None,
    error_msg: Optional[str] = None,
) -> Optional[WorkflowRun]:
    db_run = get_workflow_run(db, run_id)
    if not db_run:
        return None
    
    db_run.status = status
    if context_data:
        db_run.context_data = context_data
    if final_result:
        db_run.final_result = final_result
    if error_msg:
        db_run.error_msg = error_msg
    
    if status in ["success", "failed"]:
        db_run.run_end_time = datetime.now()
        if db_run.run_start_time:
            duration = (db_run.run_end_time - db_run.run_start_time).total_seconds() * 1000
            db_run.duration = f"{int(duration)}ms"
    
    db.commit()
    db.refresh(db_run)
    return db_run
