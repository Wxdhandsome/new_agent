from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
import json


class WorkflowState(BaseModel):
    user_input: str = Field(default="", description="用户输入内容")
    user_intent: str = Field(default="", description="大模型识别的用户意图")
    llm_output: str = Field(default="", description="大模型输出内容")
    # 注意：代码节点的输出由用户自定义参数名，不再固定为 code_result
    custom_vars: Dict[str, Any] = Field(default_factory=dict, description="自定义扩展变量（包含代码节点输出等）")


class NodeExecutor:
    def __init__(self, node_config: Dict[str, Any]):
        self.config = node_config
        self.node_data = node_config.get("data", {})

    def input_node(self, state: WorkflowState) -> Dict[str, Any]:
        var_name = self.node_data.get("varName", "user_input")
        input_value = state.user_input if var_name == "user_input" else state.custom_vars.get(var_name, "")

        if var_name == "user_input":
            return {"user_input": input_value}

        return {
            "custom_vars": {
                **state.custom_vars,
                var_name: input_value,
            }
        }

    def llm_node(self, state: WorkflowState) -> Dict[str, Any]:
        prompt_template = self.node_data.get("promptTemplate") or self.node_data.get("prompt", "")

        context = {
            **state.model_dump(),
            **state.custom_vars,
        }
        try:
            formatted_prompt = prompt_template.format(**context)
        except Exception:
            formatted_prompt = prompt_template

        model_name = self.node_data.get("model", "Qwen3-32B-FP8")
        temperature = self.node_data.get("temperature", 0.7)
        llm_result = self._call_llm_api(model_name, formatted_prompt, temperature)
        output_var = self.node_data.get("outputVar", "llm_output")

        if output_var == "llm_output":
            return {"llm_output": llm_result}

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
                    state_value = getattr(state, ref_param_id, None)
                    if state_value is not None:
                        exec_params[var_name] = state_value
                    else:
                        exec_params[var_name] = state.custom_vars.get(ref_param_id)
                else:
                    # 使用用户输入或上下文中的值
                    if hasattr(state, var_name):
                        exec_params[var_name] = getattr(state, var_name)
                    else:
                        exec_params[var_name] = state.custom_vars.get(var_name)
            else:
                # 兼容旧格式（字符串列表）
                var_name = str(var_config)
                exec_params[var_name] = state.model_dump().get(var_name)
        
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

    def condition_node(self, state: WorkflowState) -> str:
        conditions = self.node_data.get("conditions", [])
        default_target = self.node_data.get("defaultTarget", END)
        for condition in conditions:
            expression = condition.get("expression", "")
            target_node = condition.get("targetNode", END)
            if self._eval_condition_expression(expression, state.model_dump()):
                return target_node
        return default_target

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
        elif node_type == "condition":
            workflow.add_node(node_id, executor.condition_node)
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
        initial_state = WorkflowState(**(input_data or {}))
        result = app.invoke(initial_state.model_dump())
        return {
            "status": "success",
            "result": result
        }
    except Exception as e:
        return {
            "status": "failed",
            "error": str(e)
        }
