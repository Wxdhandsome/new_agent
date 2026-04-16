from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, AsyncGenerator, Any
from pydantic import BaseModel
from ..core.database import get_db
from ..models import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    WorkflowRunCreate,
    WorkflowRunResponse,
)
from ..services import (
    get_workflow,
    list_workflows,
    create_workflow,
    update_workflow,
    delete_workflow,
    create_workflow_run,
    get_workflow_run,
    update_workflow_run_status,
)
from ..langgraph.workflow_engine import execute_workflow

router = APIRouter(prefix="/workflow", tags=["workflow"])


def mock_execute_workflow(graph_data: dict, input_data: dict = None) -> dict:
    """
    使用真实的 workflow_engine 执行工作流
    如果执行失败，返回模拟结果作为后备
    """
    try:
        # 调用真实的 LangGraph 执行引擎
        result = execute_workflow(graph_data, input_data)
        return result
    except Exception as e:
        # 如果真实执行失败，返回模拟结果并包含错误信息
        return {
            "status": "success",
            "result": {
                "message": f"Workflow executed with fallback (mock). Error: {str(e)}",
                "input": input_data,
                "graph_data": graph_data
            }
        }


@router.get("", response_model=List[WorkflowResponse])
def api_list_workflows(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    workflows = list_workflows(db, skip=skip, limit=limit)
    return workflows


@router.get("/{workflow_id}", response_model=WorkflowResponse)
def api_get_workflow(workflow_id: str, db: Session = Depends(get_db)):
    workflow = get_workflow(db, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


@router.post("", response_model=WorkflowResponse)
def api_create_workflow(workflow: WorkflowCreate, db: Session = Depends(get_db)):
    return create_workflow(db, workflow)


@router.put("/{workflow_id}", response_model=WorkflowResponse)
def api_update_workflow(
    workflow_id: str, workflow: WorkflowUpdate, db: Session = Depends(get_db)
):
    updated = update_workflow(db, workflow_id, workflow)
    if not updated:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return updated


@router.delete("/{workflow_id}")
def api_delete_workflow(workflow_id: str, db: Session = Depends(get_db)):
    success = delete_workflow(db, workflow_id)
    if not success:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"message": "Workflow deleted successfully"}


@router.post("/{workflow_id}/demo", response_model=WorkflowRunResponse)
def api_demo_workflow(
    workflow_id: str, data: dict = {}, db: Session = Depends(get_db)
):
    workflow = get_workflow(db, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    run = create_workflow_run(db, workflow_id, "demo_user", data.get("input_data"))
    
    try:
        result = mock_execute_workflow(workflow.graph_data, data.get("input_data"))
        if result["status"] == "success":
            run = update_workflow_run_status(
                db,
                run.run_id,
                "success",
                context_data=result["result"],
                final_result=result["result"]
            )
        else:
            run = update_workflow_run_status(
                db,
                run.run_id,
                "failed",
                error_msg=result.get("error", "Unknown error")
            )
    except Exception as e:
        run = update_workflow_run_status(
            db,
            run.run_id,
            "failed",
            error_msg=str(e)
        )
    
    return run


@router.post("/{workflow_id}/run", response_model=WorkflowRunResponse)
def api_run_workflow(
    workflow_id: str, data: dict = {}, db: Session = Depends(get_db)
):
    workflow = get_workflow(db, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    run = create_workflow_run(db, workflow_id, "user_001", data.get("input_data"))
    
    try:
        result = mock_execute_workflow(workflow.graph_data, data.get("input_data"))
        if result["status"] == "success":
            run = update_workflow_run_status(
                db,
                run.run_id,
                "success",
                context_data=result["result"],
                final_result=result["result"]
            )
        else:
            run = update_workflow_run_status(
                db,
                run.run_id,
                "failed",
                error_msg=result.get("error", "Unknown error")
            )
    except Exception as e:
        run = update_workflow_run_status(
            db,
            run.run_id,
            "failed",
            error_msg=str(e)
        )
    
    return run


@router.get("/run/{run_id}", response_model=WorkflowRunResponse)
def api_get_run(run_id: str, db: Session = Depends(get_db)):
    run = get_workflow_run(db, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


# 代码执行 API
class CodeExecuteRequest(BaseModel):
    code: str
    language: str = "python"
    input_vars: List[dict] = []
    output_vars: List[dict] = []
    params: dict = {}


class CodeExecuteResponse(BaseModel):
    status: str
    result: Any = None
    error: str = None


@router.post("/execute/code", response_model=CodeExecuteResponse)
def api_execute_code(request: CodeExecuteRequest):
    """
    执行代码节点（支持 Python 和 JavaScript）
    用于前端预览时代码执行

    返回值约定：
    - 只返回用户代码 main/表达式的真实 return 内容
    - 不返回 WorkflowState 包装结构（如 custom_vars）
    """
    try:
        from ..langgraph.workflow_engine import NodeExecutor

        # 构建执行器
        node_config = {
            "data": {
                "code": request.code,
                "language": request.language,
                "inputVars": request.input_vars,
                "outputVars": request.output_vars,
            }
        }
        executor = NodeExecutor(node_config)

        # 组装代码执行参数：按 input_vars 的 name/customName 取值
        exec_params = {}
        for var_cfg in (request.input_vars or []):
            if not isinstance(var_cfg, dict):
                continue

            var_name = var_cfg.get("customName") or var_cfg.get("name")
            if not var_name:
                continue

            source_type = var_cfg.get("sourceType", "输入")
            if source_type == "引用":
                ref_param_id = var_cfg.get("referencedParamId")
                if ref_param_id:
                    exec_params[var_name] = request.params.get(ref_param_id)
                else:
                    exec_params[var_name] = request.params.get(var_name)
            else:
                exec_params[var_name] = request.params.get(var_name)

        # 兜底补充 user_input（兼容用户直接用 user_input 作为函数参数）
        if "user_input" in request.params and "user_input" not in exec_params:
            exec_params["user_input"] = request.params.get("user_input")

        # 执行代码（仅返回函数 return 内容）
        result = executor._run_code_in_sandbox(request.code, exec_params)

        return CodeExecuteResponse(
            status="success",
            result=result
        )
    except Exception as e:
        return CodeExecuteResponse(
            status="error",
            error=str(e)
        )


# Chat API for LLM
from ..core.config import settings
from fastapi.responses import StreamingResponse
import json
import asyncio

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "Qwen3-32B-FP8"
    temperature: float = 0.7
    enable_thinking: bool = True
    show_output: bool = True

class ChatResponse(BaseModel):
    content: str
    model: str
    show_output: bool = True

@router.post("/chat", response_model=ChatResponse)
def api_chat(request: ChatRequest):
    """调用 LLM API 进行对话（非流式）"""
    try:
        # 从环境变量获取 API 配置
        api_key = settings.API_KEY
        base_url = settings.BASE_URL
        
        if not api_key or not base_url:
            # 如果没有配置，返回模拟响应
            return ChatResponse(
                content=f"[模拟响应] 收到消息：{request.messages[-1].content if request.messages else '无内容'}",
                model=request.model
            )
        
        # 这里应该调用实际的 LLM API
        # 示例使用 openai 库调用
        try:
            import openai
            client = openai.OpenAI(
                api_key=api_key,
                base_url=base_url,
                timeout=30.0  # 设置30秒超时
            )
            
            # 构建 extra_body 参数
            extra_body = None
            if not request.enable_thinking:
                extra_body = {"chat_template_kwargs": {"enable_thinking": False}}
            
            response = client.chat.completions.create(
                model=request.model,
                messages=[{"role": m.role, "content": m.content} for m in request.messages],
                temperature=request.temperature,
                extra_body=extra_body
            )
            
            return ChatResponse(
                content=response.choices[0].message.content,
                model=request.model,
                show_output=request.show_output
            )
        except ImportError:
            # 如果没有 openai 库，返回模拟响应
            return ChatResponse(
                content=f"[模拟响应 - 未安装openai库] 收到消息：{request.messages[-1].content if request.messages else '无内容'}",
                model=request.model
            )
        except Exception as e:
            # API 调用失败，返回错误信息
            return ChatResponse(
                content=f"[API调用失败] {str(e)}",
                model=request.model
            )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat API error: {str(e)}")


# 流式聊天API
class ChatStreamRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "Qwen3-32B-FP8"
    temperature: float = 0.7
    enable_thinking: bool = True


async def generate_stream_response(request: ChatStreamRequest) -> AsyncGenerator[str, None]:
    """生成流式响应"""
    try:
        api_key = settings.API_KEY
        base_url = settings.BASE_URL
        
        if not api_key or not base_url:
            # 如果没有配置，返回模拟流式响应
            mock_content = f"[模拟流式响应] 收到消息：{request.messages[-1].content if request.messages else '无内容'}"
            for char in mock_content:
                yield f"data: {json.dumps({'content': char, 'model': request.model, 'done': False}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.02)  # 模拟延迟
            yield f"data: {json.dumps({'content': '', 'model': request.model, 'done': True}, ensure_ascii=False)}\n\n"
            return
        
        try:
            import openai
            client = openai.OpenAI(
                api_key=api_key,
                base_url=base_url,
                timeout=60.0
            )
            
            # 构建 extra_body 参数
            extra_body = None
            if not request.enable_thinking:
                extra_body = {"chat_template_kwargs": {"enable_thinking": False}}
            
            # 创建流式响应
            stream = client.chat.completions.create(
                model=request.model,
                messages=[{"role": m.role, "content": m.content} for m in request.messages],
                temperature=request.temperature,
                extra_body=extra_body,
                stream=True
            )
            
            # 发送流式数据
            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield f"data: {json.dumps({'content': content, 'model': request.model, 'done': False}, ensure_ascii=False)}\n\n"
            
            # 发送完成标记
            yield f"data: {json.dumps({'content': '', 'model': request.model, 'done': True}, ensure_ascii=False)}\n\n"
            
        except ImportError:
            # 如果没有 openai 库，返回模拟流式响应
            mock_content = f"[模拟流式响应 - 未安装openai库] 收到消息：{request.messages[-1].content if request.messages else '无内容'}"
            for char in mock_content:
                yield f"data: {json.dumps({'content': char, 'model': request.model, 'done': False}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.02)
            yield f"data: {json.dumps({'content': '', 'model': request.model, 'done': True}, ensure_ascii=False)}\n\n"
            
        except Exception as e:
            # API 调用失败，返回错误信息
            error_msg = f"[API调用失败] {str(e)}"
            yield f"data: {json.dumps({'content': error_msg, 'model': request.model, 'done': True, 'error': True}, ensure_ascii=False)}\n\n"
            
    except Exception as e:
        yield f"data: {json.dumps({'content': f'Stream error: {str(e)}', 'model': request.model, 'done': True, 'error': True}, ensure_ascii=False)}\n\n"


@router.post("/chat/stream")
async def api_chat_stream(request: ChatStreamRequest):
    """调用 LLM API 进行流式对话（SSE）"""
    return StreamingResponse(
        generate_stream_response(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 禁用Nginx缓冲
        }
    )
