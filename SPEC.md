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
| is_favorite | Boolean | 是否收藏 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

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
- douyin: 抖音博主
- bilibili: B站内容
- competitor: 竞品账号
- car_group: 车友群
- sales_feedback: 销售反馈
- wechat_article: 公众号文章
- other: 其他

## 页面

1. **首页 (/)** - 素材库：搜索 + 筛选 + 列表（表格/卡片双视图）
2. **收藏页 (/favorites)** - 我的收藏
3. **最近新增 (/recent)** - 最近新增素材

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

## 启动方式

### 后端

```bash
cd backend
pip install -r requirements.txt
docker-compose up -d  # 启动 PostgreSQL
uvicorn main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

前端访问: http://localhost:3000
后端 API: http://localhost:8000
