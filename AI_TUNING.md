# AI 写作调试说明

## 调整写作能力

主要提示词位于 `backend/prompts/xiaohongshu_writer.md`。后端会在每次对话请求时重新读取该文件，因此修改写作规则后不需要重启服务。

通过 `.env` 中的 `AI_WRITER_PROMPT_VERSION` 标记提示词版本：

```env
AI_WRITER_PROMPT_VERSION=xiaohongshu-v1
```

每次调整提示词时同步更新版本，便于比较反馈。

## 查看写手反馈

写手可以对本轮 AI 结果标记“有帮助”或“需要改进”，并补充原因。反馈存储在数据库的 `ai_feedback` 表中，包含任务、写手想法、所选素材、AI 输出和提示词版本。

最近反馈可以通过以下接口查看：

```text
GET /api/ai/feedback?limit=50
```

调试时优先分析重复出现的负面反馈，再修改提示词并提升版本号。不要直接把单条用户反馈当作永久规则。
