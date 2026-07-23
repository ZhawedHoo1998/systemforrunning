# 香氛内容运营中台 (Fragrance Content Hub)

小红书香氛内容运营系统 - 第一阶段

## 技术栈

- **后端**: Node.js + Express + Prisma + PostgreSQL
- **前端**: React + Ant Design + React Router + Zustand

## 项目结构

```
├── server/                 # 后端服务
│   ├── prisma/
│   │   └── schema.prisma   # 数据库模型
│   ├── src/
│   │   ├── routes/         # API路由
│   │   ├── middleware/     # 中间件
│   │   └── utils/          # 工具函数
│   └── package.json
├── client/                 # 前端应用
│   ├── src/
│   │   ├── api/            # API调用
│   │   ├── components/     # 组件
│   │   ├── pages/          # 页面
│   │   ├── store/          # 状态管理
│   │   └── App.tsx
│   └── package.json
└── README.md
```

## 快速开始

### 1. 环境要求

- Node.js 18+
- PostgreSQL 14+

### 2. 数据库设置

```bash
# 创建数据库
psql -U postgres
CREATE DATABASE fragrance_hub;
\q
```

### 3. 启动后端

```bash
cd server
npm install
npx prisma db push
npm run dev
```

后端运行在 http://localhost:3001

### 4. 启动前端

```bash
cd client
npm install
npm run dev
```

前端运行在 http://localhost:3000

### 5. 创建管理员账号

直接调用API创建第一个管理员：

```bash
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "管理员",
    "email": "admin@example.com",
    "password": "admin123",
    "role": "ADMIN"
  }'
```

然后访问 http://localhost:3000 使用邮箱密码登录。

## 功能模块

### 第一阶段完成功能

1. **登录与成员管理** - 用户认证、角色权限、CRUD
2. **选题创意库** - 提交、评分、审核、投票、评论
3. **素材库** - 素材上传、标签管理、关联产品/车型
4. **产品与车型库** - 产品、车型、品牌、香型、标签管理
5. **内容生产任务** - 任务创建、状态流转、分配负责人
6. **发布笔记库** - 笔记登记、数据回填、转化率计算
7. **数据看板** - 月度统计、趋势图、排行榜
8. **通知中心** - 站内通知、已读未读

## API 路由

| 路由 | 说明 |
|------|------|
| POST /api/auth/login | 登录 |
| GET /api/auth/me | 获取当前用户 |
| GET/POST /api/users | 成员列表/创建 |
| GET/PUT/DELETE /api/ideas | 选题CRUD |
| POST /api/ideas/:id/score | 选题评分 |
| POST /api/ideas/:id/review | 选题审核 |
| GET/POST /api/materials | 素材CRUD |
| GET/POST /api/products | 产品CRUD |
| GET/POST /api/tasks | 任务CRUD |
| PUT /api/tasks/:id/status | 更新任务状态 |
| GET/POST /api/notes | 笔记CRUD |
| POST /api/notes/:id/metrics | 回填数据 |
| GET /api/dashboard/overview | 看板概览 |

## 数据库模型

核心表：users, ideas, materials, products, car_brands, car_models, fragrances, content_tasks, published_notes, note_metrics, notifications

## 后续开发 (第二阶段)

- [ ] 内容日历
- [ ] 文案版本历史
- [ ] AI选题生成
- [ ] AI写作辅助
- [ ] 飞书机器人通知
- [ ] 数据导出
