"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Clock3,
  FileUp,
  LoaderCircle,
  Pencil,
  Plus,
  Send,
  Target,
  Trash2,
} from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { Header } from "@/components/Header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  createWeeklyGoal,
  createWorkTask,
  getTask,
  getTaskAssignees,
  getTaskSummary,
  getTasks,
  getWeeklyGoals,
  submitTaskFeedback,
  updateWeeklyGoal,
  updateWorkTask,
  updateWorkTaskStatus,
  type RoleTarget,
  type TaskSummary,
  type TaskUser,
  type WeeklyGoal,
  type WeeklyGoalPayload,
  type WorkTask,
  type WorkTaskPayload,
} from "@/lib/api"
import { cn } from "@/lib/utils"


type TaskView = "mine" | "all" | "goals"
type StatusFilter = "active" | "completed" | "all"

const PRIORITY_META: Record<WorkTask["priority"], { label: string; className: string }> = {
  urgent: { label: "紧急", className: "border-red-200 bg-red-50 text-red-700" },
  high: { label: "高", className: "border-amber-200 bg-amber-50 text-amber-800" },
  normal: { label: "普通", className: "border-slate-200 bg-slate-50 text-slate-700" },
  low: { label: "低", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
}

const STATUS_META: Record<WorkTask["status"], { label: string; className: string }> = {
  todo: { label: "待开始", className: "text-muted-foreground" },
  in_progress: { label: "进行中", className: "text-blue-700" },
  completed: { label: "已完成", className: "text-emerald-700" },
  cancelled: { label: "已取消", className: "text-muted-foreground" },
}

const TIMING_META: Record<WorkTask["timing_state"], { label: string; className: string }> = {
  overdue: { label: "已逾期", className: "text-red-700" },
  due_today: { label: "今日截止", className: "text-amber-800" },
  due_soon: { label: "24 小时内", className: "text-amber-700" },
  scheduled: { label: "按计划", className: "text-muted-foreground" },
  completed: { label: "已完成", className: "text-emerald-700" },
  cancelled: { label: "已取消", className: "text-muted-foreground" },
}

const ROLE_LABELS: Record<RoleTarget["role"], string> = {
  studio: "工作室",
  manager: "运营管理",
  writer: "写手",
}

const CATEGORY_OPTIONS = ["内容产出", "选题策划", "素材建设", "发布运营", "数据复盘", "商业转化", "协作审核", "平台改进"]

const RECOMMENDED_TARGETS: RoleTarget[] = [
  { role: "studio", metric: "本周有效内容产出", target: "15", unit: "篇" },
  { role: "studio", metric: "按时交付率", target: "90", unit: "%" },
  { role: "manager", metric: "周选题与排期完成率", target: "100", unit: "%" },
  { role: "manager", metric: "发布后数据复盘", target: "1", unit: "次/周" },
  { role: "writer", metric: "个人文案交付", target: "5", unit: "篇/周" },
  { role: "writer", metric: "初稿一次通过率", target: "80", unit: "%" },
]

function mondayOf(value = new Date()) {
  const result = new Date(value)
  const day = result.getDay() || 7
  result.setDate(result.getDate() - day + 1)
  const year = result.getFullYear()
  const month = String(result.getMonth() + 1).padStart(2, "0")
  const date = String(result.getDate()).padStart(2, "0")
  return `${year}-${month}-${date}`
}

function defaultDueAt() {
  const result = new Date()
  if (result.getHours() >= 18) result.setDate(result.getDate() + 1)
  result.setHours(18, 0, 0, 0)
  const offset = result.getTimezoneOffset() * 60_000
  return new Date(result.getTime() - offset).toISOString().slice(0, 16)
}

function toDatetimeLocal(value: string | null) {
  if (!value) return ""
  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) return value.slice(0, 16)
  const result = new Date(value)
  const offset = result.getTimezoneOffset() * 60_000
  return new Date(result.getTime() - offset).toISOString().slice(0, 16)
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function roleName(role: TaskUser["role"]) {
  return role === "admin" ? "管理员" : role === "manager" ? "运营管理" : "写手"
}

const EMPTY_GOAL: WeeklyGoalPayload = {
  title: "",
  description: "",
  week_start: mondayOf(),
  status: "active",
  role_targets: RECOMMENDED_TARGETS,
}

const EMPTY_TASK: WorkTaskPayload = {
  weekly_goal_id: null,
  title: "",
  description: "",
  category: "内容产出",
  priority: "normal",
  assignee_user_id: "",
  start_at: null,
  due_at: defaultDueAt(),
  target_metric_label: "",
  target_metric_value: null,
  metric_unit: "",
  feedback_required: true,
}

export default function TasksPage() {
  const { user } = useAuth()
  const canManage = user?.role === "admin" || user?.role === "manager"
  const [view, setView] = useState<TaskView>("mine")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active")
  const [assigneeFilter, setAssigneeFilter] = useState("")
  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [goals, setGoals] = useState<WeeklyGoal[]>([])
  const [assignees, setAssignees] = useState<TaskUser[]>([])
  const [summary, setSummary] = useState<TaskSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<WeeklyGoal | null>(null)
  const [goalForm, setGoalForm] = useState<WeeklyGoalPayload>(EMPTY_GOAL)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<WorkTask | null>(null)
  const [taskForm, setTaskForm] = useState<WorkTaskPayload>(EMPTY_TASK)
  const [saving, setSaving] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<WorkTask | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [feedbackContent, setFeedbackContent] = useState("")
  const [feedbackProgress, setFeedbackProgress] = useState(50)
  const [feedbackMetric, setFeedbackMetric] = useState("")
  const [feedbackFiles, setFeedbackFiles] = useState<File[]>([])
  const [feedbackSaving, setFeedbackSaving] = useState(false)

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError("")
    const mineOnly = view !== "all"
    const status = statusFilter === "active"
      ? "todo,in_progress"
      : statusFilter === "completed" ? "completed" : undefined
    try {
      const [taskResults, goalResults, summaryResult, assigneeResults] = await Promise.all([
        getTasks({
          mine_only: mineOnly,
          status,
          assignee_user_id: view === "all" ? assigneeFilter || undefined : undefined,
        }),
        getWeeklyGoals(),
        getTaskSummary(mineOnly),
        canManage ? getTaskAssignees() : Promise.resolve([]),
      ])
      setTasks(taskResults)
      setGoals(goalResults)
      setSummary(summaryResult)
      setAssignees(assigneeResults)
      window.dispatchEvent(new CustomEvent("ruby-rain:tasks-updated", {
        detail: summaryResult.notification_count,
      }))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "任务中心加载失败")
    } finally {
      setLoading(false)
    }
  }, [assigneeFilter, canManage, statusFilter, user, view])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const activeGoals = useMemo(
    () => goals.filter((goal) => goal.status === "active" || goal.status === "draft"),
    [goals]
  )

  const openCreateGoal = () => {
    setEditingGoal(null)
    setGoalForm({ ...EMPTY_GOAL, role_targets: RECOMMENDED_TARGETS.map((target) => ({ ...target })) })
    setError("")
    setGoalDialogOpen(true)
  }

  const openEditGoal = (goal: WeeklyGoal) => {
    setEditingGoal(goal)
    setGoalForm({
      title: goal.title,
      description: goal.description || "",
      week_start: goal.week_start,
      status: goal.status,
      role_targets: goal.role_targets.map((target) => ({ ...target })),
    })
    setError("")
    setGoalDialogOpen(true)
  }

  const openCreateTask = (goalId?: string) => {
    setEditingTask(null)
    setTaskForm({
      ...EMPTY_TASK,
      due_at: defaultDueAt(),
      weekly_goal_id: goalId || activeGoals[0]?.id || null,
      assignee_user_id: assignees.find((candidate) => candidate.role === "writer")?.id || assignees[0]?.id || "",
    })
    setError("")
    setTaskDialogOpen(true)
  }

  const openEditTask = (task: WorkTask) => {
    setEditingTask(task)
    setTaskForm({
      weekly_goal_id: task.weekly_goal_id,
      title: task.title,
      description: task.description || "",
      category: task.category || "内容产出",
      priority: task.priority,
      assignee_user_id: task.assignee?.id || "",
      start_at: toDatetimeLocal(task.start_at),
      due_at: toDatetimeLocal(task.due_at),
      target_metric_label: task.target_metric_label || "",
      target_metric_value: task.target_metric_value,
      metric_unit: task.metric_unit || "",
      feedback_required: true,
    })
    setError("")
    setTaskDialogOpen(true)
  }

  const handleSaveGoal = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      if (editingGoal) {
        await updateWeeklyGoal(editingGoal.id, goalForm)
      } else {
        await createWeeklyGoal(goalForm)
      }
      setGoalDialogOpen(false)
      await loadData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "周目标保存失败")
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTask = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError("")
    const payload: WorkTaskPayload = {
      ...taskForm,
      weekly_goal_id: taskForm.weekly_goal_id || null,
      start_at: taskForm.start_at || null,
      target_metric_value: taskForm.target_metric_value ?? null,
    }
    try {
      if (editingTask) {
        await updateWorkTask(editingTask.id, payload)
      } else {
        await createWorkTask(payload)
      }
      setTaskDialogOpen(false)
      await loadData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "任务保存失败")
    } finally {
      setSaving(false)
    }
  }

  const openTaskDetail = async (taskOrId: WorkTask | string) => {
    const task = typeof taskOrId === "string"
      ? tasks.find((item) => item.id === taskOrId) || null
      : taskOrId
    const taskId = typeof taskOrId === "string" ? taskOrId : taskOrId.id
    setSelectedTask(task)
    setDetailOpen(true)
    setDetailLoading(true)
    setFeedbackContent("")
    setFeedbackProgress(task?.latest_progress_percent ?? (task?.status === "in_progress" ? 50 : 10))
    setFeedbackMetric(task?.actual_metric_value?.toString() || "")
    setFeedbackFiles([])
    setError("")
    try {
      setSelectedTask(await getTask(taskId))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "任务详情加载失败")
    } finally {
      setDetailLoading(false)
    }
  }

  const handleStartTask = async (task: WorkTask) => {
    setError("")
    try {
      await updateWorkTaskStatus(task.id, "in_progress")
      await loadData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "任务状态更新失败")
    }
  }

  const handleSubmitFeedback = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedTask) return
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const complete = submitter?.dataset.complete === "true"
    setFeedbackSaving(true)
    setError("")
    try {
      const updated = await submitTaskFeedback(selectedTask.id, {
        content: feedbackContent.trim() || undefined,
        progress_percent: complete ? 100 : feedbackProgress,
        actual_metric_value: feedbackMetric ? Number(feedbackMetric) : undefined,
        complete,
        files: feedbackFiles,
      })
      setSelectedTask(updated)
      setFeedbackContent("")
      setFeedbackFiles([])
      await loadData()
      if (complete) setDetailOpen(false)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "任务反馈提交失败")
    } finally {
      setFeedbackSaving(false)
    }
  }

  const updateRoleTarget = (index: number, patch: Partial<RoleTarget>) => {
    setGoalForm((current) => ({
      ...current,
      role_targets: current.role_targets.map((target, targetIndex) => targetIndex === index ? { ...target, ...patch } : target),
    }))
  }

  const removeRoleTarget = (index: number) => {
    setGoalForm((current) => ({
      ...current,
      role_targets: current.role_targets.filter((_, targetIndex) => targetIndex !== index),
    }))
  }

  const canActOnSelected = Boolean(
    selectedTask && (canManage || selectedTask.assignee?.id === user?.id)
  )

  return (
    <div className="min-h-screen">
      <Header showActions={false} />
      <main className="app-container py-5 lg:py-7">
        <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-primary">
              <ClipboardCheck className="size-3.5" />
              工作室执行中心
            </div>
            <h1 className="text-2xl font-semibold">任务管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">{mondayOf()} 本周 · {summary?.total_active || 0} 项待处理</p>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={openCreateGoal}><Target />新建周目标</Button>
              <Button type="button" onClick={() => openCreateTask()}><Plus />分配任务</Button>
            </div>
          )}
        </div>

        {error && !goalDialogOpen && !taskDialogOpen && (
          <div className="mt-5 flex items-start gap-2 border-y border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 border-y bg-card lg:grid-cols-4">
          <div className="border-b px-4 py-4 sm:border-r lg:border-b-0">
            <dt className="text-xs text-muted-foreground">逾期任务</dt>
            <dd className={cn("mt-1 text-2xl font-semibold", summary?.overdue ? "text-red-700" : "")}>{summary?.overdue || 0}</dd>
          </div>
          <div className="border-b px-4 py-4 lg:border-b-0 lg:border-r">
            <dt className="text-xs text-muted-foreground">今日截止</dt>
            <dd className={cn("mt-1 text-2xl font-semibold", summary?.due_today ? "text-amber-800" : "")}>{summary?.due_today || 0}</dd>
          </div>
          <div className="border-b px-4 py-4 sm:border-b-0 sm:border-r">
            <dt className="text-xs text-muted-foreground">紧急 / 高优先级</dt>
            <dd className="mt-1 text-2xl font-semibold">{summary?.urgent_high || 0}</dd>
          </div>
          <div className="px-4 py-4">
            <dt className="text-xs text-muted-foreground">本周已完成</dt>
            <dd className="mt-1 text-2xl font-semibold text-emerald-700">{summary?.completed_this_week || 0}</dd>
          </div>
        </dl>

        {(summary?.notifications.length || 0) > 0 && (
          <section className="mt-5 border-y border-amber-200 bg-amber-50" aria-labelledby="task-alerts-heading">
            <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-2.5 text-sm font-semibold text-amber-950">
              <Clock3 className="size-4" />
              <h2 id="task-alerts-heading">今日提醒</h2>
            </div>
            <div className="divide-y divide-amber-200">
              {summary?.notifications.map((notification) => (
                <button
                  key={notification.task_id}
                  type="button"
                  onClick={() => void openTaskDetail(notification.task_id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-amber-100/60"
                >
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate font-medium">{notification.title}</strong>
                    <span className="mt-0.5 block text-xs text-amber-800">{notification.message} · {formatDateTime(notification.due_at)}</span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-amber-800" />
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="mt-6 flex flex-col gap-3 border-b pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex w-fit rounded-md bg-muted p-1">
            <button type="button" onClick={() => setView("mine")} className={cn("h-8 rounded-sm px-3 text-sm", view === "mine" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>我的任务</button>
            {canManage && <button type="button" onClick={() => setView("all")} className={cn("h-8 rounded-sm px-3 text-sm", view === "all" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>全员任务</button>}
            <button type="button" onClick={() => setView("goals")} className={cn("h-8 rounded-sm px-3 text-sm", view === "goals" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>周目标</button>
          </div>

          {view !== "goals" && (
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger className="w-32 bg-background" aria-label="筛选任务状态"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">待处理</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="all">全部状态</SelectItem>
                </SelectContent>
              </Select>
              {view === "all" && (
                <Select value={assigneeFilter || "__all__"} onValueChange={(value) => setAssigneeFilter(value === "__all__" ? "" : value)}>
                  <SelectTrigger className="w-40 bg-background" aria-label="筛选负责人"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">全部负责人</SelectItem>
                    {assignees.map((assignee) => <SelectItem key={assignee.id} value={assignee.id}>{assignee.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />正在加载任务
          </div>
        ) : view === "goals" ? (
          <div className="mt-5 space-y-4">
            {goals.length === 0 ? (
              <div className="py-16 text-center">
                <Target className="mx-auto size-8 text-muted-foreground" />
                <h2 className="mt-4 text-base font-semibold">本周尚未建立目标</h2>
                {canManage && <Button className="mt-5" onClick={openCreateGoal}><Plus />新建周目标</Button>}
              </div>
            ) : goals.map((goal) => {
              const progress = goal.task_count ? Math.round(goal.completed_task_count * 100 / goal.task_count) : 0
              return (
                <article key={goal.id} className="border bg-card">
                  <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold">{goal.title}</h2>
                        <Badge variant={goal.status === "active" ? "secondary" : "outline"}>{goal.status === "active" ? "执行中" : goal.status === "completed" ? "已完成" : goal.status === "draft" ? "草稿" : "已归档"}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{goal.week_start} 至 {goal.week_end}</p>
                      {goal.description && <p className="mt-3 text-sm leading-6 text-muted-foreground">{goal.description}</p>}
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-1">
                        <Button type="button" variant="ghost" size="icon" onClick={() => openEditGoal(goal)} aria-label={`编辑${goal.title}`} title="编辑周目标"><Pencil /></Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => openCreateTask(goal.id)}><Plus />拆解任务</Button>
                      </div>
                    )}
                  </div>
                  <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="divide-y lg:border-r">
                      {goal.role_targets.map((target, index) => (
                        <div key={`${target.role}-${target.metric}-${index}`} className="grid gap-2 px-4 py-3.5 text-sm sm:grid-cols-[100px_minmax(0,1fr)_120px] sm:items-center sm:px-5">
                          <Badge variant="outline" className="w-fit">{ROLE_LABELS[target.role]}</Badge>
                          <span className="font-medium">{target.metric}</span>
                          <span className="text-muted-foreground sm:text-right">{target.target}{target.unit || ""}</span>
                        </div>
                      ))}
                      {goal.role_targets.length === 0 && <p className="px-5 py-6 text-sm text-muted-foreground">尚未配置岗位指标</p>}
                    </div>
                    <div className="px-5 py-5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground"><span>任务完成</span><span>{goal.completed_task_count}/{goal.task_count}</span></div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div>
                      <p className="mt-2 text-right text-sm font-semibold">{progress}%</p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-16 text-center">
            <ClipboardCheck className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-4 text-base font-semibold">当前筛选下没有任务</h2>
          </div>
        ) : (
          <div className="mt-5 divide-y border-y bg-card">
            {tasks.map((task) => {
              const priority = PRIORITY_META[task.priority]
              const timing = TIMING_META[task.timing_state]
              const status = STATUS_META[task.status]
              return (
                <article key={task.id} className={cn("grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_150px_150px_auto] lg:items-center", task.status === "completed" && "opacity-70")}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={priority.className}>{priority.label}</Badge>
                      {task.category && <Badge variant="outline">{task.category}</Badge>}
                      <button type="button" onClick={() => void openTaskDetail(task)} className="min-w-0 text-left font-medium hover:text-primary">{task.title}</button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {task.weekly_goal && <span className="truncate">目标：{task.weekly_goal.title}</span>}
                      {task.target_metric_label && <span>{task.target_metric_label}：{task.actual_metric_value ?? 0}/{task.target_metric_value ?? "-"}{task.metric_unit || ""}</span>}
                      <span>{task.feedback_count} 条反馈</span>
                    </div>
                  </div>
                  <div className="text-sm">
                    <span className="block text-xs text-muted-foreground">负责人</span>
                    <span className="mt-1 block font-medium">{task.assignee?.display_name || "未分配"}</span>
                  </div>
                  <div className="text-sm">
                    <span className={cn("block text-xs", timing.className)}>{timing.label}</span>
                    <span className="mt-1 block">{formatDateTime(task.due_at)}</span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span className={cn("mr-2 text-xs", status.className)}>{status.label}</span>
                    {task.status === "todo" && (canManage || task.assignee?.id === user?.id) && <Button type="button" variant="outline" size="sm" onClick={() => void handleStartTask(task)}><CircleDot />开始</Button>}
                    {task.status !== "completed" && task.status !== "cancelled" && <Button type="button" size="sm" onClick={() => void openTaskDetail(task)}><Send />反馈</Button>}
                    {canManage && <Button type="button" variant="ghost" size="icon" onClick={() => openEditTask(task)} aria-label={`编辑${task.title}`} title="编辑任务"><Pencil /></Button>}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>

      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogTitle>{editingGoal ? "编辑周目标" : "新建周目标"}</DialogTitle>
          <DialogDescription>{goalForm.week_start} 起始周</DialogDescription>
          {error && <div className="border-y border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={handleSaveGoal} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_140px]">
              <div className="space-y-1.5"><label htmlFor="goal-title" className="text-sm font-medium">工作室本周目标</label><Input id="goal-title" value={goalForm.title} onChange={(event) => setGoalForm((current) => ({ ...current, title: event.target.value }))} placeholder="例如：建立新能源车香氛内容矩阵" /></div>
              <div className="space-y-1.5"><label htmlFor="goal-week" className="text-sm font-medium">起始日期</label><Input id="goal-week" type="date" value={goalForm.week_start} onChange={(event) => setGoalForm((current) => ({ ...current, week_start: event.target.value }))} /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium">状态</label><Select value={goalForm.status} onValueChange={(value) => setGoalForm((current) => ({ ...current, status: value as WeeklyGoal["status"] }))}><SelectTrigger aria-label="周目标状态"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">草稿</SelectItem><SelectItem value="active">执行中</SelectItem><SelectItem value="completed">已完成</SelectItem><SelectItem value="archived">已归档</SelectItem></SelectContent></Select></div>
            </div>
            <div className="space-y-1.5"><label htmlFor="goal-description" className="text-sm font-medium">目标说明</label><Textarea id="goal-description" rows={3} value={goalForm.description} onChange={(event) => setGoalForm((current) => ({ ...current, description: event.target.value }))} placeholder="本周优先解决的问题、判断成功的标准" /></div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">岗位数据目标</h3><Button type="button" variant="outline" size="sm" onClick={() => setGoalForm((current) => ({ ...current, role_targets: [...current.role_targets, { role: "writer", metric: "", target: "", unit: "" }] }))}><Plus />添加指标</Button></div>
              <div className="mt-3 space-y-2">
                {goalForm.role_targets.map((target, index) => (
                  <div key={index} className="grid gap-2 border-y bg-card px-3 py-3 sm:grid-cols-[130px_minmax(180px,1fr)_110px_100px_36px] sm:items-center">
                    <Select value={target.role} onValueChange={(value) => updateRoleTarget(index, { role: value as RoleTarget["role"] })}><SelectTrigger aria-label={`指标 ${index + 1} 岗位`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="studio">工作室</SelectItem><SelectItem value="manager">运营管理</SelectItem><SelectItem value="writer">写手</SelectItem></SelectContent></Select>
                    <Input aria-label={`指标 ${index + 1} 名称`} value={target.metric} onChange={(event) => updateRoleTarget(index, { metric: event.target.value })} placeholder="指标名称" />
                    <Input aria-label={`指标 ${index + 1} 目标`} value={target.target} onChange={(event) => updateRoleTarget(index, { target: event.target.value })} placeholder="目标值" />
                    <Input aria-label={`指标 ${index + 1} 单位`} value={target.unit || ""} onChange={(event) => updateRoleTarget(index, { unit: event.target.value })} placeholder="单位" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRoleTarget(index)} aria-label={`删除指标 ${index + 1}`} title="删除指标"><Trash2 /></Button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setGoalDialogOpen(false)}>取消</Button><Button type="submit" disabled={!goalForm.title.trim() || goalForm.role_targets.some((target) => !target.metric.trim() || !target.target.trim()) || saving}>{saving ? <LoaderCircle className="animate-spin" /> : <Target />}{saving ? "保存中" : "保存周目标"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogTitle>{editingTask ? "编辑任务" : "分配任务"}</DialogTitle>
          <DialogDescription>{editingTask ? editingTask.title : "执行动作与负责人"}</DialogDescription>
          {error && <div className="border-y border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={handleSaveTask} className="space-y-5">
            <div className="space-y-1.5"><label htmlFor="task-title" className="text-sm font-medium">任务名称</label><Input id="task-title" value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} placeholder="明确的可执行动作" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><label className="text-sm font-medium">所属周目标</label><Select value={taskForm.weekly_goal_id || "__none__"} onValueChange={(value) => setTaskForm((current) => ({ ...current, weekly_goal_id: value === "__none__" ? null : value }))}><SelectTrigger aria-label="选择所属周目标"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">独立任务</SelectItem>{activeGoals.map((goal) => <SelectItem key={goal.id} value={goal.id}>{goal.title}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><label className="text-sm font-medium">负责人</label><Select value={taskForm.assignee_user_id || "__none__"} onValueChange={(value) => setTaskForm((current) => ({ ...current, assignee_user_id: value === "__none__" ? "" : value }))}><SelectTrigger aria-label="选择任务负责人"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">选择负责人</SelectItem>{assignees.map((assignee) => <SelectItem key={assignee.id} value={assignee.id}>{assignee.display_name} · {roleName(assignee.role)}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5"><label className="text-sm font-medium">动作类型</label><Select value={taskForm.category || CATEGORY_OPTIONS[0]} onValueChange={(value) => setTaskForm((current) => ({ ...current, category: value }))}><SelectTrigger aria-label="选择动作类型"><SelectValue /></SelectTrigger><SelectContent>{CATEGORY_OPTIONS.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><label className="text-sm font-medium">优先级</label><Select value={taskForm.priority} onValueChange={(value) => setTaskForm((current) => ({ ...current, priority: value as WorkTask["priority"] }))}><SelectTrigger aria-label="选择任务优先级"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="urgent">紧急</SelectItem><SelectItem value="high">高</SelectItem><SelectItem value="normal">普通</SelectItem><SelectItem value="low">低</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><label htmlFor="task-due" className="text-sm font-medium">截止时间</label><Input id="task-due" type="datetime-local" value={taskForm.due_at} onChange={(event) => setTaskForm((current) => ({ ...current, due_at: event.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><label htmlFor="task-description" className="text-sm font-medium">任务要求</label><Textarea id="task-description" rows={4} value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} placeholder="交付内容、范围、质量要求和协作对象" /></div>
            <div className="grid gap-4 border-y bg-card px-3 py-4 sm:grid-cols-[minmax(0,1fr)_120px_100px]">
              <div className="space-y-1.5"><label htmlFor="task-metric" className="text-sm font-medium">任务数据指标</label><Input id="task-metric" value={taskForm.target_metric_label} onChange={(event) => setTaskForm((current) => ({ ...current, target_metric_label: event.target.value }))} placeholder="例如：交付文案数量" /></div>
              <div className="space-y-1.5"><label htmlFor="task-target" className="text-sm font-medium">目标值</label><Input id="task-target" type="number" min="0" step="0.01" value={taskForm.target_metric_value ?? ""} onChange={(event) => setTaskForm((current) => ({ ...current, target_metric_value: event.target.value ? Number(event.target.value) : null }))} /></div>
              <div className="space-y-1.5"><label htmlFor="task-unit" className="text-sm font-medium">单位</label><Input id="task-unit" value={taskForm.metric_unit} onChange={(event) => setTaskForm((current) => ({ ...current, metric_unit: event.target.value }))} placeholder="篇" /></div>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-primary" />完成任务时必须提交文字说明或反馈附件</p>
            <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setTaskDialogOpen(false)}>取消</Button><Button type="submit" disabled={!taskForm.title.trim() || !taskForm.assignee_user_id || !taskForm.due_at || saving}>{saving ? <LoaderCircle className="animate-spin" /> : <ClipboardCheck />}{saving ? "保存中" : "保存任务"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogTitle>{selectedTask?.title || "任务详情"}</DialogTitle>
          <DialogDescription>{selectedTask ? `${selectedTask.assignee?.display_name || "未分配"} · ${formatDateTime(selectedTask.due_at)}` : "正在加载"}</DialogDescription>
          {detailLoading || !selectedTask ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在加载任务</div>
          ) : (
            <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
              <section>
                <div className="flex flex-wrap gap-2"><Badge variant="outline" className={PRIORITY_META[selectedTask.priority].className}>{PRIORITY_META[selectedTask.priority].label}</Badge><Badge variant="outline">{selectedTask.category || "未分类"}</Badge><Badge variant="outline">{STATUS_META[selectedTask.status].label}</Badge></div>
                {selectedTask.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{selectedTask.description}</p>}
                <dl className="mt-5 divide-y border-y bg-card text-sm">
                  <div className="grid grid-cols-[110px_1fr] gap-3 px-3 py-3"><dt className="text-muted-foreground">周目标</dt><dd>{selectedTask.weekly_goal?.title || "独立任务"}</dd></div>
                  <div className="grid grid-cols-[110px_1fr] gap-3 px-3 py-3"><dt className="text-muted-foreground">截止时间</dt><dd className={TIMING_META[selectedTask.timing_state].className}>{formatDateTime(selectedTask.due_at)} · {TIMING_META[selectedTask.timing_state].label}</dd></div>
                  {selectedTask.target_metric_label && <div className="grid grid-cols-[110px_1fr] gap-3 px-3 py-3"><dt className="text-muted-foreground">数据目标</dt><dd>{selectedTask.target_metric_label}：{selectedTask.actual_metric_value ?? 0}/{selectedTask.target_metric_value ?? "-"}{selectedTask.metric_unit || ""}</dd></div>}
                </dl>
                <h3 className="mt-6 text-sm font-semibold">反馈记录</h3>
                <div className="mt-3 divide-y border-y bg-card">
                  {(selectedTask.feedbacks || []).map((feedback) => (
                    <div key={feedback.id} className="px-4 py-4 text-sm">
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{feedback.user?.display_name} · {feedback.feedback_type === "completion" ? "完成反馈" : `进度 ${feedback.progress_percent ?? "-"}%`}</span><span>{formatDateTime(feedback.created_at)}</span></div>
                      {feedback.content && <p className="mt-2 whitespace-pre-wrap leading-6">{feedback.content}</p>}
                      {feedback.attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{feedback.attachments.map((attachment) => <a key={attachment.path} href={attachment.path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><FileUp className="size-3" />{attachment.name}</a>)}</div>}
                    </div>
                  ))}
                  {(selectedTask.feedbacks || []).length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">尚未提交反馈</p>}
                </div>
              </section>

              {canActOnSelected && selectedTask.status !== "completed" && selectedTask.status !== "cancelled" && (
                <form onSubmit={handleSubmitFeedback} className="space-y-4 border-t pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <h3 className="text-sm font-semibold">提交执行反馈</h3>
                  <div className="space-y-1.5"><label htmlFor="feedback-content" className="text-sm font-medium">反馈内容</label><Textarea id="feedback-content" rows={5} value={feedbackContent} onChange={(event) => setFeedbackContent(event.target.value)} placeholder="完成情况、结果、问题和下一步" /></div>
                  <div className="space-y-2"><div className="flex items-center justify-between text-sm"><label htmlFor="feedback-progress" className="font-medium">当前进度</label><span>{feedbackProgress}%</span></div><input id="feedback-progress" type="range" min="0" max="100" step="5" value={feedbackProgress} onChange={(event) => setFeedbackProgress(Number(event.target.value))} className="w-full accent-[var(--primary)]" /></div>
                  {selectedTask.target_metric_label && <div className="space-y-1.5"><label htmlFor="feedback-metric" className="text-sm font-medium">实际{selectedTask.target_metric_label}</label><div className="flex items-center gap-2"><Input id="feedback-metric" type="number" min="0" step="0.01" value={feedbackMetric} onChange={(event) => setFeedbackMetric(event.target.value)} /><span className="shrink-0 text-sm text-muted-foreground">{selectedTask.metric_unit}</span></div></div>}
                  <label className="flex cursor-pointer items-center justify-center gap-2 border border-dashed px-3 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary"><FileUp className="size-4" />{feedbackFiles.length ? `${feedbackFiles.length} 个附件` : "上传反馈附件"}<input type="file" multiple className="sr-only" onChange={(event) => setFeedbackFiles(Array.from(event.target.files || []))} /></label>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><Button type="submit" variant="outline" data-complete="false" disabled={(!feedbackContent.trim() && feedbackFiles.length === 0) || feedbackSaving}>{feedbackSaving ? <LoaderCircle className="animate-spin" /> : <Send />}提交进度</Button><Button type="submit" data-complete="true" disabled={(!feedbackContent.trim() && feedbackFiles.length === 0) || feedbackSaving}>{feedbackSaving ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}提交并完成</Button></div>
                </form>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
