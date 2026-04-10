# 节点配置面板功能开发任务清单

## 任务概述
实现工作流编辑器中各节点的配置面板功能，支持点击节点后在右侧显示对应的配置表单。

## 任务列表

### ✅ 任务1: 创建任务清单文档
- [x] 创建任务清单文件
- [x] 定义各节点配置需求

### ✅ 任务2: 实现节点选中状态管理
- [x] 在 WorkflowEditor 中添加选中节点状态 (`selectedNode`)
- [x] 实现 onNodeClick 事件处理
- [x] 传递选中节点信息到配置面板

### ✅ 任务3: 创建节点配置面板组件
- [x] 创建 NodeConfigPanel 组件
- [x] 根据节点类型渲染不同表单
- [x] 实现配置数据的保存和更新

### ✅ 任务4: 实现开始节点配置表单
**配置项:**
- [x] 节点名称
- [x] 描述信息

### ✅ 任务5: 实现输入节点配置表单
**配置项:**
- [x] 节点名称
- [x] 输入提示
- [x] 输入类型（文本、数字、多行文本、下拉选择）
- [x] 是否必填
- [x] 默认值
- [x] 固定参数名 `user_input`

### ✅ 任务6: 实现大模型节点配置表单
**配置项:**
- [x] 节点名称
- [x] 模型选择（GPT-4、GPT-3.5、Claude等）
- [x] 温度参数（temperature）
- [x] 最大token数
- [x] 系统提示词
- [x] Prompt模板
- [x] 固定参数名 `llm_output`

### ✅ 任务7: 实现条件分支节点配置表单
**配置项:**
- [x] 节点名称
- [x] 分支条件配置（支持多条件）
  - [x] 选择变量（下拉选择参数池中的参数）
  - [x] 比较操作符（等于、大于、包含等）
  - [x] 目标值
- [x] 动态连接点生成（条件数量 + 1个默认分支）
- [x] 默认分支设置

### ✅ 任务8: 实现代码节点配置表单
**配置项:**
- [x] 节点名称
- [x] 编程语言（Python/JavaScript）
- [x] 选择输入参数
- [x] 代码编辑器
- [x] 固定参数名 `code_result`
- [x] 超时时间设置

### ✅ 任务9: 实现输出节点配置表单
**配置项:**
- [x] 节点名称
- [x] 输出格式（文本、JSON、Markdown）
- [x] 选择输出参数
- [x] 输出模板

### ✅ 任务10: 实现结束节点配置表单
**配置项:**
- [x] 节点名称
- [x] 结束状态（成功/失败）
- [x] 返回数据配置

### ⏳ 任务11: 测试节点配置保存功能
- [ ] 测试各节点配置表单渲染
- [ ] 测试配置数据保存到节点
- [ ] 测试配置数据持久化到数据库
- [ ] 测试配置数据在工作流执行时使用

## 技术实现要点

### 已实现功能
1. **参数池管理** - 使用 React Context 管理全局参数池
2. **参数下拉选择** - 实现 ParamSelect 组件，支持从参数池选择参数
3. **固定参数名** - 输入节点 `user_input`、大模型节点 `llm_output`、代码节点 `code_result`
4. **条件分支动态连接点** - 根据条件数量自动生成对应数量的连接点
5. **实时配置更新** - 表单修改实时同步到节点数据

### 数据结构
```typescript
interface NodeConfig {
  // 通用配置
  label: string;
  description?: string;
  
  // 输入节点配置
  placeholder?: string;
  inputType?: 'text' | 'number' | 'textarea' | 'select';
  required?: boolean;
  defaultValue?: string;
  
  // 大模型节点配置
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  promptTemplate?: string;
  
  // 条件分支配置
  conditions?: Array<{
    id: string;
    variable: string;
    operator: string;
    value: string;
  }>;
  
  // 代码节点配置
  language?: 'python' | 'javascript';
  code?: string;
  inputParams?: string;
  timeout?: number;
  
  // 输出节点配置
  format?: 'text' | 'json' | 'markdown';
  outputParam?: string;
  template?: string;
  
  // 结束节点配置
  status?: 'success' | 'failed';
  returnData?: string;
}
```

### 组件结构
```
WorkflowEditor
├── ParamPoolProvider (参数池上下文)
├── ReactFlowProvider
└── FlowCanvas (ReactFlow画布)
    ├── Nodes (可点击)
    │   ├── StartNode
    │   ├── InputNode
    │   ├── LLMNode
    │   ├── ConditionNode (动态连接点)
    │   ├── CodeNode
    │   ├── OutputNode
    │   └── EndNode
    ├── Edges
    └── NodeConfigPanel (右侧配置面板)
        ├── StartNodeConfig
        ├── InputNodeConfig
        ├── LLMNodeConfig
        ├── ConditionNodeConfig
        ├── CodeNodeConfig
        ├── OutputNodeConfig
        └── EndNodeConfig
```

## 开发顺序
1. ✅ 先实现基础框架（任务2、3）
2. ✅ 然后逐个实现各节点配置表单（任务4-10）
3. ⏳ 最后进行整体测试（任务11）

## 验收标准
- [x] 点击节点右侧显示对应配置面板
- [x] 各节点配置表单完整且可编辑
- [x] 配置数据能正确保存到节点
- [ ] 保存工作流时配置数据持久化到数据库
- [x] 参数下拉选择功能正常
- [x] 条件分支连接点动态生成
