const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export type MaterialScope = "vehicle" | "general"

async function throwApiError(response: Response, fallback: string): Promise<never> {
  let message = fallback

  try {
    const payload = await response.json()
    if (typeof payload.detail === "string") message = payload.detail
  } catch {
    // Some endpoints can return an empty or non-JSON error response.
  }

  throw new Error(message)
}

export interface Material {
  id: string
  title: string
  material_scope: MaterialScope
  brand: string | null
  car_model: string | null
  source_type: string
  source_platform: string | null
  author: string | null
  source_url: string | null
  content_types: string[]
  summary: string | null
  original_content: string | null
  save_reason: string | null
  learning_points: string | null
  suggest_title: string | null
  tags: string[]
  attachments: Attachment[]
  is_favorite: boolean
  created_at: string
  updated_at: string
}

export interface Attachment {
  name: string
  path: string
  type: string
  size?: number
}

export interface MaterialsResponse {
  items: Material[]
  total: number
  page: number
  page_size: number
}

export interface MaterialFacets {
  total: number
  content_types: Record<string, number>
}

export interface Options {
  brands: string[]
  car_models: string[]
  vehicles: VehicleOption[]
  source_types: [string, string][]
  content_types: string[]
  content_type_groups: Record<MaterialScope, string[]>
}

export interface VehicleOption {
  brand: string
  car_model: string
}

export type AiTask = "title" | "note" | "video" | "rewrite"

export interface AiMessage {
  role: "user" | "assistant"
  content: string
}

export interface AiStatus {
  sdk_installed: boolean
  chat_configured: boolean
  image_configured: boolean
  text_model: string | null
  image_model: string | null
}

export interface AiChatRequest {
  task: AiTask
  brand?: string
  car_model?: string
  material_ids: string[]
  messages: AiMessage[]
}

export interface AiImageRequest {
  prompt: string
  brand?: string
  car_model?: string
  material_ids: string[]
}

export async function getMaterials(params: {
  q?: string
  material_scope?: MaterialScope
  brand?: string
  car_model?: string
  source_type?: string
  content_types?: string[]
  is_favorite?: boolean
  sort?: string
  order?: string
  page?: number
  page_size?: number
}): Promise<MaterialsResponse> {
  const sp = new URLSearchParams()
  if (params.q) sp.set("q", params.q)
  if (params.material_scope) sp.set("material_scope", params.material_scope)
  if (params.brand) sp.set("brand", params.brand)
  if (params.car_model) sp.set("car_model", params.car_model)
  if (params.source_type) sp.set("source_type", params.source_type)
  if (params.content_types?.length) sp.set("content_types", params.content_types.join(","))
  if (params.is_favorite !== undefined) sp.set("is_favorite", String(params.is_favorite))
  if (params.sort) sp.set("sort", params.sort)
  if (params.order) sp.set("order", params.order)
  if (params.page) sp.set("page", String(params.page))
  if (params.page_size) sp.set("page_size", String(params.page_size))

  const res = await fetch(`${API_BASE}/api/materials?${sp.toString()}`)
  if (!res.ok) await throwApiError(res, "素材加载失败，请稍后重试")
  return res.json()
}

export async function getMaterial(id: string): Promise<Material> {
  const res = await fetch(`${API_BASE}/api/materials/${id}`)
  if (!res.ok) await throwApiError(res, "素材详情加载失败")
  return res.json()
}

export async function createMaterial(formData: FormData): Promise<Material> {
  const res = await fetch(`${API_BASE}/api/materials`, {
    method: "POST",
    body: formData,
  })
  if (!res.ok) await throwApiError(res, "添加素材失败，请检查必填项")
  return res.json()
}

export async function updateMaterial(id: string, formData: FormData): Promise<Material> {
  const res = await fetch(`${API_BASE}/api/materials/${id}`, {
    method: "PUT",
    body: formData,
  })
  if (!res.ok) await throwApiError(res, "保存素材失败，请稍后重试")
  return res.json()
}

export async function deleteMaterial(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/materials/${id}`, {
    method: "DELETE",
  })
  if (!res.ok) await throwApiError(res, "删除素材失败")
}

export async function toggleFavorite(id: string): Promise<Material> {
  const res = await fetch(`${API_BASE}/api/materials/${id}/favorite`, {
    method: "POST",
  })
  if (!res.ok) await throwApiError(res, "收藏状态更新失败")
  return res.json()
}

export async function getFavorites(page = 1, pageSize = 20): Promise<MaterialsResponse> {
  const res = await fetch(`${API_BASE}/api/materials/favorites?page=${page}&page_size=${pageSize}`)
  if (!res.ok) await throwApiError(res, "收藏素材加载失败")
  return res.json()
}

export async function getRecent(limit = 30): Promise<Material[]> {
  const res = await fetch(`${API_BASE}/api/materials/recent?limit=${limit}`)
  if (!res.ok) await throwApiError(res, "最近素材加载失败")
  return res.json()
}

export async function getOptions(): Promise<Options> {
  const res = await fetch(`${API_BASE}/api/materials/options`)
  if (!res.ok) await throwApiError(res, "筛选项加载失败")
  return res.json()
}

export async function getMaterialFacets(params: {
  material_scope: MaterialScope
  brand?: string
  car_model?: string
}): Promise<MaterialFacets> {
  const sp = new URLSearchParams({ material_scope: params.material_scope })
  if (params.brand) sp.set("brand", params.brand)
  if (params.car_model) sp.set("car_model", params.car_model)

  const res = await fetch(`${API_BASE}/api/materials/facets?${sp.toString()}`)
  if (!res.ok) await throwApiError(res, "素材分类统计加载失败")
  return res.json()
}

export async function getAiStatus(): Promise<AiStatus> {
  const res = await fetch(`${API_BASE}/api/ai/status`)
  if (!res.ok) await throwApiError(res, "AI 配置状态加载失败")
  return res.json()
}

export async function streamAiChat(
  payload: AiChatRequest,
  onDelta: (delta: string) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, "AI 对话请求失败")
  if (!res.body) throw new Error("浏览器不支持流式响应")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split("\n\n")
    buffer = events.pop() ?? ""

    for (const event of events) {
      const dataLine = event.split("\n").find((line) => line.startsWith("data: "))
      if (!dataLine) continue
      const data = JSON.parse(dataLine.slice(6)) as {
        type: "delta" | "done" | "error"
        delta?: string
        message?: string
      }
      if (data.type === "delta" && data.delta) onDelta(data.delta)
      if (data.type === "error") throw new Error(data.message || "AI 对话请求失败")
    }
  }
}

export async function generateAiImage(payload: AiImageRequest): Promise<Attachment> {
  const res = await fetch(`${API_BASE}/api/ai/images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, "AI 图片生成失败")
  const result = await res.json() as { attachment: Attachment }
  return result.attachment
}
