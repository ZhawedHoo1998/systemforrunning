"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  AtSign,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Database,
  ExternalLink,
  LockKeyhole,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  TrendingUp,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { Header } from "@/components/Header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  analyzeCreatorAccount,
  archiveCreatorAccount,
  createCreatorAccount,
  discoverCreatorAccounts,
  getCreatorAccountNotes,
  getCreatorAccounts,
  getXhsPublicDataStatus,
  updateCreatorAccount,
  type CreatorAccount,
  type CreatorDiscoveryCandidate,
  type CreatorAccountPayload,
  type CreatorAccountSampleNote,
  type XhsPublicDataStatus,
} from "@/lib/api"


const EMPTY_FORM: CreatorAccountPayload = {
  name: "",
  xhs_user_id: "",
  account_kind: "owned",
  data_source: "auto",
  positioning: "",
  target_audience: "",
  tone_style: "",
  content_pillars: [],
  title_guidelines: "",
  body_guidelines: "",
  conversion_goal: "",
  prohibited_terms: "",
  is_active: true,
}

function formatDate(value: string | null) {
  if (!value) return "尚未同步"
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function textValue(value: string | null | undefined) {
  return value || ""
}

function toForm(account: CreatorAccount): CreatorAccountPayload {
  return {
    name: account.name,
    xhs_user_id: account.xhs_user_id,
    account_kind: account.account_kind,
    data_source: account.data_source,
    positioning: textValue(account.positioning),
    target_audience: textValue(account.target_audience),
    tone_style: textValue(account.tone_style),
    content_pillars: account.content_pillars,
    title_guidelines: textValue(account.title_guidelines),
    body_guidelines: textValue(account.body_guidelines),
    conversion_goal: textValue(account.conversion_goal),
    prohibited_terms: textValue(account.prohibited_terms),
    is_active: account.is_active,
  }
}

function splitPillars(value: string) {
  return Array.from(new Set(value.split(/[，,、\n]/).map((item) => item.trim()).filter(Boolean))).slice(0, 20)
}

function formatMetric(value: number | undefined) {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0)
}

const SOURCE_LABELS: Record<CreatorAccount["data_source"] | "cli" | "tikhub", string> = {
  auto: "自动",
  cli: "CLI",
  tikhub: "TikHub",
}

const HISTORY_ARCHIVE_STATUS_LABELS = {
  queued: "等待归档",
  running: "正在归档",
  complete: "归档完成",
  partial: "部分归档",
  failed: "归档失败",
} as const

function archiveProgressText(
  archive: NonNullable<CreatorAccount["analysis"]["history_archive"]>,
) {
  if (archive.status === "queued") return "归档任务已排队"
  if (archive.status === "running" && archive.stage === "listing") {
    return `正在逐页拉取历史列表 · 已抓 ${archive.pages_fetched || 0} 页 · 已保存 ${archive.total_notes || 0} 篇`
  }
  if (archive.status === "running" && archive.stage === "details") {
    return `正在补全全部帖子详情 · ${archive.detail_completed || 0}/${archive.detail_total || archive.total_notes || 0} 篇`
  }
  if (archive.status === "running" && archive.stage === "media") {
    return `正在下载帖子图片和视频到本地 · ${archive.media_completed || 0}/${archive.media_total || archive.total_notes || 0} 篇`
  }
  if (archive.status === "complete") {
    return "公开历史列表、完整详情及帖子媒体均已保存到本地"
  }
  if (archive.status === "partial") {
    if (archive.missing_detail_count || archive.detail_failed) {
      return `仍有 ${archive.missing_detail_count || archive.detail_failed || 0} 篇详情待补全，可再次归档续跑`
    }
    return `仍有 ${archive.missing_media_count || archive.media_failed || 0} 篇媒体待保存，可再次归档续跑`
  }
  if (archive.status === "failed") return "归档中断，已抓取的数据均已保存，可再次归档续跑"
  return "准备归档公开历史帖子"
}

export default function CreatorAccountsPage() {
  const { user } = useAuth()
  const [accounts, setAccounts] = useState<CreatorAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<CreatorAccount | null>(null)
  const [form, setForm] = useState<CreatorAccountPayload>(EMPTY_FORM)
  const [pillarsText, setPillarsText] = useState("")
  const [saving, setSaving] = useState(false)
  const [analyzingId, setAnalyzingId] = useState("")
  const [archivingId, setArchivingId] = useState("")
  const [submitAndAnalyze, setSubmitAndAnalyze] = useState(false)
  const [sourceStatus, setSourceStatus] = useState<XhsPublicDataStatus | null>(null)
  const [syncPageLimit, setSyncPageLimit] = useState(10)
  const [notes, setNotes] = useState<CreatorAccountSampleNote[]>([])
  const [notesTotal, setNotesTotal] = useState(0)
  const [notesBodyCount, setNotesBodyCount] = useState(0)
  const [notesLoading, setNotesLoading] = useState(false)
  const [notesSort, setNotesSort] = useState<"engagement" | "published_at" | "collections" | "likes" | "comments">("engagement")
  const [discoveryOpen, setDiscoveryOpen] = useState(false)
  const [discoveryKeywords, setDiscoveryKeywords] = useState("汽车香氛、车载香薰、车内香水、汽车好物、车内氛围感")
  const [discoverySource, setDiscoverySource] = useState<CreatorAccount["data_source"]>("auto")
  const [discoveryPageLimit, setDiscoveryPageLimit] = useState(2)
  const [discoverySearched, setDiscoverySearched] = useState(false)
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [discoveryCandidates, setDiscoveryCandidates] = useState<CreatorDiscoveryCandidate[]>([])
  const [discoveryWarnings, setDiscoveryWarnings] = useState<string[]>([])
  const [addingCandidateId, setAddingCandidateId] = useState("")

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId]
  )
  const canQuery = user?.role === "admin" || user?.role === "writer"
  const canManage = user?.role === "admin" || user?.role === "manager"
  const highlightedNoteIds = useMemo(
    () => new Set(selectedAccount?.analysis.monitoring_7d?.high_performing_notes.map((note) => note.id) || []),
    [selectedAccount?.analysis.monitoring_7d?.high_performing_notes]
  )

  useEffect(() => {
    if (!user) return
    let active = true
    Promise.all([getCreatorAccounts(), getXhsPublicDataStatus()])
      .then(([results, status]) => {
        if (!active) return
        setAccounts(results)
        setSourceStatus(status)
        setSyncPageLimit(status.default_max_pages)
        if (results.length) setNotesLoading(true)
        setSelectedAccountId((current) => current || results[0]?.id || "")
        setError("")
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "创作账号加载失败")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!selectedAccount?.id) return
    let active = true
    getCreatorAccountNotes(selectedAccount.id, { sort: notesSort, page_size: 500 })
      .then((result) => {
        if (!active) return
        setNotes(result.items)
        setNotesTotal(result.total)
        setNotesBodyCount(result.body_count)
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "账号笔记加载失败")
      })
      .finally(() => {
        if (active) setNotesLoading(false)
      })
    return () => {
      active = false
    }
  }, [selectedAccount?.id, selectedAccount?.last_analyzed_at, notesSort])

  useEffect(() => {
    const archiveStatus = selectedAccount?.analysis.history_archive?.status
    if (!selectedAccount?.id || !archiveStatus || !["queued", "running"].includes(archiveStatus)) return

    let active = true
    const refreshArchiveStatus = () => {
      getCreatorAccounts()
        .then((results) => {
          if (active) setAccounts(results)
        })
        .catch(() => undefined)
    }
    const timer = window.setInterval(refreshArchiveStatus, 3000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [selectedAccount?.analysis.history_archive?.status, selectedAccount?.id])

  const replaceAccount = (updated: CreatorAccount) => {
    setAccounts((current) => {
      const exists = current.some((account) => account.id === updated.id)
      return exists
        ? current.map((account) => account.id === updated.id ? updated : account)
        : [...current, updated]
    })
    setNotesLoading(true)
    setSelectedAccountId(updated.id)
  }

  const openCreate = () => {
    if (!canManage) return
    setEditingAccount(null)
    setForm(EMPTY_FORM)
    setPillarsText("")
    setError("")
    setSubmitAndAnalyze(false)
    setDialogOpen(true)
  }

  const openEdit = (account: CreatorAccount) => {
    if (!canManage) return
    setEditingAccount(account)
    setForm(toForm(account))
    setPillarsText(account.content_pillars.join("、"))
    setError("")
    setSubmitAndAnalyze(false)
    setDialogOpen(true)
  }

  const handleAnalyze = async (account: CreatorAccount) => {
    if (!canQuery) return
    setAnalyzingId(account.id)
    setError("")
    try {
      const analyzed = await analyzeCreatorAccount(account.id, {
        source: account.data_source,
        max_pages: syncPageLimit,
      })
      replaceAccount(analyzed)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "账号数据同步与分析失败")
    } finally {
      setAnalyzingId("")
    }
  }

  const handleArchive = async (account: CreatorAccount) => {
    if (!canQuery || account.account_kind !== "owned") return
    setArchivingId(account.id)
    setError("")
    try {
      replaceAccount(await archiveCreatorAccount(account.id))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "账号历史帖子归档失败")
    } finally {
      setArchivingId("")
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canManage) return
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const shouldAnalyze = submitter?.dataset.analyze === "true"
    setSubmitAndAnalyze(shouldAnalyze)
    setSaving(true)
    setError("")
    const payload = {
      ...form,
      name: form.name.trim(),
      xhs_user_id: form.xhs_user_id.trim(),
      content_pillars: splitPillars(pillarsText),
    }
    try {
      const saved = editingAccount
        ? await updateCreatorAccount(editingAccount.id, payload)
        : await createCreatorAccount(payload)
      replaceAccount(saved)
      setDialogOpen(false)
      const archiveStartedOnCreate = !editingAccount && saved.account_kind === "owned"
      if (shouldAnalyze && !archiveStartedOnCreate) await handleAnalyze(saved)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "创作账号保存失败")
    } finally {
      setSaving(false)
      setSubmitAndAnalyze(false)
    }
  }

  const handleToggleActive = async (account: CreatorAccount) => {
    if (!canManage) return
    setAnalyzingId(account.id)
    setError("")
    try {
      replaceAccount(await updateCreatorAccount(account.id, { is_active: !account.is_active }))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "账号状态更新失败")
    } finally {
      setAnalyzingId("")
    }
  }

  const handleDiscover = async () => {
    if (!canQuery) return
    const keywords = splitPillars(discoveryKeywords)
    if (!keywords.length) return
    setDiscoveryLoading(true)
    setDiscoverySearched(false)
    setError("")
    try {
      const result = await discoverCreatorAccounts({
        keywords,
        source: discoverySource,
        pages_per_keyword: discoveryPageLimit,
      })
      setDiscoveryCandidates(result.candidates)
      setDiscoveryWarnings(result.warnings)
      setDiscoverySearched(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "对标账号发现失败")
      setDiscoverySearched(true)
    } finally {
      setDiscoveryLoading(false)
    }
  }

  const handleAddCandidate = async (candidate: CreatorDiscoveryCandidate) => {
    if (!canManage) return
    setAddingCandidateId(candidate.user_id)
    setError("")
    try {
      const saved = await createCreatorAccount({
        ...EMPTY_FORM,
        name: candidate.nickname,
        xhs_user_id: candidate.user_id,
        account_kind: "competitor",
        data_source: discoverySource,
        positioning: `从关键词“${candidate.keywords.join("、")}”发现`,
      })
      replaceAccount(saved)
      setDiscoveryCandidates((current) => current.filter((item) => item.user_id !== candidate.user_id))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "对标账号添加失败")
    } finally {
      setAddingCandidateId("")
    }
  }

  return (
    <div className="min-h-screen">
      <Header showActions={false} />
      <main className="app-container py-6 lg:py-8">
        <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-primary">
              <TrendingUp className="size-3.5" />
              账号数据中心
            </div>
            <h1 className="text-2xl font-semibold">账号情报</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {accounts.filter((account) => account.account_kind === "owned").length} 个自有账号 · {accounts.filter((account) => account.account_kind === "competitor").length} 个对标账号
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canQuery && <>
              <Select value={String(syncPageLimit)} onValueChange={(value) => setSyncPageLimit(Number(value))}>
                <SelectTrigger className="w-32 bg-background shadow-none" aria-label="同步页数">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 5, 10, 20, 30].map((value) => <SelectItem key={value} value={String(value)}>同步 {value} 页</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={() => { setError(""); setDiscoverySearched(false); setDiscoveryOpen(true) }}>
                <Search />
                发现对标
              </Button>
            </>}
            {canManage && <Button onClick={openCreate}>
              <Plus />
              添加账号
            </Button>}
            {!canQuery && <Badge variant="outline"><LockKeyhole />查询仅限写手或管理员</Badge>}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-y bg-card px-4 py-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Database className="size-3.5" />公开数据源</span>
          <span className={sourceStatus?.cli_authenticated ? "text-emerald-700" : undefined}>
            CLI {sourceStatus?.cli_authenticated
              ? `${sourceStatus.cli_user?.name || "已登录"}${sourceStatus.cli_user?.red_id ? `（${sourceStatus.cli_user.red_id}）` : ""}`
              : sourceStatus?.cli_installed ? "未登录" : "不可用"}
          </span>
          <span className={sourceStatus?.tikhub_configured ? "text-emerald-700" : undefined}>TikHub {sourceStatus?.tikhub_configured ? "已配置" : "未配置"}</span>
          <span className="flex items-center gap-1.5"><CalendarClock className="size-3.5" />自有账号{sourceStatus?.daily_monitor?.time_label || "每天 09:00"}监测</span>
          <span>常规抓取 CLI 优先；TikHub 仅用于每日近 7 天指标分析</span>
          <span>当前登录账号仅作为公开访问身份，不等于被同步账号</span>
          <span>不含曝光、阅读、完播、转化等创作者中心私有指标</span>
        </div>

        {error && !dialogOpen && (
          <div className="mt-5 flex items-start gap-2 border-y border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            正在加载创作账号
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-16 text-center">
            <AtSign className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-4 text-base font-semibold">尚未配置账号</h2>
            {canManage && <Button className="mt-5" onClick={openCreate}><Plus />添加账号</Button>}
          </div>
        ) : (
          <>
            <div className="mt-5 overflow-x-auto border-y bg-card">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">账号</th>
                    <th className="px-4 py-3 font-medium">类型 / 来源</th>
                    <th className="px-4 py-3 font-medium">人工定位</th>
                    <th className="px-4 py-3 font-medium">公开笔记</th>
                    <th className="px-4 py-3 font-medium">最近同步</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {accounts.map((account) => (
                    <tr key={account.id} className={selectedAccount?.id === account.id ? "bg-primary/[0.035]" : undefined}>
                      <td className="px-4 py-3.5">
                        <button type="button" onClick={() => { setNotesLoading(true); setSelectedAccountId(account.id) }} className="text-left">
                          <span className="block font-medium">{account.name}</span>
                          <span className="block text-xs text-muted-foreground">{account.nickname || account.red_id || account.xhs_user_id}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={account.account_kind === "owned" ? "default" : "secondary"}>
                            {account.account_kind === "owned" ? <UserRound /> : <Users />}
                            {account.account_kind === "owned" ? "自有" : "对标"}
                          </Badge>
                          <Badge variant="outline">{SOURCE_LABELS[account.last_sync_source || account.data_source]}</Badge>
                        </div>
                      </td>
                      <td className="max-w-[320px] px-4 py-3.5 text-muted-foreground">
                        <p className="line-clamp-2">{account.positioning || "未填写"}</p>
                      </td>
                      <td className="px-4 py-3.5">{account.synced_note_count || 0} 篇</td>
                      <td className="px-4 py-3.5 text-muted-foreground">{formatDate(account.last_analyzed_at)}</td>
                      <td className="px-4 py-3.5">
                        <span className={account.last_sync_status === "failed" ? "text-red-700" : account.is_active ? "text-emerald-700" : "text-muted-foreground"}>
                          {account.last_sync_status === "failed" ? "同步失败" : account.is_active ? "已启用" : "已停用"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" onClick={() => { setNotesLoading(true); setSelectedAccountId(account.id) }} aria-label={`查看${account.name}分析`} title="查看分析">
                            <BarChart3 />
                          </Button>
                          {canQuery && <Button type="button" variant="ghost" size="icon" onClick={() => void handleAnalyze(account)} disabled={analyzingId === account.id} aria-label={`同步分析${account.name}`} title="同步并分析">
                            {analyzingId === account.id ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                          </Button>}
                          {canManage && <>
                            <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(account)} aria-label={`编辑${account.name}`} title="编辑账号">
                              <Pencil />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className={account.is_active ? "text-muted-foreground" : "text-emerald-700"} onClick={() => void handleToggleActive(account)} disabled={analyzingId === account.id} aria-label={account.is_active ? `停用${account.name}` : `启用账号`} title={account.is_active ? "停用账号" : "启用账号"}>
                              <Power />
                            </Button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedAccount && (
              <section className="mt-8 border-t pt-6" aria-labelledby="account-analysis-heading">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 id="account-analysis-heading" className="text-lg font-semibold">{selectedAccount.name} · 公开账号画像</h2>
                      <Badge variant={selectedAccount.account_kind === "owned" ? "default" : "secondary"}>
                        {selectedAccount.account_kind === "owned" ? "自有账号" : "对标账号"}
                      </Badge>
                      {selectedAccount.last_analyzed_at && <Badge variant="outline"><CheckCircle2 />已同步</Badge>}
                      {selectedAccount.analysis.page_limit_reached
                        && !["queued", "running"].includes(selectedAccount.analysis.history_archive?.status || "")
                        && <Badge variant="secondary">已达页数上限</Badge>}
                      {selectedAccount.analysis.history_archive?.status && (
                        <Badge variant={selectedAccount.analysis.history_archive.status === "failed" ? "destructive" : "outline"}>
                          {HISTORY_ARCHIVE_STATUS_LABELS[selectedAccount.analysis.history_archive.status]}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>数据时间：{formatDate(selectedAccount.last_analyzed_at)}</span>
                      <span>来源：{SOURCE_LABELS[selectedAccount.last_sync_source || selectedAccount.data_source]}</span>
                      {selectedAccount.profile_url && (
                        <a href={selectedAccount.profile_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          打开主页<ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  {canQuery && (
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedAccount.account_kind === "owned" && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleArchive(selectedAccount)}
                          disabled={
                            archivingId === selectedAccount.id
                            || ["queued", "running"].includes(selectedAccount.analysis.history_archive?.status || "")
                          }
                        >
                          {archivingId === selectedAccount.id || ["queued", "running"].includes(selectedAccount.analysis.history_archive?.status || "")
                            ? <LoaderCircle className="animate-spin" />
                            : <Database />}
                          {["queued", "running"].includes(selectedAccount.analysis.history_archive?.status || "")
                            ? "正在归档历史"
                            : "归档历史帖子"}
                        </Button>
                      )}
                      <Button type="button" variant="outline" onClick={() => void handleAnalyze(selectedAccount)} disabled={analyzingId === selectedAccount.id}>
                        {analyzingId === selectedAccount.id ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                        {analyzingId === selectedAccount.id ? "正在同步" : "同步并重新分析"}
                      </Button>
                    </div>
                  )}
                </div>

                {selectedAccount.last_sync_error && (
                  <div className="mt-4 flex items-start gap-2 border-y border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    {selectedAccount.last_sync_error}
                  </div>
                )}

                {selectedAccount.account_kind === "owned" && selectedAccount.analysis.history_archive && (
                  <div className="mt-4 flex items-start gap-3 border-y bg-card px-4 py-3 text-sm">
                    <Database className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="font-medium">
                        历史帖子 {selectedAccount.analysis.history_archive.total_notes || 0} 篇 ·
                        完整详情 {selectedAccount.analysis.history_archive.detail_note_count || 0}/
                        {selectedAccount.analysis.history_archive.total_notes || 0} 篇 ·
                        含正文 {selectedAccount.analysis.history_archive.body_note_count || 0} 篇 ·
                        本地图片 {selectedAccount.analysis.history_archive.local_image_count || 0} 张
                        {(selectedAccount.analysis.history_archive.local_video_count || 0) > 0
                          ? ` · 本地视频 ${selectedAccount.analysis.history_archive.local_video_count} 条`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {archiveProgressText(selectedAccount.analysis.history_archive)}
                        {selectedAccount.analysis.history_archive.completed_at
                          ? ` · 完成于 ${formatDate(selectedAccount.analysis.history_archive.completed_at)}`
                          : ""}
                      </p>
                      {selectedAccount.analysis.history_archive.error && (
                        <p className="mt-1 text-xs text-red-700">{selectedAccount.analysis.history_archive.error}</p>
                      )}
                    </div>
                  </div>
                )}

                <dl className="mt-5 grid border-y bg-card sm:grid-cols-2 lg:grid-cols-6">
                  <div className="border-b px-4 py-4 sm:border-r lg:border-b-0">
                    <dt className="text-xs text-muted-foreground">粉丝</dt>
                    <dd className="mt-1 text-xl font-semibold">{formatMetric(selectedAccount.analysis.profile_metrics?.followers)}</dd>
                  </div>
                  <div className="border-b px-4 py-4 lg:border-b-0 lg:border-r">
                    <dt className="text-xs text-muted-foreground">已同步笔记</dt>
                    <dd className="mt-1 text-xl font-semibold">{selectedAccount.synced_note_count || 0}</dd>
                  </div>
                  <div className="border-b px-4 py-4 sm:border-r lg:border-b-0">
                    <dt className="text-xs text-muted-foreground">篇均点赞</dt>
                    <dd className="mt-1 text-xl font-semibold">{formatMetric(selectedAccount.analysis.average_likes)}</dd>
                  </div>
                  <div className="border-b px-4 py-4 lg:border-b-0 lg:border-r">
                    <dt className="text-xs text-muted-foreground">篇均收藏</dt>
                    <dd className="mt-1 text-xl font-semibold">{formatMetric(selectedAccount.analysis.average_collections)}</dd>
                  </div>
                  <div className="border-b px-4 py-4 sm:border-b-0 sm:border-r">
                    <dt className="text-xs text-muted-foreground">收藏 / 点赞</dt>
                    <dd className="mt-1 text-xl font-semibold">{selectedAccount.analysis.average_save_like_ratio || 0}</dd>
                  </div>
                  <div className="px-4 py-4">
                    <dt className="text-xs text-muted-foreground">本次覆盖</dt>
                    <dd className="mt-1 text-xl font-semibold">{selectedAccount.analysis.pages_fetched || 0}<span className="ml-1 text-xs font-normal text-muted-foreground">页</span></dd>
                  </div>
                </dl>

                {selectedAccount.account_kind === "owned" && (
                  <section className="mt-7 border-y bg-card" aria-labelledby="seven-day-monitoring-heading">
                    <div className="flex flex-col gap-2 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <CalendarClock className="size-4 text-primary" />
                          <h3 id="seven-day-monitoring-heading" className="text-sm font-semibold">近 7 天账号监测</h3>
                          <Badge variant="outline">每日 {sourceStatus?.daily_monitor?.time_label?.replace("每天 ", "") || "09:00"}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">自动汇总发布、互动、点赞和收藏变化；指标监测优先 TikHub，日常抓取使用 CLI，高表现笔记会重点标记并提醒写手。</p>
                      </div>
                      {selectedAccount.analysis.monitoring_7d?.last_run_at && (
                        <span className="text-xs text-muted-foreground">最近监测：{formatDate(selectedAccount.analysis.monitoring_7d.last_run_at)}</span>
                      )}
                    </div>

                    {selectedAccount.analysis.monitoring_7d ? <>
                      <dl className="grid sm:grid-cols-2 lg:grid-cols-5">
                        <div className="border-b px-4 py-4 sm:border-r lg:border-b-0">
                          <dt className="text-xs text-muted-foreground">近 7 天发布</dt>
                          <dd className="mt-1 text-xl font-semibold">{selectedAccount.analysis.monitoring_7d.post_count}<span className="ml-1 text-xs font-normal text-muted-foreground">篇</span></dd>
                        </div>
                        <div className="border-b px-4 py-4 lg:border-b-0 lg:border-r">
                          <dt className="text-xs text-muted-foreground">互动</dt>
                          <dd className="mt-1 text-xl font-semibold">{formatMetric(selectedAccount.analysis.monitoring_7d.totals.interactions)}<span className="ml-1 text-xs font-normal text-emerald-700">+{formatMetric(selectedAccount.analysis.monitoring_7d.deltas.interactions)}</span></dd>
                        </div>
                        <div className="border-b px-4 py-4 sm:border-r lg:border-b-0">
                          <dt className="text-xs text-muted-foreground">点赞</dt>
                          <dd className="mt-1 text-xl font-semibold">{formatMetric(selectedAccount.analysis.monitoring_7d.totals.liked_count)}<span className="ml-1 text-xs font-normal text-emerald-700">+{formatMetric(selectedAccount.analysis.monitoring_7d.deltas.liked_count)}</span></dd>
                        </div>
                        <div className="border-b px-4 py-4 lg:border-b-0 lg:border-r">
                          <dt className="text-xs text-muted-foreground">收藏</dt>
                          <dd className="mt-1 text-xl font-semibold">{formatMetric(selectedAccount.analysis.monitoring_7d.totals.collected_count)}<span className="ml-1 text-xs font-normal text-emerald-700">+{formatMetric(selectedAccount.analysis.monitoring_7d.deltas.collected_count)}</span></dd>
                        </div>
                        <div className="px-4 py-4">
                          <dt className="text-xs text-muted-foreground">粉丝</dt>
                          <dd className="mt-1 text-xl font-semibold">{formatMetric(selectedAccount.analysis.monitoring_7d.followers)}<span className="ml-1 text-xs font-normal text-emerald-700">{selectedAccount.analysis.monitoring_7d.follower_delta >= 0 ? "+" : ""}{formatMetric(selectedAccount.analysis.monitoring_7d.follower_delta)}</span></dd>
                        </div>
                      </dl>

                      <div className="border-t px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold">重点笔记</h4>
                          <Badge variant="secondary">{selectedAccount.analysis.monitoring_7d.high_performing_count} 篇高表现</Badge>
                          {!selectedAccount.analysis.monitoring_7d.coverage_complete && <span className="text-xs text-amber-800">当前页数尚未完全覆盖 7 天内容</span>}
                        </div>
                        <div className="mt-3 divide-y">
                          {selectedAccount.analysis.monitoring_7d.high_performing_notes.map((note) => (
                            <a key={note.id} href={note.source_url} target="_blank" rel="noreferrer" className="flex flex-col gap-2 py-3 text-sm hover:text-primary sm:flex-row sm:items-center sm:justify-between">
                              <span className="min-w-0"><Badge className="mr-2 bg-red-600 text-white hover:bg-red-600">重点</Badge><span className="font-medium">{note.title}</span></span>
                              <span className="shrink-0 text-xs text-muted-foreground">赞 {formatMetric(note.liked_count)} · 藏 {formatMetric(note.collected_count)} · 互动 {formatMetric(note.interactions)}</span>
                            </a>
                          ))}
                          {selectedAccount.analysis.monitoring_7d.high_performing_notes.length === 0 && <p className="py-3 text-sm text-muted-foreground">最近 7 天暂无达到重点阈值的笔记。</p>}
                        </div>
                      </div>
                    </> : (
                      <p className="px-4 py-5 text-sm text-muted-foreground">首次每日监测完成后，这里会展示近 7 天的互动、点赞、收藏变化和重点笔记。</p>
                    )}
                  </section>
                )}

                <div className="mt-6 grid gap-7 lg:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold">内容与表达判断</h3>
                    <div className="mt-3 space-y-3 border-y bg-card px-4 py-4 text-sm leading-6">
                      <p>{selectedAccount.analysis.positioning_summary || "同步账号后生成内容判断"}</p>
                      <p className="text-muted-foreground">{selectedAccount.analysis.style_summary || "同步账号后生成表达判断"}</p>
                    </div>
                    <h3 className="mt-5 text-sm font-semibold">标题习惯</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(selectedAccount.analysis.hook_patterns || []).map((pattern) => (
                        <Badge key={pattern.name} variant="secondary">{pattern.name} {pattern.ratio}%</Badge>
                      ))}
                      {(selectedAccount.analysis.hook_patterns || []).length === 0 && <span className="text-sm text-muted-foreground">暂无可判断样本</span>}
                    </div>
                    <h3 className="mt-5 text-sm font-semibold">内容主题</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(selectedAccount.analysis.top_topics || []).map((topic) => (
                        <Badge key={topic.name} variant="outline">{topic.name} · {topic.count}</Badge>
                      ))}
                      {(selectedAccount.analysis.top_topics || []).length === 0 && <span className="text-sm text-muted-foreground">暂无可判断主题</span>}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold">高互动样本</h3>
                    <div className="mt-3 divide-y border-y bg-card">
                      {(selectedAccount.analysis.top_notes || []).map((note, index) => (
                        <div key={note.id} className="flex gap-3 px-4 py-3.5 text-sm">
                          <span className="text-xs font-medium text-primary">{String(index + 1).padStart(2, "0")}</span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium leading-5">{note.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">赞 {note.liked_count} · 藏 {note.collected_count} · 评 {note.comment_count} · 转 {note.share_count || 0}</p>
                          </div>
                        </div>
                      ))}
                      {(selectedAccount.analysis.top_notes || []).length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">同步账号后显示代表性笔记</p>}
                    </div>

                    {(selectedAccount.analysis.warnings || []).length > 0 && (
                      <div className="mt-5 border-y border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                        {(selectedAccount.analysis.warnings || []).map((warning) => <p key={warning}>{warning}</p>)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-8 border-t pt-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">公开笔记排行</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        共 {notesTotal} 篇 · 含正文 {notesBodyCount} 篇 · 当前显示 {notes.length} 篇
                      </p>
                    </div>
                    <Select value={notesSort} onValueChange={(value) => { setNotesLoading(true); setNotesSort(value as typeof notesSort) }}>
                      <SelectTrigger className="w-36 bg-background shadow-none" aria-label="笔记排序">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="engagement">综合互动</SelectItem>
                        <SelectItem value="collections">收藏最多</SelectItem>
                        <SelectItem value="likes">点赞最多</SelectItem>
                        <SelectItem value="comments">评论最多</SelectItem>
                        <SelectItem value="published_at">发布时间</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="mt-3 overflow-x-auto border-y bg-card">
                    {notesLoading ? (
                      <div className="flex h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
                        <LoaderCircle className="size-4 animate-spin" />正在加载笔记
                      </div>
                    ) : notes.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-muted-foreground">同步后显示账号公开笔记</p>
                    ) : (
                      <table className="w-full min-w-[860px] border-collapse text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3 font-medium">笔记</th>
                            <th className="px-3 py-3 text-right font-medium">赞</th>
                            <th className="px-3 py-3 text-right font-medium">藏</th>
                            <th className="px-3 py-3 text-right font-medium">评</th>
                            <th className="px-3 py-3 text-right font-medium">转</th>
                            <th className="px-3 py-3 text-right font-medium">收藏赞比</th>
                            <th className="px-4 py-3 font-medium">发布时间</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {notes.map((note) => (
                            <tr key={note.id}>
                              <td className="max-w-[420px] px-4 py-3">
                                <a href={`https://www.xiaohongshu.com/explore/${note.id}`} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-start gap-1.5 font-medium hover:text-primary">
                                  <span className="min-w-0">
                                    <span className="line-clamp-2">{note.title || "无标题笔记"}</span>
                                    {highlightedNoteIds.has(note.id) && <Badge className="mt-1 bg-red-600 text-white hover:bg-red-600">重点</Badge>}
                                  </span>
                                  <ExternalLink className="mt-0.5 size-3.5 shrink-0" />
                                </a>
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums">{formatMetric(note.liked_count)}</td>
                              <td className="px-3 py-3 text-right tabular-nums">{formatMetric(note.collected_count)}</td>
                              <td className="px-3 py-3 text-right tabular-nums">{formatMetric(note.comment_count)}</td>
                              <td className="px-3 py-3 text-right tabular-nums">{formatMetric(note.share_count)}</td>
                              <td className="px-3 py-3 text-right tabular-nums">{note.save_like_ratio || 0}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{note.published_at ? formatDate(note.published_at) : "未知"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <Dialog open={discoveryOpen} onOpenChange={setDiscoveryOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogTitle>发现对标账号</DialogTitle>
          <DialogDescription>优先使用 CLI 从公开笔记搜索结果中聚合作者，按关键词覆盖度和赞藏表现排序。</DialogDescription>

          {error && (
            <div className="flex items-start gap-2 border-y border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px_130px_auto] sm:items-end">
            <div className="space-y-1.5">
              <label htmlFor="discovery-keywords" className="text-sm font-medium">赛道关键词</label>
              <Textarea
                id="discovery-keywords"
                value={discoveryKeywords}
                onChange={(event) => setDiscoveryKeywords(event.target.value)}
                rows={3}
                placeholder="汽车香氛、车载香薰、汽车好物"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">搜索数据源</label>
              <Select value={discoverySource} onValueChange={(value) => setDiscoverySource(value as CreatorAccount["data_source"])}>
                <SelectTrigger className="bg-background shadow-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">自动选择</SelectItem>
                  <SelectItem value="cli" disabled={!sourceStatus?.cli_authenticated}>CLI</SelectItem>
                  <SelectItem value="tikhub" disabled={!sourceStatus?.tikhub_configured}>TikHub</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">每词页数</label>
              <Select value={String(discoveryPageLimit)} onValueChange={(value) => setDiscoveryPageLimit(Number(value))}>
                <SelectTrigger className="bg-background shadow-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3].map((value) => <SelectItem key={value} value={String(value)}>{value} 页</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={() => void handleDiscover()} disabled={discoveryLoading || splitPillars(discoveryKeywords).length === 0}>
              {discoveryLoading ? <LoaderCircle className="animate-spin" /> : <Search />}
              {discoveryLoading ? "正在搜索" : "开始搜索"}
            </Button>
          </div>

          {discoveryWarnings.length > 0 && (
            <div className="border-y border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
              {discoveryWarnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          )}

          <div className="divide-y border-y bg-card">
            {discoveryCandidates.map((candidate, index) => {
              const alreadyTracked = accounts.some((account) => (
                account.xhs_user_id === candidate.user_id
                || Boolean(candidate.red_id && account.red_id === candidate.red_id)
                || account.profile_data.user_id === candidate.user_id
              ))
              return (
                <div key={candidate.user_id} className="grid gap-3 px-4 py-4 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-start">
                  <span className="pt-0.5 text-xs font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={`https://www.xiaohongshu.com/user/profile/${candidate.user_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-primary">
                        {candidate.nickname}<ExternalLink className="size-3.5" />
                      </a>
                      <Badge variant="outline">命中 {candidate.keywords.length} 个词</Badge>
                      <span className="text-xs text-muted-foreground">赞 {formatMetric(candidate.total_likes)} · 藏 {formatMetric(candidate.total_collections)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {candidate.keywords.map((keyword) => <Badge key={keyword} variant="secondary">{keyword}</Badge>)}
                    </div>
                    <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                      {candidate.sample_notes.slice(0, 3).map((note) => (
                        <p key={note.id} className="line-clamp-1">{note.title || "无标题"} · 赞 {formatMetric(note.liked_count)} / 藏 {formatMetric(note.collected_count)}</p>
                      ))}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleAddCandidate(candidate)}
                    disabled={!canManage || alreadyTracked || addingCandidateId === candidate.user_id}
                  >
                    {addingCandidateId === candidate.user_id ? <LoaderCircle className="animate-spin" /> : <UserPlus />}
                    {alreadyTracked ? "已跟踪" : canManage ? "加入跟踪" : "管理员可加入"}
                  </Button>
                </div>
              )
            })}
            {!discoveryLoading && discoveryCandidates.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {discoverySearched ? "没有找到可用的对标账号，请调整关键词或数据源" : "输入关键词后开始搜索"}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogTitle>{editingAccount ? "编辑账号" : "添加账号"}</DialogTitle>
          <DialogDescription>同步小红书公开资料和笔记；自有账号还可以配置为 AI 发布账号画像。</DialogDescription>

          {error && (
            <div className="flex items-start gap-2 border-y border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="creator-name" className="text-sm font-medium">内部名称</label>
                <Input id="creator-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="例如：Ruby Rain 车生活号" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="creator-xhs-id" className="text-sm font-medium">小红书用户 ID 或主页链接</label>
                <Input id="creator-xhs-id" value={form.xhs_user_id} onChange={(event) => setForm((current) => ({ ...current, xhs_user_id: event.target.value }))} placeholder="用户主页 /user/profile/ 后的 ID" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">账号类型</label>
                <Select
                  value={form.account_kind}
                  onValueChange={(value) => setForm((current) => ({
                    ...current,
                    account_kind: value as CreatorAccount["account_kind"],
                  }))}
                >
                  <SelectTrigger className="bg-background shadow-none"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owned">自有账号</SelectItem>
                    <SelectItem value="competitor">对标账号</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs leading-5 text-muted-foreground">自有账号可供 AI 创作选择；对标账号仅用于竞品分析。</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">公开数据源</label>
                <Select value={form.data_source} onValueChange={(value) => setForm((current) => ({ ...current, data_source: value as CreatorAccount["data_source"] }))}>
                  <SelectTrigger className="bg-background shadow-none"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">自动选择</SelectItem>
                    <SelectItem value="cli" disabled={!sourceStatus?.cli_installed}>CLI 登录会话</SelectItem>
                    <SelectItem value="tikhub" disabled={!sourceStatus?.tikhub_configured}>TikHub API</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs leading-5 text-muted-foreground">自动模式优先 CLI，CLI 不可用时才回退 TikHub；也可手动指定数据源。</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="creator-positioning" className="text-sm font-medium">账号定位</label>
                <Textarea id="creator-positioning" value={form.positioning} onChange={(event) => setForm((current) => ({ ...current, positioning: event.target.value }))} rows={4} placeholder="账号长期输出什么内容、解决什么问题" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="creator-audience" className="text-sm font-medium">目标受众</label>
                <Textarea id="creator-audience" value={form.target_audience} onChange={(event) => setForm((current) => ({ ...current, target_audience: event.target.value }))} rows={4} placeholder="核心人群、使用场景、关注点" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="creator-tone" className="text-sm font-medium">语气与人设</label>
                <Textarea id="creator-tone" value={form.tone_style} onChange={(event) => setForm((current) => ({ ...current, tone_style: event.target.value }))} rows={4} placeholder="例如：专业但不说教，像懂车的朋友" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="creator-pillars" className="text-sm font-medium">内容支柱</label>
                <Textarea id="creator-pillars" value={pillarsText} onChange={(event) => setPillarsText(event.target.value)} rows={4} placeholder="用逗号分隔，例如：车内香氛、用车场景、送礼" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="creator-title" className="text-sm font-medium">标题要求</label>
                <Textarea id="creator-title" value={form.title_guidelines} onChange={(event) => setForm((current) => ({ ...current, title_guidelines: event.target.value }))} rows={4} placeholder="偏好的钩子、长度、避免的标题套路" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="creator-body" className="text-sm font-medium">正文要求</label>
                <Textarea id="creator-body" value={form.body_guidelines} onChange={(event) => setForm((current) => ({ ...current, body_guidelines: event.target.value }))} rows={4} placeholder="开头方式、段落节奏、内容结构" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="creator-conversion" className="text-sm font-medium">转化目标</label>
                <Textarea id="creator-conversion" value={form.conversion_goal} onChange={(event) => setForm((current) => ({ ...current, conversion_goal: event.target.value }))} rows={3} placeholder="希望读者看完后采取什么行动" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="creator-prohibited" className="text-sm font-medium">禁用表达</label>
                <Textarea id="creator-prohibited" value={form.prohibited_terms} onChange={(event) => setForm((current) => ({ ...current, prohibited_terms: event.target.value }))} rows={3} placeholder="不能出现的词、承诺或表达方式" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_active} onCheckedChange={(checked) => setForm((current) => ({ ...current, is_active: checked === true }))} />
              {form.account_kind === "owned" ? "在 AI 创作中启用" : "纳入对标跟踪"}
            </label>

            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" variant="outline" data-analyze="false" disabled={!form.name.trim() || !form.xhs_user_id.trim() || saving}>
                {saving && !submitAndAnalyze ? <LoaderCircle className="animate-spin" /> : <Pencil />}
                保存
              </Button>
              {canQuery && <Button type="submit" data-analyze="true" disabled={!form.name.trim() || !form.xhs_user_id.trim() || saving}>
                {saving && submitAndAnalyze ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                保存并同步分析
              </Button>}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
