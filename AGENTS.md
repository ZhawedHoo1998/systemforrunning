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

### 启动 PostgreSQL
```bash
docker-compose up -d
```

## 注意事项

1. 前端使用 Next.js 15 App Router，所有组件默认是 Server Components。"use client" 声明的才是客户端组件
2. shadcn/ui 组件使用 Radix UI primitives
3. Tailwind CSS v4 使用新的 CSS-first 配置方式
4. API 基础 URL 通过 `NEXT_PUBLIC_API_URL` 环境变量配置，默认为 `http://localhost:8000`
