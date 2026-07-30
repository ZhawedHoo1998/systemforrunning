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
  role: "admin" | "manager" | "writer"
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

export interface TaskUser {
  id: string
  username: string
  display_name: string
  role: User["role"]
  is_active: boolean
}

export interface RoleTarget {
  role: "studio" | "manager" | "writer"
  metric: string
  target: string
  unit?: string
  notes?: string
}

export interface WeeklyGoal {
  id: string
  title: string
  description: string | null
  week_start: string
  week_end: string
  status: "draft" | "active" | "completed" | "archived"
  role_targets: RoleTarget[]
  task_count: number
  completed_task_count: number
  created_by_user_id: string
  created_at: string
  updated_at: string
}

export interface TaskFeedback {
  id: string
  task_id: string
  user: TaskUser | null
  feedback_type: "progress" | "completion"
  content: string | null
  attachments: Attachment[]
  progress_percent: number | null
  actual_metric_value: number | null
  created_at: string
}

export interface WorkTask {
  id: string
  weekly_goal_id: string | null
  weekly_goal: WeeklyGoal | null
  title: string
  description: string | null
  category: string | null
  priority: "urgent" | "high" | "normal" | "low"
  status: "todo" | "in_progress" | "completed" | "cancelled"
  timing_state: "overdue" | "due_today" | "due_soon" | "scheduled" | "completed" | "cancelled"
  assignee: TaskUser | null
  created_by: TaskUser | null
  start_at: string | null
  due_at: string
  target_metric_label: string | null
  target_metric_value: number | null
  metric_unit: string | null
  actual_metric_value: number | null
  feedback_required: boolean
  feedback_count: number
  latest_progress_percent: number | null
  feedbacks?: TaskFeedback[]
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface TaskSummary {
  total_active: number
  overdue: number
  due_today: number
  urgent_high: number
  completed_this_week: number
  notification_count: number
  notifications: Array<{
    task_id: string
    title: string
    priority: WorkTask["priority"]
    timing_state: WorkTask["timing_state"]
    due_at: string
    message: string
  }>
}

export interface WeeklyGoalPayload {
  title: string
  description?: string
  week_start: string
  status: WeeklyGoal["status"]
  role_targets: RoleTarget[]
}

export interface WorkTaskPayload {
  weekly_goal_id?: string | null
  title: string
  description?: string
  category?: string
  priority: WorkTask["priority"]
  assignee_user_id: string
  start_at?: string | null
  due_at: string
  target_metric_label?: string
  target_metric_value?: number | null
  metric_unit?: string
  feedback_required: boolean
}

export async function getTaskAssignees(): Promise<TaskUser[]> {
  const res = await apiFetch(`${API_BASE}/api/tasks/assignees`)
  if (!res.ok) await throwApiError(res, "任务负责人加载失败")
  return res.json()
}

export async function getWeeklyGoals(weekStart?: string): Promise<WeeklyGoal[]> {
  const sp = new URLSearchParams()
  if (weekStart) sp.set("week_start", weekStart)
  const res = await apiFetch(`${API_BASE}/api/tasks/goals?${sp.toString()}`)
  if (!res.ok) await throwApiError(res, "周目标加载失败")
  return res.json()
}

export async function createWeeklyGoal(payload: WeeklyGoalPayload): Promise<WeeklyGoal> {
  const res = await apiFetch(`${API_BASE}/api/tasks/goals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, "周目标创建失败")
  return res.json()
}

export async function updateWeeklyGoal(id: string, payload: Partial<WeeklyGoalPayload>): Promise<WeeklyGoal> {
  const res = await apiFetch(`${API_BASE}/api/tasks/goals/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, "周目标更新失败")
  return res.json()
}

export async function getTaskSummary(mineOnly = false): Promise<TaskSummary> {
  const res = await apiFetch(`${API_BASE}/api/tasks/summary?mine_only=${mineOnly}`)
  if (!res.ok) await throwApiError(res, "任务提醒加载失败")
  return res.json()
}

export async function getTasks(params: {
  mine_only?: boolean
  status?: string
  weekly_goal_id?: string
  assignee_user_id?: string
} = {}): Promise<WorkTask[]> {
  const sp = new URLSearchParams()
  if (params.mine_only !== undefined) sp.set("mine_only", String(params.mine_only))
  if (params.status) sp.set("status", params.status)
  if (params.weekly_goal_id) sp.set("weekly_goal_id", params.weekly_goal_id)
  if (params.assignee_user_id) sp.set("assignee_user_id", params.assignee_user_id)
  const res = await apiFetch(`${API_BASE}/api/tasks?${sp.toString()}`)
  if (!res.ok) await throwApiError(res, "任务列表加载失败")
  return res.json()
}

export async function getTask(id: string): Promise<WorkTask> {
  const res = await apiFetch(`${API_BASE}/api/tasks/${id}`)
  if (!res.ok) await throwApiError(res, "任务详情加载失败")
  return res.json()
}

export async function createWorkTask(payload: WorkTaskPayload): Promise<WorkTask> {
  const res = await apiFetch(`${API_BASE}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, "任务创建失败")
  return res.json()
}

export async function submitPlatformSuggestion(payload: {
  content: string
  source_path?: string
}): Promise<WorkTask> {
  const res = await apiFetch(`${API_BASE}/api/tasks/platform-suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, "建议提交失败")
  return res.json()
}

export async function updateWorkTask(id: string, payload: Partial<WorkTaskPayload> & { status?: WorkTask["status"] }): Promise<WorkTask> {
  const res = await apiFetch(`${API_BASE}/api/tasks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, "任务更新失败")
  return res.json()
}

export async function updateWorkTaskStatus(id: string, status: "todo" | "in_progress"): Promise<WorkTask> {
  const res = await apiFetch(`${API_BASE}/api/tasks/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) await throwApiError(res, "任务状态更新失败")
  return res.json()
}

export async function submitTaskFeedback(id: string, payload: {
  content?: string
  progress_percent?: number
  actual_metric_value?: number
  complete: boolean
  files: File[]
}): Promise<WorkTask> {
  const formData = new FormData()
  if (payload.content) formData.append("content", payload.content)
  if (payload.progress_percent !== undefined) formData.append("progress_percent", String(payload.progress_percent))
  if (payload.actual_metric_value !== undefined) formData.append("actual_metric_value", String(payload.actual_metric_value))
  formData.append("complete", String(payload.complete))
  payload.files.forEach((file) => formData.append("files", file, file.name))
  const res = await apiFetch(`${API_BASE}/api/tasks/${id}/feedback`, { method: "POST", body: formData })
  if (!res.ok) await throwApiError(res, "任务反馈提交失败")
  return res.json()
}

export interface CreatorAccountSampleNote {
  id: string
  title: string
  content: string
  cover_url: string
  source_url: string
  note_type: string
  is_private: boolean
  liked_count: number
  comment_count: number
  collected_count: number
  share_count: number
  engagement_score?: number
  save_like_ratio?: number
  tags: string[]
  published_at: string | null
  first_seen_at: string | null
  last_seen_at: string | null
  image_count?: number
  has_video?: boolean
  detail_archived?: boolean
  media_archived?: boolean
  attachments?: Attachment[]
}

export interface CreatorMonitoringNote {
  id: string
  title: string
  source_url: string
  published_at: string
  liked_count: number
  collected_count: number
  comment_count: number
  share_count: number
  interactions: number
  delta: {
    liked_count: number
    collected_count: number
    comment_count: number
    share_count: number
    interactions: number
  }
  is_high_performing: boolean
  should_alert: boolean
}

export interface CreatorMonitoringAnalysis {
  version: number
  window_days: number
  window_start: string
  window_end: string
  last_run_at: string
  data_source: "cli" | "tikhub" | null
  pages_fetched: number
  notes_checked: number
  coverage_complete: boolean
  post_count: number
  followers: number
  follower_delta: number
  totals: {
    liked_count: number
    collected_count: number
    comment_count: number
    share_count: number
    interactions: number
  }
  deltas: {
    liked_count: number
    collected_count: number
    comment_count: number
    share_count: number
    interactions: number
  }
  averages: {
    liked_count: number
    collected_count: number
    comment_count: number
    share_count: number
    interactions: number
  }
  high_performing_count: number
  high_performing_notes: CreatorMonitoringNote[]
  top_notes: CreatorMonitoringNote[]
  generated_alert_count: number
}

export interface CreatorHistoryArchive {
  status?: "queued" | "running" | "complete" | "partial" | "failed"
  stage?: "listing" | "details" | "media" | "complete"
  total_notes?: number
  body_note_count?: number
  missing_body_count?: number
  detail_note_count?: number
  missing_detail_count?: number
  detail_total?: number
  detail_completed?: number
  detail_failed?: number
  pages_fetched?: number
  has_more?: boolean
  page_limit_reached?: boolean
  last_progress_at?: string
  detail_errors?: string[]
  media_note_count?: number
  missing_media_count?: number
  local_image_count?: number
  local_video_count?: number
  media_total?: number
  media_completed?: number
  media_failed?: number
  media_errors?: string[]
  source?: "cli" | "tikhub"
  started_at?: string
  completed_at?: string | null
  error?: string | null
}

export interface CreatorAccountAnalysis {
  version?: number
  sample_count?: number
  body_sample_count?: number
  average_title_length?: number
  average_body_length?: number
  average_paragraphs?: number
  average_likes?: number
  average_collections?: number
  average_comments?: number
  average_shares?: number
  average_save_like_ratio?: number
  data_source?: "cli" | "tikhub"
  pages_fetched?: number
  synced_note_count?: number
  public_note_count?: number
  body_note_count?: number
  last_sync_new_or_updated?: number
  data_scope?: "public"
  has_more?: boolean
  page_limit_reached?: boolean
  positioning_summary?: string
  style_summary?: string
  hook_patterns?: Array<{ name: string; count: number; ratio: number }>
  top_topics?: Array<{ name: string; count: number }>
  top_notes?: Array<{
    id: string
    title: string
    liked_count: number
    comment_count: number
    collected_count: number
    share_count?: number
  }>
  profile_metrics?: {
    followers?: number
    following?: number
    total_engagement?: number
    note_count?: number
  }
  warnings?: string[]
  monitoring_7d?: CreatorMonitoringAnalysis
  history_archive?: CreatorHistoryArchive
}

export interface CreatorAccount {
  id: string
  name: string
  xhs_user_id: string
  account_kind: "owned" | "competitor"
  data_source: "auto" | "cli" | "tikhub"
  last_sync_source: "cli" | "tikhub" | null
  last_sync_status: "never" | "success" | "failed"
  last_sync_error: string | null
  synced_note_count: number
  red_id: string | null
  nickname: string | null
  avatar_url: string | null
  profile_url: string | null
  bio: string | null
  ip_location: string | null
  positioning: string | null
  target_audience: string | null
  tone_style: string | null
  content_pillars: string[]
  title_guidelines: string | null
  body_guidelines: string | null
  conversion_goal: string | null
  prohibited_terms: string | null
  profile_data: Record<string, unknown>
  sample_notes: CreatorAccountSampleNote[]
  analysis: CreatorAccountAnalysis
  is_active: boolean
  last_analyzed_at: string | null
  created_at: string
  updated_at: string
}

export interface CreatorAccountPayload {
  name: string
  xhs_user_id: string
  account_kind: CreatorAccount["account_kind"]
  data_source: CreatorAccount["data_source"]
  positioning?: string
  target_audience?: string
  tone_style?: string
  content_pillars: string[]
  title_guidelines?: string
  body_guidelines?: string
  conversion_goal?: string
  prohibited_terms?: string
  is_active: boolean
}

export async function getCreatorAccounts(
  activeOnly = false,
  accountKind?: CreatorAccount["account_kind"],
): Promise<CreatorAccount[]> {
  const sp = new URLSearchParams({ active_only: String(activeOnly) })
  if (accountKind) sp.set("account_kind", accountKind)
  const res = await apiFetch(`${API_BASE}/api/creator-accounts?${sp.toString()}`)
  if (!res.ok) await throwApiError(res, "创作账号加载失败")
  return res.json()
}

export async function createCreatorAccount(payload: CreatorAccountPayload): Promise<CreatorAccount> {
  const res = await apiFetch(`${API_BASE}/api/creator-accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, "创作账号创建失败")
  return res.json()
}

export async function updateCreatorAccount(
  id: string,
  payload: Partial<CreatorAccountPayload>,
): Promise<CreatorAccount> {
  const res = await apiFetch(`${API_BASE}/api/creator-accounts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, "创作账号更新失败")
  return res.json()
}

export async function analyzeCreatorAccount(
  id: string,
  options: { source?: CreatorAccount["data_source"]; max_pages?: number } = {},
): Promise<CreatorAccount> {
  const sp = new URLSearchParams()
  if (options.source) sp.set("source", options.source)
  if (options.max_pages) sp.set("max_pages", String(options.max_pages))
  const suffix = sp.size ? `?${sp.toString()}` : ""
  const res = await apiFetch(`${API_BASE}/api/creator-accounts/${id}/analyze${suffix}`, { method: "POST" })
  if (!res.ok) await throwApiError(res, "账号数据同步与分析失败")
  return res.json()
}

export async function archiveCreatorAccount(id: string): Promise<CreatorAccount> {
  const res = await apiFetch(`${API_BASE}/api/creator-accounts/${id}/archive`, { method: "POST" })
  if (!res.ok) await throwApiError(res, "账号历史帖子归档失败")
  return res.json()
}

export interface CreatorAccountNotesResponse {
  items: CreatorAccountSampleNote[]
  total: number
  body_count: number
  page: number
  page_size: number
}

export interface XhsPublicDataStatus {
  cli_installed: boolean
  cli_path: string | null
  cli_authenticated: boolean
  cli_user: { id: string; name: string; red_id: string } | null
  tikhub_configured: boolean
  default_source: CreatorAccount["data_source"]
  default_max_pages: number
  public_data_scope: boolean
  private_analytics_configured: boolean
  daily_monitor: {
    enabled: boolean
    timezone: string
    hour: number
    time_label: string
    max_pages: number
    source: CreatorAccount["data_source"]
    strategy: "tikhub_metrics_cli_fallback" | "cli_only" | "tikhub_only"
    window_days: number
    detail_notes: number
    next_run_at: string
  }
}

export async function getXhsPublicDataStatus(): Promise<XhsPublicDataStatus> {
  const res = await apiFetch(`${API_BASE}/api/creator-accounts/status/public-data`)
  if (!res.ok) await throwApiError(res, "小红书公开数据源状态加载失败")
  return res.json()
}

export async function getCreatorAccountNotes(
  id: string,
  params: {
    sort?: "published_at" | "engagement" | "likes" | "collections" | "comments"
    order?: "asc" | "desc"
    q?: string
    page?: number
    page_size?: number
  } = {},
): Promise<CreatorAccountNotesResponse> {
  const sp = new URLSearchParams()
  if (params.sort) sp.set("sort", params.sort)
  if (params.order) sp.set("order", params.order)
  if (params.q) sp.set("q", params.q)
  if (params.page) sp.set("page", String(params.page))
  if (params.page_size) sp.set("page_size", String(params.page_size))
  const res = await apiFetch(`${API_BASE}/api/creator-accounts/${id}/notes?${sp.toString()}`)
  if (!res.ok) await throwApiError(res, "账号笔记加载失败")
  return res.json()
}

export async function archiveCreatorAccountNoteMedia(
  accountId: string,
  noteId: string,
): Promise<CreatorAccountSampleNote> {
  const res = await apiFetch(
    `${API_BASE}/api/creator-accounts/${encodeURIComponent(accountId)}/notes/${encodeURIComponent(noteId)}/archive-media`,
    { method: "POST" },
  )
  if (!res.ok) await throwApiError(res, "旧帖图片保存失败")
  return res.json()
}

export interface CreatorDiscoveryCandidate {
  user_id: string
  red_id: string
  nickname: string
  avatar_url: string
  keywords: string[]
  matched_notes: number
  total_likes: number
  total_collections: number
  total_comments: number
  score: number
  sample_notes: Array<{
    id: string
    title: string
    liked_count: number
    collected_count: number
  }>
}

export interface CreatorDiscoveryResult {
  source: "cli" | "tikhub"
  keywords: string[]
  candidates: CreatorDiscoveryCandidate[]
  warnings: string[]
}

export async function discoverCreatorAccounts(payload: {
  keywords: string[]
  source: CreatorAccount["data_source"]
  pages_per_keyword: number
}): Promise<CreatorDiscoveryResult> {
  const res = await apiFetch(`${API_BASE}/api/creator-accounts/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await throwApiError(res, "对标账号发现失败")
  return res.json()
}

export interface AccountMonitorRun {
  id: string
  account_id: string
  monitor_date: string
  status: "running" | "success" | "failed"
  data_source: "cli" | "tikhub" | null
  pages_fetched: number
  notes_checked: number
  analysis: CreatorMonitoringAnalysis | Record<string, never>
  error: string | null
  started_at: string | null
  completed_at: string | null
}

export interface AccountMonitoringStatus {
  schedule: XhsPublicDataStatus["daily_monitor"]
  accounts: Array<{
    account_id: string
    account_name: string
    latest_run: AccountMonitorRun | null
  }>
}

export async function getAccountMonitoringStatus(): Promise<AccountMonitoringStatus> {
  const res = await apiFetch(`${API_BASE}/api/account-monitoring/status`)
  if (!res.ok) await throwApiError(res, "账号每日监测状态加载失败")
  return res.json()
}

export async function runAccountMonitoring(accountId: string): Promise<AccountMonitorRun> {
  const res = await apiFetch(`${API_BASE}/api/account-monitoring/run/${accountId}`, { method: "POST" })
  if (!res.ok) await throwApiError(res, "账号每日监测执行失败")
  return res.json()
}

export interface CreatorPerformanceAlert {
  id: string
  account_id: string
  account_name: string
  note_id: string
  title: string
  message: string
  source_url: string | null
  metrics: CreatorMonitoringNote
  created_at: string
}

export interface CreatorPerformanceAlertsResponse {
  count: number
  items: CreatorPerformanceAlert[]
}

export async function getCreatorPerformanceAlerts(): Promise<CreatorPerformanceAlertsResponse> {
  const res = await apiFetch(`${API_BASE}/api/account-monitoring/alerts`)
  if (!res.ok) await throwApiError(res, "账号表现提醒加载失败")
  return res.json()
}

export async function markCreatorPerformanceAlertsSeen(alertIds: string[]): Promise<void> {
  if (alertIds.length === 0) return
  const res = await apiFetch(`${API_BASE}/api/account-monitoring/alerts/seen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alert_ids: alertIds }),
  })
  if (!res.ok) await throwApiError(res, "账号表现提醒确认失败")
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

export interface DailyMaterialNotifications {
  date: string
  count: number
  items: Material[]
  has_more: boolean
  cutoff: string
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
  collage?: AiCollageSettings
}

export type AiImageMode = "ai" | "collage"

export type AiCollageTemplate =
  | "hero_headline"
  | "split_compare"
  | "story_triptych"
  | "detail_grid"
  | "review_card"

export interface AiCollageSettings {
  template: AiCollageTemplate
  title: string
  subtitle: string
  background_color: string
  text_color: string
}

export interface AiImageThread {
  id: string
  title: string
  mode: AiImageMode
  image_prompt: string
  collage: AiCollageSettings
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
  content_type?: string
  conversion_strength?: string
  summary: string
  tone: string
  opening: string
  outline: string[]
}

export interface AiCoverSuggestion {
  id: string
  type: string
  headline: string
  visual: string
  rationale: string
}

export interface AiTestingAdvice {
  primary_goal: string
  pre_publish_checks: string[]
  success_signals: string[]
  iteration_actions: string[]
}

export interface AiWritingPlan {
  id: string
  understanding: string
  factual_questions: string[]
  titles: AiTitleCandidate[]
  directions: AiContentDirection[]
  cover_suggestions?: AiCoverSuggestion[]
  testing_advice?: AiTestingAdvice
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
  version: 1 | 2 | 3 | 4 | 5 | 6
  task: AiTask
  creator_account_id?: string | null
  selected_creator_note_ids?: string[]
  selected_creator_notes?: CreatorAccountSampleNote[]
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
  chat_model: string | null
  plan_model: string | null
  text_model: string | null
  image_model: string | null
  prompt_version: string
}

export interface AiChatRequest {
  task: AiTask
  creator_account_id?: string
  brand?: string
  car_model?: string
  material_ids: string[]
  creator_note_ids?: string[]
  messages: AiMessage[]
}

function normalizeAiChatRequest(payload: AiChatRequest): AiChatRequest {
  const messages = payload.messages
    .map((message) => ({ ...message, content: message.content.trim().slice(0, 20000) }))
    .filter((message) => message.content.length > 0)
    .slice(-30)

  return {
    ...payload,
    creator_account_id: payload.creator_account_id || undefined,
    brand: payload.brand?.trim().slice(0, 200),
    car_model: payload.car_model?.trim().slice(0, 200),
    material_ids: payload.material_ids.slice(0, 12),
    creator_note_ids: payload.creator_note_ids?.slice(0, 20),
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
  creator_account_id?: string
  creator_note_ids?: string[]
}

export interface AiImageResult {
  attachment: Attachment
  reference_attachment: Attachment
  reference_attachments: Attachment[]
}

export interface AiCollageRequest {
  reference_images: File[]
  reference_attachments: Attachment[]
  settings: AiCollageSettings
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
  const material = await res.json()
  if (typeof window !== "undefined") window.dispatchEvent(new Event("ruby-rain:material-created"))
  return material
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

export async function getDailyMaterialNotifications(): Promise<DailyMaterialNotifications> {
  const res = await apiFetch(`${API_BASE}/api/materials/notifications/daily`)
  if (!res.ok) await throwApiError(res, "每日新增素材提醒加载失败")
  return res.json()
}

export async function markDailyMaterialNotificationsSeen(seenThrough: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/materials/notifications/daily/seen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seen_through: seenThrough }),
  })
  if (!res.ok) await throwApiError(res, "素材提醒确认失败")
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

export async function generateAiWritingPlan(
  payload: AiChatRequest,
  onProgress?: (message: string) => void,
): Promise<AiWritingPlan> {
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
      if (data.type === "progress" && data.message) onProgress?.(data.message)
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
  formData.append("creator_note_ids", JSON.stringify(payload.creator_note_ids || []))
  formData.append("image_history", JSON.stringify(payload.history || []))
  formData.append("reference_attachments", JSON.stringify(payload.reference_attachments))
  if (payload.brand) formData.append("brand", payload.brand)
  if (payload.car_model) formData.append("car_model", payload.car_model)
  if (payload.creator_account_id) formData.append("creator_account_id", payload.creator_account_id)

  const res = await apiFetch(`${API_BASE}/api/ai/images`, {
    method: "POST",
    body: formData,
  })
  if (!res.ok) await throwApiError(res, "AI 图片生成失败")
  return res.json()
}

export async function generateAiCollage(payload: AiCollageRequest): Promise<AiImageResult> {
  const formData = new FormData()
  payload.reference_images.forEach((image) => formData.append("reference_images", image, image.name))
  formData.append("reference_attachments", JSON.stringify(payload.reference_attachments))
  formData.append("template", payload.settings.template)
  formData.append("title", payload.settings.title)
  formData.append("subtitle", payload.settings.subtitle)
  formData.append("background_color", payload.settings.background_color)
  formData.append("text_color", payload.settings.text_color)

  const res = await apiFetch(`${API_BASE}/api/ai/collages`, {
    method: "POST",
    body: formData,
  })
  if (!res.ok) await throwApiError(res, "拼图生成失败")
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
