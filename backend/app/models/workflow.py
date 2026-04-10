from sqlalchemy import Column, String, Text, DateTime, JSON
from sqlalchemy.sql import func
from ..core.database import Base


class Workflow(Base):
    __tablename__ = "workflow"

    workflow_id = Column(String(64), primary_key=True, index=True)
    workflow_name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    creator_id = Column(String(64), nullable=False)
    graph_data = Column(JSON, nullable=False)
    status = Column(String(32), nullable=False, default="draft")
    create_time = Column(DateTime(timezone=True), server_default=func.now())
    update_time = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WorkflowRun(Base):
    __tablename__ = "workflow_run"

    run_id = Column(String(64), primary_key=True, index=True)
    workflow_id = Column(String(64), nullable=False, index=True)
    operator_id = Column(String(64), nullable=False)
    status = Column(String(32), nullable=False, default="running")
    input_data = Column(JSON, nullable=True)
    context_data = Column(JSON, nullable=True)
    final_result = Column(JSON, nullable=True)
    error_msg = Column(Text, nullable=True)
    run_start_time = Column(DateTime(timezone=True), server_default=func.now())
    run_end_time = Column(DateTime(timezone=True), nullable=True)
    duration = Column(String(64), nullable=True)
