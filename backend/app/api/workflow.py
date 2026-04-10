from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
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

router = APIRouter(prefix="/workflow", tags=["workflow"])


def mock_execute_workflow(graph_data: dict, input_data: dict = None) -> dict:
    return {
        "status": "success",
        "result": {
            "message": "Workflow executed successfully (mock)",
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


# Chat API for LLM
from pydantic import BaseModel
from typing import List, Optional, AsyncGenerator
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
