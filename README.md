# AI 工作流搭建系统

基于 React+LangGraph 的可视化 AI 工作流搭建系统

## 项目概述

本系统是一款可视化拖拽式 AI 工作流编排平台，前端基于 React 实现工作流的无代码/低代码可视化搭建，后端解析前端编排的图结构数据，基于 LangGraph 构建可执行的工作流引擎。

## 技术栈

### 后端
- Python 3.8+
- FastAPI
- SQLAlchemy
- LangGraph
- SQLite (开发) / PostgreSQL (生产)

### 前端
- React 18+
- TypeScript
- Vite
- React Flow
- Ant Design
- Zustand

## 项目结构

```
new_agent/
├── backend/              # 后端项目
│   ├── app/
│   │   ├── api/         # API 路由
│   │   ├── core/        # 核心配置
│   │   ├── models/      # 数据模型
│   │   ├── services/    # 业务逻辑
│   │   ├── langgraph/   # LangGraph 适配层
│   │   └── main.py
│   ├── requirements.txt
│   └── run.py           # 启动脚本
└── frontend/             # 前端项目
    ├── src/
    │   ├── components/  # 组件
    │   ├── pages/       # 页面
    │   ├── store/       # 状态管理
    │   ├── api/         # API 调用
    │   └── App.tsx
    ├── package.json
    └── README.md
```

## 快速开始

### 1. 后端启动

**方式一：使用启动脚本（推荐）**

```bash
cd backend
python run.py
```

**方式二：使用 uvicorn 直接启动**

```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端服务地址: http://localhost:8000  
后端API文档: http://localhost:8000/docs

### 2. 前端启动

```bash
cd frontend
npm install    # 首次运行需要安装依赖
npm run dev
```

前端访问地址: http://localhost:3000 （或 3001、3002 如果被占用）

### 3. 访问系统

1. 确保后端服务已启动（http://localhost:8000）
2. 打开前端页面（http://localhost:3000）
3. 开始使用 AI 工作流搭建系统！

## 常见问题

### 问题1：前端页面一直加载中/转圈

**原因**：后端服务未启动或已停止

**解决**：
```bash
# 检查后端是否在运行
netstat -ano | findstr :8000

# 如果没有结果，重新启动后端
cd backend
python run.py
```

### 问题2：API 请求超时

**症状**：浏览器控制台显示 `timeout of 10000ms exceeded`

**原因**：后端服务卡住或端口被占用

**解决**：
```bash
# 杀掉所有 Python 进程后重启
taskkill /F /IM python.exe
cd backend
python run.py
```

### 问题3：前端显示"暂无数据"

**原因**：数据库中没有工作流数据

**解决**：点击"新建工作流"按钮创建工作流

### 问题4：ModuleNotFoundError: No module named 'app'

**原因**：从错误目录启动 uvicorn

**解决**：
```bash
# 正确方式：进入 backend 目录后启动
cd backend
python run.py

# 错误方式：在项目根目录启动 uvicorn
# uvicorn backend.app.main:app --reload  # 不要这样做
```

## 核心功能

1. **可视化工作流编排** - 基于 React Flow 的拖拽式工作流搭建
2. **节点组件库** - 包含开始、结束、输入、大模型、条件分支、代码、输出等节点
3. **工作流管理** - 新建、编辑、删除、复制工作流
4. **工作流运行** - 基于 LangGraph 的工作流执行引擎
5. **实时演示** - 一键演示工作流运行效果

## 开发说明

- 后端使用 SQLite 作为开发数据库，数据文件位于 `backend/workflow.db`
- 前端已配置代理，访问 `/api` 会自动转发到后端 8000 端口
- 工作流数据存储在数据库中，支持完整的 CRUD 操作
- 后端修改代码会自动重启（`--reload` 模式）
- 前端支持热更新，修改代码页面自动刷新

## 详细文档

- [启动说明](./启动说明.md) - 完整的启动指南和故障排查

## 服务地址速查

| 服务 | 地址 | 说明 |
|------|------|------|
| 后端API | http://localhost:8000 | FastAPI 服务 |
| API文档 | http://localhost:8000/docs | Swagger UI 文档 |
| 健康检查 | http://localhost:8000/health | 服务状态检查 |
| 前端页面 | http://localhost:3000/3001/3002 | Vite 开发服务器 |
