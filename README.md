# Workflow AI 工作流系统

基于 React + LangGraph 的可视化 AI 工作流编排系统。

## 功能特性

- 🔗 **可视化工作流编排** - 拖拽式节点编辑，支持多种节点类型
- 🤖 **大模型集成** - 支持 OpenAI 格式的 LLM API
- 📚 **知识库检索** - 基于 Milvus 向量数据库的 RAG 检索
- 💻 **代码执行** - 支持 Python/JavaScript 代码节点
- 🔀 **条件分支** - 支持条件判断和分支跳转

## 快速开始

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd new_agent
```

### 2. 后端配置

```bash
cd backend

# 复制环境配置文件
cp .env.example .env

# 编辑 .env 文件，配置以下必需项：
# - API_KEY: LLM API 密钥
# - BASE_URL: LLM 服务地址
# - BGE_URL: BGE 向量化服务地址
# - MILVUS_HOST: Milvus 向量数据库地址

# 安装依赖并启动
pip install -r requirements.txt
python run.py
```

### 3. 前端配置

```bash
cd frontend

# 复制环境配置文件
cp .env.example .env

# 编辑 .env 文件（如果后端地址不是 localhost:8001）
# VITE_BACKEND_URL=http://localhost:8001

# 安装依赖并启动
npm install
npm run dev
```

### 4. 访问系统

打开浏览器访问 http://localhost:3000

## 环境配置说明

### 后端配置 (.env)

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | SQLite 数据库路径 | `sqlite:///./workflow.db` |
| `SECRET_KEY` | 应用密钥 | `your-secret-key` |
| `API_KEY` | LLM API 密钥 | `your-api-key` |
| `BASE_URL` | LLM 服务地址 | `http://localhost:8000/v1` |
| `BGE_URL` | BGE 向量化服务 | `http://localhost:50183` |
| `MILVUS_HOST` | Milvus 数据库地址 | `localhost` |
| `MILVUS_PORT` | Milvus 端口 | `19530` |

### 前端配置 (.env)

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `VITE_BACKEND_URL` | 后端服务地址 | `http://localhost:8001` |

## 依赖服务

1. **LLM 服务** - 提供大模型 API（兼容 OpenAI 格式）
2. **BGE 服务** - 提供文本向量化服务
3. **Milvus** - 向量数据库存储知识库向量

## 项目结构

```
.
├── backend/           # 后端服务 (FastAPI)
│   ├── app/           # 应用代码
│   │   ├── api/       # API 路由
│   │   ├── langgraph/ # 工作流引擎
│   │   └── knowledge_base/  # 知识库模块
│   ├── .env.example   # 环境配置示例
│   └── requirements.txt
├── frontend/          # 前端应用 (React + Vite)
│   ├── src/
│   │   ├── components/# React 组件
│   │   └── api/       # API 封装
│   ├── .env.example   # 环境配置示例
│   └── package.json
└── README.md
```

## 技术栈

- **后端**: Python, FastAPI, LangGraph, SQLAlchemy, Milvus
- **前端**: React, TypeScript, Ant Design, React Flow
- **向量数据库**: Milvus
- **工作流引擎**: LangGraph

## License

MIT
