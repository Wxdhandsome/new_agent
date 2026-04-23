try:
    from .workflow_engine import (
        WorkflowState,
        NodeExecutor,
        build_langgraph_graph,
        execute_workflow,
    )
    __all__ = [
        "WorkflowState",
        "NodeExecutor",
        "build_langgraph_graph",
        "execute_workflow",
    ]
except Exception as e:
    import warnings
    warnings.warn(f"LangGraph module import failed: {e}")
    
    def mock_execute_workflow(graph_data, input_data=None):
        return {
            "status": "success",
            "result": {
                "message": "Mock execution - LangGraph not available"
            }
        }
    
    execute_workflow = mock_execute_workflow
    __all__ = ["execute_workflow"]
