# 基于 React+LangGraph 的 AI 工作流搭建系统设计方案

**文档版本**：V1.0

**更新日期**：2026 年 03 月

**核心技术栈**：React + React Flow + LangGraph + Python/Node.js 后端

------

## 一、系统概述

本系统是一款可视化拖拽式 AI 工作流编排平台，前端基于 React 实现工作流的无代码 / 低代码可视化搭建，后端解析前端编排的图结构数据，基于 LangGraph 构建可执行的工作流引擎。

系统核心能力：

- 可视化拖拽组件搭建工作流，组件对应 LangGraph 的 Node 节点，连线对应 Edge 边
- 前端编排的工作流自动生成标准图数据，同步至后端构建 LangGraph 可执行图
- 用户输入数据持久化存储至数据库，工作流运行时自动注入对应节点上下文
- 内置工作流实时演示功能，点击按钮即可唤起对话窗口，直观展示工作流运行效果

## 二、系统整体架构

### 2.1 技术栈选型

| 架构层级 | 核心技术 / 框架                                              | 核心职责                                                     |
| -------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 前端层   | React 18+、React Flow、Zustand/Redux、AntD/MUI、WebSocket/SSE | 可视化编排画布、节点配置、工作流管理、实时演示交互、运行结果渲染 |
| 后端层   | FastAPI/Express、LangGraph、LLM 适配层、代码沙箱             | 工作流 CRUD、LangGraph 图构建、节点逻辑执行、大模型调用、运行状态管理 |
| 数据层   | PostgreSQL/MongoDB                                           | 工作流元数据、用户输入数据、运行记录、节点配置数据持久化存储 |

2.2 核心数据流转链路

用户前端拖拽编排 → 生成标准图结构JSON → 后端存储并解析为LangGraph节点/边 → 编译为可执行工作流 → 运行时注入用户输入数据 → 逐节点执行 → 实时推送运行状态 → 前端渲染结果

## 三、核心组件设计

所有组件与 LangGraph 节点一一映射，内置标准化执行逻辑，支持可视化配置，完整覆盖工作流全生命周期。

| 组件类型     | 核心配置属性                                                 | 前端交互能力                                       | LangGraph 执行逻辑                                           |
| ------------ | ------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------ |
| 开始节点     | 工作流 ID、工作流名称、创建人、创建时间、状态                | 全局唯一、不可删除、支持重命名                     | 作为 StateGraph 的入口节点，初始化工作流全局上下文 State     |
| 输入节点     | 输入类型（文本 / 文件 / 下拉选择）、输入提示语、绑定变量名、是否必填、默认值 | 可视化配置输入规则、绑定全局上下文变量             | 接收用户输入，将值写入 LangGraph 的 State 上下文，供下游节点调用 |
| 大模型节点   | 模型选型、Prompt 模板、温度系数、上下文变量映射、输出变量名、最大输出长度 | 支持模板可视化编辑、变量一键插入、模型参数实时调整 | 加载 Prompt 模板并替换上下文变量 → 调用对应大模型 API → 将返回结果写入 State 上下文 |
| 条件分支节点 | 分支条件表达式、分支目标节点 ID、默认兜底分支 ID             | 可视化配置多分支条件、绑定分支跳转目标             | 解析条件表达式 → 基于当前 State 上下文做逻辑判断 → 自动跳转至匹配的目标节点 |
| 代码节点     | 代码片段、入参变量映射、出参变量名、沙箱配置、超时时间       | 内置语法高亮代码编辑器、变量一键绑定               | 沙箱环境运行自定义代码 → 读取 State 上下文入参 → 执行自定义逻辑 → 将执行结果写入 State 上下文 |
| 输出节点     | 输出格式（文本 / JSON / 可视化）、输出变量映射、展示模板     | 配置输出样式、多结果聚合展示                       | 聚合 State 上下文的目标变量 → 按模板格式化处理 → 输出工作流最终结果 |
| 结束节点     | 结束提示语、是否记录运行日志、是否触发回调                   | 支持自定义结束规则、多结束节点配置                 | 终止工作流执行，标记运行终态，归档运行日志，触发后续回调动作 |

## 四、前端核心功能设计

### 4.1 核心页面模块

#### 4.1.1 工作流编排画布

- 基于 React Flow 实现核心画布能力，支持节点拖拽、磁吸对齐、画布缩放 / 平移、撤销 / 重做、框选批量操作
- 连线自动路由，内置规则校验，禁止无效连线（如结束节点无出边、开始节点无入边、循环链路预警）
- 节点类型视觉差异化设计，不同类型节点匹配专属配色与图标，提升编排辨识度

#### 4.1.2 侧边功能面板

- **左侧组件面板**：分类展示所有节点组件，支持搜索、筛选，拖拽即可快速添加至画布
- **右侧配置面板**：选中节点后展示可视化配置表单，实时校验配置合法性，配置变更自动同步至节点元数据

#### 4.1.3 工作流管理页

- 列表展示所有工作流，支持新建、编辑、删除、复制、发布、版本回滚核心操作
- 支持按创建时间、发布状态、创建人筛选，按工作流名称模糊搜索

#### 4.1.4 工作流演示模块

- 点击「工作流演示」按钮，弹出独立对话窗口，模拟工作流全流程运行
- 运行过程实时展示节点执行状态，输入节点自动唤起输入框，LLM / 代码节点展示加载状态，条件分支节点展示判断逻辑
- 内置运行暂停、继续、终止操作，全流程运行日志实时渲染，支持日志导出

### 4.2 前端图数据规范

前端编排完成后，自动生成标准化 JSON 结构，后端可直接解析为 LangGraph 图，核心格式如下：

```json
{
  "workflowId": "wf_20260326001",
  "workflowName": "智能客服问答工作流",
  "status": "published",
  "creator": "user_001",
  "createTime": "2026-03-26T17:00:00Z",
  "updateTime": "2026-03-26T18:00:00Z",
  "nodes": [
    {
      "id": "node_start_001",
      "type": "start",
      "data": {
        "label": "开始",
        "workflowId": "wf_20260326001"
      },
      "position": { "x": 100, "y": 100 }
    },
    {
      "id": "node_input_001",
      "type": "input",
      "data": {
        "label": "用户问题",
        "inputType": "text",
        "varName": "user_input",
        "required": true,
        "placeholder": "请输入您的问题"
      },
      "position": { "x": 100, "y": 220 }
    },
    {
      "id": "node_llm_001",
      "type": "llm",
      "data": {
        "label": "意图识别",
        "model": "gpt-3.5-turbo",
        "prompt": "解析用户问题：{{user_input}}，仅返回用户意图，可选值：退款、咨询、其他",
        "temperature": 0.3,
        "outputVar": "user_intent"
      },
      "position": { "x": 100, "y": 340 }
    }
  ],
  "edges": [
    {
      "id": "edge_001",
      "source": "node_start_001",
      "target": "node_input_001",
      "sourceHandle": "output",
      "targetHandle": "input"
    },
    {
      "id": "edge_002",
      "source": "node_input_001",
      "target": "node_llm_001",
      "sourceHandle": "output",
      "targetHandle": "input"
    }
  ]
}
```

## 五、后端核心功能设计

### 5.1 核心数据模型

#### 5.1.1 工作流主表（workflow）

| 字段名        | 数据类型     | 约束 | 说明                                              |
| ------------- | ------------ | ---- | ------------------------------------------------- |
| workflow_id   | varchar(64)  | 主键 | 工作流唯一 ID                                     |
| workflow_name | varchar(128) | 非空 | 工作流名称                                        |
| description   | text         |      | 工作流描述                                        |
| creator_id    | varchar(64)  | 非空 | 创建人 ID                                         |
| graph_data    | jsonb        | 非空 | 前端编排的图结构完整数据                          |
| status        | varchar(32)  | 非空 | 状态：draft 草稿 /published 已发布 /disabled 禁用 |
| create_time   | timestamp    | 非空 | 创建时间                                          |
| update_time   | timestamp    | 非空 | 最后更新时间                                      |

5.1.2 工作流运行记录表（workflow_run）

| 字段名         | 数据类型    | 约束 | 说明                                                |
| -------------- | ----------- | ---- | --------------------------------------------------- |
| run_id         | varchar(64) | 主键 | 运行记录唯一 ID                                     |
| workflow_id    | varchar(64) | 外键 | 关联工作流 ID                                       |
| operator_id    | varchar(64) | 非空 | 运行人 ID                                           |
| status         | varchar(32) | 非空 | 运行状态：running 运行中 /success 成功 /failed 失败 |
| input_data     | jsonb       |      | 用户输入数据                                        |
| context_data   | jsonb       |      | LangGraph 运行全量上下文 State                      |
| final_result   | jsonb       |      | 工作流最终输出结果                                  |
| error_msg      | text        |      | 运行失败时的错误信息                                |
| run_start_time | timestamp   | 非空 | 运行开始时间                                        |
| run_end_time   | timestamp   |      | 运行结束时间                                        |
| duration       | int         |      | 运行耗时（单位：毫秒）                              |

5.2 核心 API 接口

| 接口路径                         | 请求方法 | 功能描述         | 核心入参                               | 核心出参                         |
| -------------------------------- | -------- | ---------------- | -------------------------------------- | -------------------------------- |
| /api/workflow                    | POST     | 新建工作流       | workflow_name、description、graph_data | workflow_id、status、create_time |
| /api/workflow/{workflow_id}      | GET      | 查询工作流详情   | workflow_id                            | 完整工作流信息、graph_data       |
| /api/workflow/{workflow_id}      | PUT      | 更新工作流       | graph_data、status、workflow_name      | update_time、status              |
| /api/workflow/{workflow_id}      | DELETE   | 删除工作流       | workflow_id                            | 操作结果标识                     |
| /api/workflow/{workflow_id}/demo | POST     | 工作流演示运行   | operator_id、input_data                | 实时节点执行状态、运行结果       |
| /api/workflow/{workflow_id}/run  | POST     | 工作流正式运行   | operator_id、input_data                | run_id、status                   |
| /api/run/{run_id}                | GET      | 查询运行记录详情 | run_id                                 | 全量上下文、运行结果、错误信息   |
| /api/run/list                    | GET      | 查询运行记录列表 | workflow_id、page_num、page_size       | 运行记录分页列表                 |

### 5.3 LangGraph 适配层核心逻辑

后端接收前端图数据后，自动解析并构建 LangGraph 可执行的 StateGraph，核心实现逻辑（Python+FastAPI+LangGraph）如下：

```python
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
import json

# 定义工作流全局上下文State
class WorkflowState(BaseModel):
    """工作流全局上下文，映射前端节点绑定的变量"""
    user_input: str = Field(default="", description="用户输入内容")
    user_intent: str = Field(default="", description="大模型识别的用户意图")
    llm_output: str = Field(default="", description="大模型输出内容")
    code_result: Dict[str, Any] = Field(default_factory=dict, description="代码节点执行结果")
    custom_vars: Dict[str, Any] = Field(default_factory=dict, description="自定义扩展变量")

# 节点执行函数工厂
class NodeExecutor:
    def __init__(self, node_config: Dict[str, Any]):
        self.config = node_config
        self.node_data = node_config.get("data", {})

    def input_node(self, state: WorkflowState) -> Dict[str, Any]:
        """输入节点执行逻辑"""
        var_name = self.node_data.get("varName", "user_input")
        input_value = state.user_input if var_name == "user_input" else state.custom_vars.get(var_name, "")
        return {var_name: input_value}

    def llm_node(self, state: WorkflowState) -> Dict[str, Any]:
        """大模型节点执行逻辑"""
        # 替换Prompt模板中的上下文变量
        prompt_template = self.node_data.get("prompt", "")
        formatted_prompt = prompt_template.format(**state.dict())
        # 调用大模型API（可适配OpenAI、通义千问、自定义模型等）
        model_name = self.node_data.get("model", "gpt-3.5-turbo")
        temperature = self.node_data.get("temperature", 0.7)
        llm_result = self._call_llm_api(model_name, formatted_prompt, temperature)
        # 写入输出变量
        output_var = self.node_data.get("outputVar", "llm_output")
        return {output_var: llm_result}

    def code_node(self, state: WorkflowState) -> Dict[str, Any]:
        """代码节点执行逻辑（沙箱环境运行）"""
        code_content = self.node_data.get("code", "")
        input_vars = self.node_data.get("inputVars", [])
        output_var = self.node_data.get("outputVar", "code_result")
        # 沙箱环境执行代码，注入上下文入参
        exec_params = {var: state.dict().get(var) for var in input_vars}
        code_result = self._run_code_in_sandbox(code_content, exec_params)
        return {output_var: code_result}

    def condition_node(self, state: WorkflowState) -> str:
        """条件分支节点执行逻辑，返回目标节点ID"""
        conditions = self.node_data.get("conditions", [])
        default_target = self.node_data.get("defaultTarget", END)
        # 遍历条件匹配
        for condition in conditions:
            expression = condition.get("expression", "")
            target_node = condition.get("targetNode", END)
            # 表达式解析与校验，匹配成功返回目标节点
            if self._eval_condition_expression(expression, state.dict()):
                return target_node
        # 无匹配条件返回兜底分支
        return default_target

    # 内部工具方法（LLM调用、代码沙箱、表达式解析实现略）
    def _call_llm_api(self, model_name: str, prompt: str, temperature: float) -> str:
        # 适配各厂商大模型API
        return "大模型返回结果"

    def _run_code_in_sandbox(self, code: str, params: Dict[str, Any]) -> Any:
        # 沙箱环境执行代码，禁止高危操作
        return {}

    def _eval_condition_expression(self, expression: str, context: Dict[str, Any]) -> bool:
        # 安全解析条件表达式，返回布尔结果
        return False

# 图构建核心方法
def build_langgraph_graph(graph_data: Dict[str, Any]) -> StateGraph:
    """解析前端图数据，构建LangGraph可执行图"""
    # 初始化状态图
    workflow = StateGraph(WorkflowState)
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    # 注册所有节点到LangGraph
    node_map = {}
    for node in nodes:
        node_id = node.get("id")
        node_type = node.get("type")
        node_map[node_id] = node
        executor = NodeExecutor(node)

        # 按节点类型注册执行函数
        if node_type == "input":
            workflow.add_node(node_id, executor.input_node)
        elif node_type == "llm":
            workflow.add_node(node_id, executor.llm_node)
        elif node_type == "code":
            workflow.add_node(node_id, executor.code_node)
        elif node_type == "condition":
            workflow.add_node(node_id, executor.condition_node)
        elif node_type == "end":
            workflow.add_node(node_id, lambda state: {"final_result": state.dict()})

    # 构建节点间的边（连线关系）
    for edge in edges:
        source_id = edge.get("source")
        target_id = edge.get("target")
        source_node = node_map.get(source_id, {})

        # 条件分支边：绑定条件路由
        if source_node.get("type") == "condition":
            workflow.add_conditional_edges(
                source_id,
                NodeExecutor(source_node).condition_node
            )
        # 普通边：直接绑定上下游节点
        else:
            workflow.add_edge(source_id, target_id)

    # 设置入口节点（开始节点）
    start_nodes = [n.get("id") for n in nodes if n.get("type") == "start"]
    if start_nodes:
        workflow.set_entry_point(start_nodes[0])

    # 设置出口节点（结束节点）
    end_nodes = [n.get("id") for n in nodes if n.get("type") == "end"]
    for end_node in end_nodes:
        workflow.add_edge(end_node, END)

    # 编译为可执行图
    return workflow.compile()
```

## 六、关键能力与安全设计

### 6.1 上下文变量管理

- 所有节点的输入输出均绑定至 LangGraph 的全局 State 上下文，变量名全局唯一校验
- 前端配置面板内置变量选择器，支持一键引用上游节点已定义的变量，无需手动编写
- 工作流运行时自动校验变量依赖，缺失依赖提前预警，避免运行报错

### 6.2 代码节点安全管控

- 代码节点运行于独立沙箱环境，禁止文件读写、系统命令执行、高危网络请求等操作
- 配置白名单域名，仅允许向指定地址发起网络请求
- 设置执行超时时间（默认 5 秒），避免死循环导致服务卡死
- 代码内容自动安全扫描，拦截高危代码片段

### 6.3 实时运行能力

- 基于 WebSocket/SSE 实现后端运行状态实时推送，前端无刷新展示节点执行进度
- 演示模式支持分步执行，可暂停在指定节点，查看上下文数据，便于调试
- 运行异常自动捕获，返回详细错误信息与节点定位，快速排查问题

------

## 七、扩展能力规划

1. **工作流版本管理**：支持工作流多版本存储、版本对比、一键回滚，满足迭代优化需求
2. **节点模板市场**：内置高频场景节点模板、完整工作流模板，支持一键导入复用
3. **RBAC 权限管控**：基于角色的权限管理，支持工作流查看、编辑、运行、管理权限细分
4. **多模型适配**：兼容主流开源 / 闭源大模型，支持本地部署模型接入
5. **API 开放能力**：支持已发布工作流生成 API 接口，第三方系统可直接调用
6. **运行数据统计**：工作流运行次数、成功率、耗时等数据统计，可视化报表展示

------

## 八、典型业务场景示例

### 智能客服退款处理工作流

1. 开始节点 → 输入节点（用户问题输入，绑定变量`user_input`）

2. 输入节点 → 大模型节点（意图识别，判断用户问题是否为退款需求，输出变量`user_intent`）

3. 大模型节点 → 条件分支节点

   - 条件 1：`user_intent == 退款` → 跳转至「退款流程解答」大模型节点
   - 条件 2：`user_intent == 咨询` → 跳转至「通用问题解答」大模型节点
   - 兜底条件：其他意图 → 跳转至「人工客服转接」节点

   

4. 各分支节点执行完成后 → 输出节点（聚合对应解答内容）→ 结束节点

该工作流可通过前端拖拽 5 分钟内完成搭建，点击「演示」按钮即可直接测试对话效果，无需编写任何代码。