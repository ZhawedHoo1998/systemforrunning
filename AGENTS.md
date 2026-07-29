# 香氛素材库 - Codex 项目指南

## 项目概述

这是一个 Ruby Rain 小红书汽车香氛素材资产库，用于收集、分类、搜索素材，帮助写手获取创作灵感。

## 技术栈

- **前端**: Next.js 15 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **后端**: FastAPI + SQLAlchemy + Pydantic
- **数据库**: PostgreSQL (Docker 部署)
- **文件存储**: 本地 `./uploads/` 目录

## 目录结构

```
香氛素材管理/
├── frontend/           # Next.js 前端
│   ├── app/            # App Router 页面
│   ├── components/     # React 组件
│   │   ├── ui/         # shadcn/ui 基础组件
│   │   └── *.tsx       # 业务组件
│   └── lib/
│       ├── api.ts      # API 调用封装
│       └── utils.ts    # 工具函数
├── backend/            # FastAPI 后端
│   ├── main.py         # 应用入口
│   ├── database.py     # 数据库配置
│   ├── models.py       # SQLAlchemy 模型
│   ├── crud.py         # 数据库操作
│   └── routers/        # API 路由
├── uploads/            # 附件存储
├── data/               # 数据目录
├── docker-compose.yml  # PostgreSQL 配置
└── SPEC.md            # 功能规格文档
```

## 常用命令

### 启动后端
```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 启动前端
```bash
cd frontend
npm run dev
```

### 发布到公网预览

- 固定预览地址：`https://6fabc4ff.r6.cpolar.cn/`
- cpolar 的 `ruby-rain` 隧道固定转发 `127.0.0.1:3000`
- 前端改动完成后必须执行 `npm run build`，停止旧的 3000 端口进程，并用最新构建在 3000 端口重新启动生产服务
- 交付前同时验证本地 `http://127.0.0.1:3000/`、公网预览地址和公网 `/api/health`；不要只把最新版运行在 3001 等临时端口

### 启动 PostgreSQL
```bash
docker-compose up -d
```

## 注意事项

1. 前端使用 Next.js 15 App Router，所有组件默认是 Server Components。"use client" 声明的才是客户端组件
2. shadcn/ui 组件使用 Radix UI primitives
3. Tailwind CSS v4 使用新的 CSS-first 配置方式
4. 浏览器端 API 默认使用同源 `/api`，由 Next.js rewrite 转发到 `BACKEND_INTERNAL_URL`（默认 `http://127.0.0.1:8000`）
5. TikHub 等真实 API Key 只能放在被 Git 忽略的根目录 `.env`，`.env.example` 只保留空占位
