const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "")

export type MaterialScope = "vehicle" | "general"

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
  })
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event("ruby-rain:unauthorized"))
  }
  return response
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  let message = fallback

  try {
    const payload = await response.json()
    if (typeof payload.detail === "string") message = payload.detail
  } catch {
    // Some endpoints can return an empty or non-JSON error response.
  }

  throw new ApiError(message, response.status)
}

export interface User {
  id: string
  username: string
  display_name: string
  role: "admin" | "writer"
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserCreatePayload {
  username: string
  display_name: string
  password: string
  role: User["role"]
}

export interface UserUpdatePayload {
  display_name?: string
  password?: string
  role?: User["role"]
  is_active?: boolean
}

export async function login(username: string, password: string): Promise<User> {
  const res = await apiFetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) await throwApiError(res, "登录失败")
  return res.json()
}

export async function logout(): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/auth/logout`, { method: "POST" })
  if (!res.ok) await throwApiError(res, "退出登录失败")
}

export async function getCurrentUser(): Promise<User> {
  const res = await apiFetch(`${API_BASE}/api/auth/me`)
  if (!res.ok) await throwApiError(res, "登录状态获取失败")
  return res.json()
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/auth/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  })
  if (!res.ok) await throwApiError(res, "密码修改失败")
}

export async function getUsers(): Promise<User[]> {
  const res = await apiFetch(`${API_BASE}/api/users`)
  if (!res.ok) await throwApiError(res, "用户列表加载失败")
  return res.json()
}

export async function createUser(payload: UserCreatePayload): Promise<User> {
  const res = await apiFetch(`${API_BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, "创建用户失败")
  return res.json()
}

export async function updateUser(id: string, payload: UserUpdatePayload): Promise<User> {
  const res = await apiFetch(`${API_BASE}/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, "用户更新失败")
  return res.json()
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
  source_metadata: MaterialSourceMetadata | null
  is_favorite: boolean
  created_at: string
  updated_at: string
}

export interface MaterialSourceMetadata {
  platform?: string
  note_id?: string
  author_id?: string
  share_text?: string
  resolved_url?: string
  image_count?: number
  video_count?: number
  note_type?: string
  video_duration_seconds?: number
  imported_at?: string
  metrics?: {
    likes?: number
    collections?: number
    comments?: number
    shares?: number
  }
  top_comments?: Array<{
    id: string
    author: string
    content: string
    likes: number
    reply_count: number
  }>
}

export interface XiaohongshuImportResult {
  title: string
  content: string
  summary: string
  author: string
  source_url: string
  tags: string[]
  attachments: Attachment[]
  source_metadata: MaterialSourceMetadata
  warnings: string[]
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

export interface Creation {
  id: string
  title: string
  summary: string | null
  original_content: string | null
  tags: string[]
  attachments: Attachment[]
  ai_conversation: AiConversation
  created_at: string
  updated_at: string
}

export interface CreationsResponse {
  items: Creation[]
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

export type AiTask = "concept" | "title" | "note" | "video" | "rewrite"

export interface AiMessage {
  role: "user" | "assistant"
  content: string
}

export interface AiImageMessage {
  id: string
  role: "user" | "assistant"
  content: string
  reference?: Attachment
  references?: Attachment[]
  image?: Attachment
}

export interface AiImageThread {
  id: string
  title: string
  image_prompt: string
  selected_references: Attachment[]
  generated_images: Attachment[]
  messages: AiImageMessage[]
  created_at: string
  updated_at: string
}

export interface AiTitleCandidate {
  id: string
  category: string
  text: string
  rationale: string
}

export interface AiContentDirection {
  id: string
  name: string
  summary: string
  tone: string
  opening: string
  outline: string[]
}

export interface AiWritingPlan {
  id: string
  understanding: string
  factual_questions: string[]
  titles: AiTitleCandidate[]
  directions: AiContentDirection[]
  recommended_title_id: string
  recommended_direction_ids: string[]
  recommendation_reason: string
  selected_title_id: string | null
  selected_direction_ids: string[]
  created_at: string
}

export interface AiDraftVersion {
  id: string
  title: string
  content: string
  source: string
  created_at: string
}

export interface AiDraft {
  title: string
  content: string
  selected_plan_id: string | null
  selected_title_id: string | null
  selected_direction_ids: string[]
  selected_asset_paths: string[]
  cover_asset_path: string | null
  versions: AiDraftVersion[]
  updated_at: string | null
}

export interface AiConversation {
  version: 1 | 2 | 3
  task: AiTask
  messages: AiMessage[]
  selected_material_ids: string[]
  scope_filter: "all" | MaterialScope
  material_search: string
  brand: string | null
  car_model: string | null
  image_prompt: string
  generated_images: Attachment[]
  image_messages?: AiImageMessage[]
  reference_image_attachment?: Attachment | null
  active_reference_attachment?: Attachment | null
  image_threads?: AiImageThread[]
  active_image_thread_id?: string | null
  uploaded_reference_images?: Attachment[]
  writing_plans?: AiWritingPlan[]
  active_writing_plan_id?: string | null
  draft?: AiDraft
  prompt_version: string | null
  saved_at: string
}

export interface AiStatus {
  sdk_installed: boolean
  chat_configured: boolean
  image_configured: boolean
  text_model: string | null
  image_model: string | null
  prompt_version: string
}

export interface AiChatRequest {
  task: AiTask
  brand?: string
  car_model?: string
  material_ids: string[]
  messages: AiMessage[]
}

function normalizeAiChatRequest(payload: AiChatRequest): AiChatRequest {
  const messages = payload.messages
    .map((message) => ({ ...message, content: message.content.trim().slice(0, 20000) }))
    .filter((message) => message.content.length > 0)
    .slice(-30)

  return {
    ...payload,
    brand: payload.brand?.trim().slice(0, 200),
    car_model: payload.car_model?.trim().slice(0, 200),
    material_ids: payload.material_ids.slice(0, 12),
    messages,
  }
}

export interface AiImageRequest {
  prompt: string
  reference_images: File[]
  reference_attachments: Attachment[]
  history?: string[]
  brand?: string
  car_model?: string
  material_ids: string[]
}

export interface AiImageResult {
  attachment: Attachment
  reference_attachment: Attachment
  reference_attachments: Attachment[]
}

export interface AiReferenceUploadResult {
  attachments: Attachment[]
}

export interface AiFeedbackRequest {
  task: AiTask
  rating: "helpful" | "unhelpful"
  comment?: string
  idea?: string
  assistant_content: string
  material_ids: string[]
  brand?: string
  car_model?: string
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

  const res = await apiFetch(`${API_BASE}/api/materials?${sp.toString()}`)
  if (!res.ok) await throwApiError(res, "素材加载失败，请稍后重试")
  return res.json()
}

export async function getMaterial(id: string): Promise<Material> {
  const res = await apiFetch(`${API_BASE}/api/materials/${id}`)
  if (!res.ok) await throwApiError(res, "素材详情加载失败")
  return res.json()
}

export async function getCreations(params: {
  q?: string
  page?: number
  page_size?: number
} = {}): Promise<CreationsResponse> {
  const sp = new URLSearchParams()
  if (params.q) sp.set("q", params.q)
  if (params.page) sp.set("page", String(params.page))
  if (params.page_size) sp.set("page_size", String(params.page_size))

  const res = await apiFetch(`${API_BASE}/api/creations?${sp.toString()}`)
  if (!res.ok) await throwApiError(res, "我的创作加载失败，请稍后重试")
  return res.json()
}

export async function getCreation(id: string): Promise<Creation> {
  const res = await apiFetch(`${API_BASE}/api/creations/${id}`)
  if (!res.ok) await throwApiError(res, "创作记录加载失败")
  return res.json()
}

export async function createCreation(formData: FormData): Promise<Creation> {
  const res = await apiFetch(`${API_BASE}/api/creations`, {
    method: "POST",
    body: formData,
  })
  if (!res.ok) await throwApiError(res, "保存创作失败，请稍后重试")
  return res.json()
}

export async function updateCreation(id: string, formData: FormData): Promise<Creation> {
  const res = await apiFetch(`${API_BASE}/api/creations/${id}`, {
    method: "PUT",
    body: formData,
  })
  if (!res.ok) await throwApiError(res, "更新创作失败，请稍后重试")
  return res.json()
}

export async function deleteCreation(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/creations/${id}`, {
    method: "DELETE",
  })
  if (!res.ok) await throwApiError(res, "删除创作失败")
}

export async function exportCreationPackage(id: string): Promise<{ blob: Blob; filename: string }> {
  const res = await apiFetch(`${API_BASE}/api/creations/${id}/export`, { method: "POST" })
  if (!res.ok) await throwApiError(res, "发布包导出失败")
  const disposition = res.headers.get("Content-Disposition") || ""
  const encodedFilename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  return {
    blob: await res.blob(),
    filename: encodedFilename ? decodeURIComponent(encodedFilename) : "小红书笔记-发布包.zip",
  }
}

export async function createMaterial(formData: FormData): Promise<Material> {
  const res = await apiFetch(`${API_BASE}/api/materials`, {
    method: "POST",
    body: formData,
  })
  if (!res.ok) await throwApiError(res, "添加素材失败，请检查必填项")
  return res.json()
}

export async function importXiaohongshuMaterial(shareText: string): Promise<XiaohongshuImportResult> {
  const res = await apiFetch(`${API_BASE}/api/import/xiaohongshu`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ share_text: shareText }),
  })
  if (!res.ok) await throwApiError(res, "小红书内容获取失败")
  return res.json()
}

export async function updateMaterial(id: string, formData: FormData): Promise<Material> {
  const res = await apiFetch(`${API_BASE}/api/materials/${id}`, {
    method: "PUT",
    body: formData,
  })
  if (!res.ok) await throwApiError(res, "保存素材失败，请稍后重试")
  return res.json()
}

export async function deleteMaterial(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/materials/${id}`, {
    method: "DELETE",
  })
  if (!res.ok) await throwApiError(res, "删除素材失败")
}

export async function toggleFavorite(id: string): Promise<Material> {
  const res = await apiFetch(`${API_BASE}/api/materials/${id}/favorite`, {
    method: "POST",
  })
  if (!res.ok) await throwApiError(res, "收藏状态更新失败")
  return res.json()
}

export async function getFavorites(page = 1, pageSize = 20): Promise<MaterialsResponse> {
  const res = await apiFetch(`${API_BASE}/api/materials/favorites?page=${page}&page_size=${pageSize}`)
  if (!res.ok) await throwApiError(res, "收藏素材加载失败")
  return res.json()
}

export async function getRecent(limit = 30): Promise<Material[]> {
  const res = await apiFetch(`${API_BASE}/api/materials/recent?limit=${limit}`)
  if (!res.ok) await throwApiError(res, "最近素材加载失败")
  return res.json()
}

export async function getOptions(): Promise<Options> {
  const res = await apiFetch(`${API_BASE}/api/materials/options`)
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

  const res = await apiFetch(`${API_BASE}/api/materials/facets?${sp.toString()}`)
  if (!res.ok) await throwApiError(res, "素材分类统计加载失败")
  return res.json()
}

export async function getAiStatus(): Promise<AiStatus> {
  const res = await apiFetch(`${API_BASE}/api/ai/status`)
  if (!res.ok) await throwApiError(res, "AI 配置状态加载失败")
  return res.json()
}

export async function streamAiChat(
  payload: AiChatRequest,
  onDelta: (delta: string) => void,
  onWarning?: (message: string) => void,
): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizeAiChatRequest(payload)),
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
        type: "delta" | "done" | "progress" | "warning" | "error"
        delta?: string
        message?: string
      }
      if (data.type === "delta" && data.delta) onDelta(data.delta)
      if (data.type === "warning") onWarning?.(data.message || "本次生成未完整结束")
      if (data.type === "error") throw new Error(data.message || "AI 对话请求失败")
    }
  }
}

export async function generateAiWritingPlan(payload: AiChatRequest): Promise<AiWritingPlan> {
  const res = await apiFetch(`${API_BASE}/api/ai/writing-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizeAiChatRequest(payload)),
  })
  if (!res.ok) await throwApiError(res, "AI 创作方案整理失败")
  if (!res.body) throw new Error("浏览器不支持流式响应")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let completedPlan: AiWritingPlan | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split("\n\n")
    buffer = events.pop() || ""
    for (const event of events) {
      const dataLine = event.split("\n").find((line) => line.startsWith("data: "))
      if (!dataLine) continue
      const data = JSON.parse(dataLine.slice(6)) as {
        type: "progress" | "plan" | "error"
        message?: string
        plan?: AiWritingPlan
      }
      if (data.type === "plan" && data.plan) completedPlan = data.plan
      if (data.type === "error") throw new Error(data.message || "AI 创作方案整理失败")
    }
  }

  if (!completedPlan) throw new Error("AI 没有返回可用的创作方案")
  return completedPlan
}

export async function generateAiImage(payload: AiImageRequest): Promise<AiImageResult> {
  const formData = new FormData()
  formData.append("prompt", payload.prompt)
  payload.reference_images.forEach((image) => formData.append("reference_images", image, image.name))
  formData.append("material_ids", JSON.stringify(payload.material_ids))
  formData.append("image_history", JSON.stringify(payload.history || []))
  formData.append("reference_attachments", JSON.stringify(payload.reference_attachments))
  if (payload.brand) formData.append("brand", payload.brand)
  if (payload.car_model) formData.append("car_model", payload.car_model)

  const res = await apiFetch(`${API_BASE}/api/ai/images`, {
    method: "POST",
    body: formData,
  })
  if (!res.ok) await throwApiError(res, "AI 图片生成失败")
  return res.json()
}

export async function uploadAiReferenceImages(files: File[]): Promise<AiReferenceUploadResult> {
  const formData = new FormData()
  files.forEach((file) => formData.append("reference_images", file, file.name))
  const res = await apiFetch(`${API_BASE}/api/ai/image-references`, {
    method: "POST",
    body: formData,
  })
  if (!res.ok) await throwApiError(res, "参考图上传失败")
  return res.json()
}

export async function submitAiFeedback(payload: AiFeedbackRequest): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/ai/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, "AI 反馈提交失败")
}
