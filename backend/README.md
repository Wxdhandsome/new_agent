# AI 工作流系统 - 后端

## 技术栈
- FastAPI
- SQLAlchemy + Alembic
- LangGraph
- SQLite (开发) / PostgreSQL (生产)

## 安装依赖
```bash
pip install -r requirements.txt
```

## 运行开发服务器
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API 文档
启动服务后访问: http://localhost:8000/docs
