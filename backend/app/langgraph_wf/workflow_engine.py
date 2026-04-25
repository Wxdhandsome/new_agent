from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
import json


class WorkflowState(BaseModel):
    # 保留固定字段用于兼容性，但主要使用 custom_vars 存储动态变量
    user_input: str = Field(default="", description="用户输入内容（兼容旧版本）")
    user_intent: str = Field(default="", description="大模型识别的用户意图")
    llm_output: str = Field(default="", description="大模型输出内容（兼容旧版本）")
    # 主要存储区：所有动态变量（输入节点、大模型节点、代码节点、RAG节点输出）
    custom_vars: Dict[str, Any] = Field(default_factory=dict, description="自定义扩展变量（包含各节点输出）")
    retrieved_result: Optional[Dict[str, Any]] = Field(default=None, description="RAG 检索结果（兼容旧版本）")


class NodeExecutor:
    def __init__(self, node_config: Dict[str, Any]):
        self.config = node_config
        self.node_data = node_config.get("data", {})

    def input_node(self, state: WorkflowState) -> Dict[str, Any]:
        # 获取变量名，默认使用动态命名格式
        node_id = self.config.get("id", "")
        var_name = self.node_data.get("varName") or f"user_input_{node_id}"
        
        # 输入值从 custom_vars 中获取（由前端传入）
        input_value = state.custom_vars.get(var_name, "")

        # 将所有输入节点输出保存到 custom_vars
        return {
            "custom_vars": {
                **state.custom_vars,
                var_name: input_value,
            }
        }

    def llm_node(self, state: WorkflowState) -> Dict[str, Any]:
        import re
        
        prompt_template = self.node_data.get("promptTemplate") or self.node_data.get("prompt", "")

        # 构建上下文，优先使用 custom_vars 中的动态变量
        context = {
            **state.model_dump(),
            **state.custom_vars,
        }
        
        # 替换 {{variable}} 格式的变量
        def replace_var(match):
            var_name = match.group(1)
            if var_name in context:
                return str(context[var_name])
            return match.group(0)
        
        try:
            formatted_prompt = re.sub(r'\{\{([\w_]+)\}\}', replace_var, prompt_template)
        except Exception:
            formatted_prompt = prompt_template

        model_name = self.node_data.get("model", "Qwen3-32B-FP8")
        temperature = self.node_data.get("temperature", 0.7)
        llm_result = self._call_llm_api(model_name, formatted_prompt, temperature)
        
        # 获取输出变量名，默认使用动态命名格式
        node_id = self.config.get("id", "")
        output_var = self.node_data.get("outputVar") or f"llm_output_{node_id}"

        # 将所有大模型节点输出保存到 custom_vars
        return {
            "custom_vars": {
                **state.custom_vars,
                output_var: llm_result,
            }
        }

    def code_node(self, state: WorkflowState) -> Dict[str, Any]:
        code_content = self.node_data.get("code", "")
        input_vars = self.node_data.get("inputVars", [])
        output_vars = self.node_data.get("outputVars", [{"name": "result"}])
        
        # 构建输入参数
        exec_params = {}
        for var_config in input_vars:
            if isinstance(var_config, dict):
                # 使用 customName 或 name 作为参数名
                var_name = var_config.get("customName") or var_config.get("name", "")
                source_type = var_config.get("sourceType", "输入")
                
                if source_type == "引用":
                    # 从上下文引用变量（使用 referencedParamId 获取实际参数值）
                    ref_param_id = var_config.get("referencedParamId", var_name)
                    # 优先从 custom_vars 获取（支持动态变量名如 user_input_xxx）
                    if ref_param_id in state.custom_vars:
                        exec_params[var_name] = state.custom_vars[ref_param_id]
                    elif hasattr(state, ref_param_id):
                        exec_params[var_name] = getattr(state, ref_param_id)
                    else:
                        exec_params[var_name] = None
                else:
                    # 使用用户输入或上下文中的值
                    if var_name in state.custom_vars:
                        exec_params[var_name] = state.custom_vars[var_name]
                    elif hasattr(state, var_name):
                        exec_params[var_name] = getattr(state, var_name)
                    else:
                        exec_params[var_name] = None
            else:
                # 兼容旧格式（字符串列表）
                var_name = str(var_config)
                if var_name in state.custom_vars:
                    exec_params[var_name] = state.custom_vars[var_name]
                else:
                    exec_params[var_name] = getattr(state, var_name, None)
        
        # 执行代码
        code_result = self._run_code_in_sandbox(code_content, exec_params)
        
        # 构建返回结果：将代码执行结果映射到用户定义的输出变量
        mapped_outputs: Dict[str, Any] = {}
        if output_vars and len(output_vars) > 0:
            if len(output_vars) == 1:
                # 只有一个输出变量时，将整个结果赋值给它
                output_var_name = output_vars[0].get("name", "result")
                mapped_outputs[output_var_name] = code_result
            else:
                # 多个输出变量时，尝试从结果字典中提取对应字段
                for output_var in output_vars:
                    var_name = output_var.get("name", "")
                    if not var_name:
                        continue
                    if isinstance(code_result, dict) and var_name in code_result:
                        mapped_outputs[var_name] = code_result[var_name]
                    else:
                        mapped_outputs[var_name] = code_result
        else:
            mapped_outputs["result"] = code_result

        # 将输出写回状态：系统字段写到顶层，自定义字段写入 custom_vars
        next_custom_vars = dict(state.custom_vars)
        state_updates: Dict[str, Any] = {}

        for key, value in mapped_outputs.items():
            if key in {"user_input", "user_intent", "llm_output"}:
                state_updates[key] = value
            else:
                next_custom_vars[key] = value

        state_updates["custom_vars"] = next_custom_vars
        return state_updates

    def rag_node(self, state: WorkflowState) -> Dict[str, Any]:
        """RAG 知识库检索节点"""
        from ..knowledge_base.service import recall_search
        from ..core.database import SessionLocal

        kb_id = self.node_data.get("kbId")
        user_question_var = self.node_data.get("userQuestionVar", "user_input")
        output_var = self.node_data.get("outputVar", "retrieved_result")
        retrieval_mode = self.node_data.get("retrievalMode", "hybrid")
        top_k = self.node_data.get("topK", 6)
        candidate_k = self.node_data.get("candidateK", 20)
        dense_weight = self.node_data.get("denseWeight", 0.5)
        sparse_weight = self.node_data.get("sparseWeight", 0.5)
        min_score = self.node_data.get("minScore", 0.6)
        enable_rerank = self.node_data.get("enableRerank", False)
        max_chars = self.node_data.get("maxChars", 15000)
        show_output = self.node_data.get("showOutput", True)

        # 获取用户问题：优先从 custom_vars 获取，支持动态变量名
        if user_question_var == "user_input":
            query = state.user_input or state.custom_vars.get(user_question_var, "")
        else:
            query = state.custom_vars.get(user_question_var, "")

        if not kb_id:
            result_text = ""
            if show_output:
                result_text = "【知识库检索】未配置知识库"
            return {
                "custom_vars": {
                    **state.custom_vars,
                    output_var: result_text,
                },
                "node_output": result_text if show_output else None,
            }

        try:
            db = SessionLocal()
            result = recall_search(
                db=db,
                kb_id=kb_id,
                query=query,
                retrieval_mode=retrieval_mode,
                top_k=top_k,
                candidate_k=candidate_k,
                dense_weight=dense_weight,
                sparse_weight=sparse_weight,
                min_score=min_score,
                enable_rerank=enable_rerank,
                max_chars=max_chars,
            )
            db.close()

            # 提取纯文字内容，拼接所有检索结果的 content
            items = result.get("items", [])
            if items:
                # 只保留文字内容，每段之间用换行分隔
                text_parts = []
                for item in items:
                    content = item.get("content", "").strip()
                    if content:
                        text_parts.append(content)
                result_text = "\n\n".join(text_parts)
            else:
                result_text = ""

            # 构建节点输出（用于对话框显示）
            node_output = None
            if show_output:
                if items:
                    sources = [item.get("source", "未知") for item in items]
                    unique_sources = list(dict.fromkeys(sources))  # 去重保持顺序
                    node_output = f"【知识库检索】从 {', '.join(unique_sources)} 找到 {len(items)} 条相关内容\n\n{result_text}"
                else:
                    node_output = "【知识库检索】未找到相关内容"

            if output_var == "retrieved_result":
                return {
                    "retrieved_result": result_text,
                    "node_output": node_output,
                }

            return {
                "custom_vars": {
                    **state.custom_vars,
                    output_var: result_text,
                },
                "node_output": node_output,
            }
        except Exception as e:
            error_msg = f"检索失败: {str(e)}"
            if show_output:
                node_output = f"【知识库检索】{error_msg}"
            else:
                node_output = None
            
            if output_var == "retrieved_result":
                return {
                    "retrieved_result": "",
                    "node_output": node_output,
                }
            return {
                "custom_vars": {
                    **state.custom_vars,
                    output_var: "",
                },
                "node_output": node_output,
            }

    def condition_node(self, state: WorkflowState) -> str:
        conditions = self.node_data.get("conditions", [])
        default_target = self.node_data.get("defaultTarget", END)
        
        # 构建上下文，确保 custom_vars 中的动态变量可被访问
        context = {
            **state.model_dump(),
            **state.custom_vars,  # 将动态变量展开到上下文顶层
        }
        
        for condition in conditions:
            expression = condition.get("expression", "")
            target_node = condition.get("targetNode", END)
            if self._eval_condition_expression(expression, context):
                return target_node
        return default_target

    def output_node(self, state: WorkflowState) -> Dict[str, Any]:
        """输出节点：根据配置的参数或模板生成输出内容"""
        import re
        
        output_param = self.node_data.get("outputParam")
        template = self.node_data.get("template", "")
        output_format = self.node_data.get("format", "text")
        
        # 构建上下文，包含所有变量
        context = {
            **state.model_dump(),
            **state.custom_vars,
        }
        
        output_content = ""
        
        # 如果配置了模板，优先使用模板
        if template:
            try:
                # 将 {{variable}} 格式转换为 Python 的 {variable} 格式
                # 使用正则表达式替换，支持带下划线的变量名
                def replace_var(match):
                    var_name = match.group(1)
                    if var_name in context:
                        return str(context[var_name])
                    return match.group(0)  # 如果变量不存在，保留原样
                
                output_content = re.sub(r'\{\{([\w_]+)\}\}', replace_var, template)
            except Exception as e:
                output_content = f"[模板渲染错误: {str(e)}]\n原始模板: {template}"
        # 否则使用选中的参数
        elif output_param:
            if output_param in state.custom_vars:
                output_content = str(state.custom_vars[output_param])
            elif hasattr(state, output_param):
                output_content = str(getattr(state, output_param))
            else:
                output_content = f"[参数 {output_param} 未找到]"
        else:
            output_content = "[未配置输出参数或模板]"
        
        return {
            "custom_vars": {
                **state.custom_vars,
                f"output_{self.config.get('id', 'unknown')}": output_content,
            },
            "node_output": output_content,
        }

    def _call_llm_api(self, model_name: str, prompt: str, temperature: float) -> str:
        return f"[{model_name}] 大模型返回结果 (temperature={temperature})"

    def _run_code_in_sandbox(self, code: str, params: Dict[str, Any]) -> Any:
        """
        在沙箱环境中执行用户提供的Python代码
        支持两种模式：
        1. 函数模式：包含 def main(...) 的完整函数定义
        2. 表达式模式：简单的表达式或语句
        
        添加超时保护，防止代码执行时间过长
        """
        import signal
        
        class TimeoutError(Exception):
            pass
        
        def timeout_handler(signum, frame):
            raise TimeoutError("代码执行超时")

        # Windows 不支持 SIGALRM，这里做跨平台兼容
        use_alarm_timeout = hasattr(signal, "SIGALRM")
        
        try:
            # 设置超时时间为 25 秒（小于前端 30 秒超时）
            if use_alarm_timeout:
                signal.signal(signal.SIGALRM, timeout_handler)
                signal.alarm(25)
            
            # 创建安全的执行环境
            safe_builtins = {
                'len': len,
                'str': str,
                'int': int,
                'float': float,
                'bool': bool,
                'list': list,
                'dict': dict,
                'tuple': tuple,
                'set': set,
                'range': range,
                'enumerate': enumerate,
                'zip': zip,
                'map': map,
                'filter': filter,
                'sorted': sorted,
                'reversed': reversed,
                'sum': sum,
                'min': min,
                'max': max,
                'abs': abs,
                'round': round,
                'type': type,
                'isinstance': isinstance,
                'hasattr': hasattr,
                'getattr': getattr,
                'json': __import__('json'),
                'datetime': __import__('datetime'),
                'math': __import__('math'),
                're': __import__('re'),
            }
            
            exec_globals = {'__builtins__': safe_builtins}
            exec_locals = dict(params)
            
            if 'def main(' in code:
                # 函数模式：提取并执行 main 函数
                exec(code, exec_globals, exec_locals)
                
                if 'main' in exec_locals:
                    main_func = exec_locals['main']
                    
                    # 获取函数参数名
                    import inspect
                    sig = inspect.signature(main_func)
                    param_names = list(sig.parameters.keys())
                    
                    # 构建参数列表
                    args = [params.get(name) for name in param_names]
                    
                    # 调用函数
                    result = main_func(*args)
                    if use_alarm_timeout:
                        signal.alarm(0)  # 取消超时
                    return result
                else:
                    if use_alarm_timeout:
                        signal.alarm(0)  # 取消超时
                    return {"error": "代码中未找到 main 函数"}
            else:
                # 表达式模式：直接执行代码并返回结果
                exec(code, exec_globals, exec_locals)
                
                # 尝试返回最后一个表达式的结果
                # 通过查找局部变量中新增的变量或返回值
                lines = code.strip().split('\n')
                last_line = lines[-1].strip()
                
                if last_line.startswith('return '):
                    # 如果最后一行是 return 语句，执行它
                    return_expr = last_line[7:]
                    result = eval(return_expr, exec_globals, exec_locals)
                    if use_alarm_timeout:
                        signal.alarm(0)  # 取消超时
                    return result
                elif '=' not in last_line and last_line:
                    # 如果最后一行是表达式（不是赋值），返回其值
                    try:
                        result = eval(last_line, exec_globals, exec_locals)
                        if use_alarm_timeout:
                            signal.alarm(0)  # 取消超时
                        return result
                    except:
                        pass
                
                # 返回所有局部变量（排除输入参数）
                result = {k: v for k, v in exec_locals.items() if k not in params}
                if use_alarm_timeout:
                    signal.alarm(0)  # 取消超时
                return result if result else {"status": "executed", "message": "代码执行完成"}
                
        except TimeoutError as e:
            return {"error": f"代码执行超时: {str(e)}"}
        except Exception as e:
            return {"error": f"代码执行错误: {str(e)}"}

    def _eval_condition_expression(self, expression: str, context: Dict[str, Any]) -> bool:
        try:
            return eval(expression, {"__builtins__": {}}, context)
        except:
            return False


def build_langgraph_graph(graph_data: Dict[str, Any]) -> StateGraph:
    workflow = StateGraph(WorkflowState)
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    node_map = {}
    for node in nodes:
        node_id = node.get("id")
        node_type = node.get("type")
        node_map[node_id] = node
        executor = NodeExecutor(node)

        if node_type == "input":
            workflow.add_node(node_id, executor.input_node)
        elif node_type == "llm":
            workflow.add_node(node_id, executor.llm_node)
        elif node_type == "code":
            workflow.add_node(node_id, executor.code_node)
        elif node_type == "rag":
            workflow.add_node(node_id, executor.rag_node)
        elif node_type == "condition":
            workflow.add_node(node_id, executor.condition_node)
        elif node_type == "output":
            workflow.add_node(node_id, executor.output_node)
        elif node_type == "end":
            workflow.add_node(node_id, lambda state: {"final_result": state.model_dump()})
        elif node_type == "start":
            workflow.add_node(node_id, lambda state: state)
        else:
            workflow.add_node(node_id, lambda state: state)

    for edge in edges:
        source_id = edge.get("source")
        target_id = edge.get("target")
        source_node = node_map.get(source_id, {})

        if source_node.get("type") == "condition":
            workflow.add_conditional_edges(
                source_id,
                NodeExecutor(source_node).condition_node
            )
        else:
            workflow.add_edge(source_id, target_id)

    start_nodes = [n.get("id") for n in nodes if n.get("type") == "start"]
    if start_nodes:
        workflow.set_entry_point(start_nodes[0])

    end_nodes = [n.get("id") for n in nodes if n.get("type") == "end"]
    for end_node in end_nodes:
        workflow.add_edge(end_node, END)

    return workflow.compile()


def execute_workflow(graph_data: Dict[str, Any], input_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    try:
        app = build_langgraph_graph(graph_data)
        
        # 准备初始状态
        input_data = input_data or {}
        
        # 将非标准字段放入 custom_vars
        custom_vars = input_data.get("custom_vars", {})
        known_fields = {"user_input", "user_intent", "llm_output", "retrieved_result", "custom_vars"}
        
        for key, value in input_data.items():
            if key not in known_fields:
                # 动态变量（如 user_input_xxx, llm_output_xxx）放入 custom_vars
                custom_vars[key] = value
        
        # 构建初始状态
        state_data = {
            "user_input": input_data.get("user_input", ""),
            "user_intent": input_data.get("user_intent", ""),
            "llm_output": input_data.get("llm_output", ""),
            "retrieved_result": input_data.get("retrieved_result"),
            "custom_vars": custom_vars,
        }
        
        initial_state = WorkflowState(**state_data)
        result = app.invoke(initial_state.model_dump())
        return {
            "status": "success",
            "result": result
        }
    except Exception as e:
        import traceback
        return {
            "status": "failed",
            "error": str(e),
            "traceback": traceback.format_exc()
        }
