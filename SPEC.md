# Ruby Rain 小红书汽车香氛素材库 V1

## 项目定位

内部使用的"小红书汽车香氛素材资产库"，帮助写手收集、分类、快速搜索优质内容素材，作为创作灵感来源。

## 技术栈

- **前端**: Next.js + TypeScript + Tailwind CSS + shadcn/ui
- **后端**: FastAPI + SQLAlchemy
- **数据库**: PostgreSQL (Docker 部署)
- **文件存储**: 本地 `./uploads/` 目录

## 数据库模型

表 `materials`:

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| title | String(500) | 素材标题 |
| brand | String(200) | 品牌，可空 |
| car_model | String(200) | 车型，可空 |
| source_type | String(50) | 来源类型（单选） |
| source_platform | String(100) | 来源平台，可空 |
| author | String(200) | 作者/博主，可空 |
| source_url | String(1000) | 参考链接，可空 |
| content_types | JSON | 内容类型数组（多选） |
| summary | Text | 内容概述 |
| original_content | Text | 原始内容 |
| save_reason | Text | 为什么保存 |
| learning_points | Text | 值得学习点 |
| suggest_title | Text | 建议标题，可空 |
| tags | JSON | 标签数组 |
| attachments | JSON | 附件列表 |
| source_metadata | JSON | 平台导入数据、互动指标和热门评论 |
| is_favorite | Boolean | 旧版兼容字段，不再用于业务判断 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

多用户相关表：

- `users`: 用户名、姓名、密码哈希、管理员/写手角色和启用状态
- `user_sessions`: 服务端登录会话，仅保存会话令牌哈希
- `user_favorites`: 用户与共享素材的收藏关联
- `creations`: AI 创作记录，通过 `user_id` 归属个人

车型素材与灵感素材是团队共享数据；收藏、创作记录和 AI 会话按当前登录用户隔离。

## 内容类型选项

- 用户使用痛点
- 专业知识分享
- 香味分享
- 车型知识
- 产品卖点
- 用户案例
- 爆款参考
- 竞品种草
- 标题灵感
- 视频灵感
- 活动素材

## 来源类型选项

- self_experience: 自家经验
- product资料: 产品资料
- customer_feedback: 客户反馈
- xiaohongshu: 小红书博主

## 小红书素材导入

在素材登记中选择“小红书博主”，粘贴分享链接或完整分享文案，系统会自动回填标题、正文、作者、图片和按点赞数排序的前 10 条评论。首次使用需要在后端环境完成 `xhs login --qrcode`，并确保 `xiaohongshu-cli` 已安装；导入结果仍需写手确认后才保存为共享素材。
- douyin: 抖音博主
- bilibili: B站内容
- competitor: 竞品账号
- car_group: 车友群
- sales_feedback: 销售反馈
- wechat_article: 公众号文章
- other: 其他

## 页面

1. **登录页 (/login)** - 内部账号登录
2. **首页 (/)** - 车型素材：共享搜索、筛选与列表
3. **灵感中心 (/inspiration)** - 团队共享的通用灵感
4. **AI 创作 (/ai)** - 个人 AI 对话与图片创作
5. **我的创作 (/creations)** - 当前用户的创作记录
6. **我的收藏 (/favorites)** - 当前用户收藏的共享素材
7. **用户管理 (/users)** - 管理员创建、编辑和停用账号
8. **账号设置 (/account)** - 修改密码和退出登录

## API

- `GET /api/materials` - 查询素材列表
- `GET /api/materials/{id}` - 获取素材详情
- `POST /api/materials` - 创建素材
- `PUT /api/materials/{id}` - 更新素材
- `DELETE /api/materials/{id}` - 删除素材
- `POST /api/materials/{id}/favorite` - 切换收藏
- `GET /api/materials/favorites` - 获取收藏列表
- `GET /api/materials/recent` - 获取最近新增
- `GET /api/materials/options` - 获取筛选选项
- `POST /api/auth/login` - 登录并创建 HttpOnly Cookie 会话
- `POST /api/auth/logout` - 退出并注销当前会话
- `GET /api/auth/me` - 获取当前用户
- `PUT /api/auth/password` - 修改当前用户密码
- `GET /api/users` - 管理员查看用户
- `POST /api/users` - 管理员创建用户
- `PUT /api/users/{id}` - 管理员编辑、重置密码或停用用户
- `GET /api/creations` - 获取当前用户的创作
- `POST /api/creations` - 保存当前用户的创作

除健康检查和登录接口外，业务 API 均要求登录。

## 启动方式

### 后端

```bash
cd backend
pip install -r requirements.txt
docker-compose up -d  # 启动 PostgreSQL
uvicorn main:app --reload --port 8000
```

首次启动会创建管理员账号。可在根目录 `.env` 中设置：

```bash
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_DISPLAY_NAME=系统管理员
INITIAL_ADMIN_PASSWORD=请设置强密码
FRONTEND_ORIGINS=http://localhost:3000
SESSION_COOKIE_SECURE=false
SESSION_DAYS=14
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

前端访问: http://localhost:3000
后端 API: http://localhost:8000
