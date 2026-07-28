# OpenAI API 配置

AI 创作台的密钥和模型只在 FastAPI 后端配置，前端不会接触 API Key。

## 1. 安装后端依赖

```powershell
python -m pip install -r backend/requirements.txt
```

## 2. 创建本地配置

项目已按当前中转服务配置好接口地址和文本模型。将项目根目录的 `.env.example` 复制为 `.env` 后，日常只需要填写 API Key：

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.aixhan.com/v1
OPENAI_TEXT_MODEL=gpt-5.5
OPENAI_IMAGE_MODEL=
OPENAI_MAX_OUTPUT_TOKENS=3000
OPENAI_IMAGE_SIZE=1024x1024
OPENAI_IMAGE_QUALITY=medium
```

不要将 `.env` 提交到 Git，也不要使用 `NEXT_PUBLIC_` 暴露这些配置。

`OPENAI_BASE_URL` 指向第三方中转服务，API Key、对话内容和选中的内部素材都会经过该服务。请确认公司允许使用并信任该服务。切换到 OpenAI 官方 API 时，需要同时修改接口地址和账号可用的模型名称。

对话只需要 `OPENAI_API_KEY`。图片生成还需要中转服务支持 OpenAI Images API，并在 `OPENAI_IMAGE_MODEL` 中填写它实际支持的图片模型；留空时页面只启用文本对话。

## 3. 重启后端

```powershell
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

打开 `/ai`。配置正确后，对话和图片生成按钮会自动启用。
