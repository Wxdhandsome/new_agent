from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
import json


class WorkflowState(BaseModel):
    user_input: str = Field(default="", description="用户输入内容")
    user_intent: str = Field(default="", description="大模型识别的用户意图")
    llm_output: str = Field(default="", description="大模型输出内容")
    code_result: Dict[str, Any] = Field(default_factory=dict, description="代码节点执行结果")
    custom_vars: Dict[str, Any] = Field(default_factory=dict, description="自定义扩展变量")


class NodeExecutor:
    def __init__(self, node_config: Dict[str, Any]):
        self.config = node_config
        self.node_data = node_config.get("data", {})

    def input_node(self, state: WorkflowState) -> Dict[str, Any]:
        var_name = self.node_data.get("varName", "user_input")
        input_value = state.user_input if var_name == "user_input" else state.custom_vars.get(var_name, "")
        return {var_name: input_value}

    def llm_node(self, state: WorkflowState) -> Dict[str, Any]:
        prompt_template = self.node_data.get("prompt", "")
        formatted_prompt = prompt_template.format(**state.model_dump())
        model_name = self.node_data.get("model", "Qwen3-32B-FP8")
        temperature = self.node_data.get("temperature", 0.7)
        llm_result = self._call_llm_api(model_name, formatted_prompt, temperature)
        output_var = self.node_data.get("outputVar", "llm_output")
        return {output_var: llm_result}

    def code_node(self, state: WorkflowState) -> Dict[str, Any]:
        code_content = self.node_data.get("code", "")
        input_vars = self.node_data.get("inputVars", [])
        output_var = self.node_data.get("outputVar", "code_result")
        exec_params = {var: state.model_dump().get(var) for var in input_vars}
        code_result = self._run_code_in_sandbox(code_content, exec_params)
        return {output_var: code_result}

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
        return {"status": "executed", "params": params}

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
