"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  AtSign,
  BarChart3,
  CheckCircle2,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
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
import { Textarea } from "@/components/ui/textarea"
import {
  analyzeCreatorAccount,
  createCreatorAccount,
  getCreatorAccounts,
  updateCreatorAccount,
  type CreatorAccount,
  type CreatorAccountPayload,
} from "@/lib/api"


const EMPTY_FORM: CreatorAccountPayload = {
  name: "",
  xhs_user_id: "",
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
  const [submitAndAnalyze, setSubmitAndAnalyze] = useState(false)

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null,
    [accounts, selectedAccountId]
  )

  useEffect(() => {
    if (user?.role !== "admin" && user?.role !== "manager") return
    let active = true
    getCreatorAccounts()
      .then((results) => {
        if (!active) return
        setAccounts(results)
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
  }, [user?.role])

  const replaceAccount = (updated: CreatorAccount) => {
    setAccounts((current) => {
      const exists = current.some((account) => account.id === updated.id)
      return exists
        ? current.map((account) => account.id === updated.id ? updated : account)
        : [...current, updated]
    })
    setSelectedAccountId(updated.id)
  }

  const openCreate = () => {
    setEditingAccount(null)
    setForm(EMPTY_FORM)
    setPillarsText("")
    setError("")
    setSubmitAndAnalyze(false)
    setDialogOpen(true)
  }

  const openEdit = (account: CreatorAccount) => {
    setEditingAccount(account)
    setForm(toForm(account))
    setPillarsText(account.content_pillars.join("、"))
    setError("")
    setSubmitAndAnalyze(false)
    setDialogOpen(true)
  }

  const handleAnalyze = async (account: CreatorAccount) => {
    setAnalyzingId(account.id)
    setError("")
    try {
      const analyzed = await analyzeCreatorAccount(account.id)
      replaceAccount(analyzed)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "账号数据同步与分析失败")
    } finally {
      setAnalyzingId("")
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
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
      if (shouldAnalyze) await handleAnalyze(saved)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "创作账号保存失败")
    } finally {
      setSaving(false)
      setSubmitAndAnalyze(false)
    }
  }

  const handleToggleActive = async (account: CreatorAccount) => {
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

  if (user?.role !== "admin" && user?.role !== "manager") {
    return (
      <div className="min-h-screen">
        <Header showActions={false} />
        <main className="app-container py-16 text-center">
          <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">没有创作账号管理权限</h1>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header showActions={false} />
      <main className="app-container py-6 lg:py-8">
        <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-primary">
              <ShieldCheck className="size-3.5" />
              管理员工作区
            </div>
            <h1 className="text-2xl font-semibold">创作账号管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {accounts.length} 个账号 · {accounts.filter((account) => account.is_active).length} 个启用
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus />
            添加创作账号
          </Button>
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
            <h2 className="mt-4 text-base font-semibold">尚未配置创作账号</h2>
            <Button className="mt-5" onClick={openCreate}><Plus />添加创作账号</Button>
          </div>
        ) : (
          <>
            <div className="mt-5 overflow-x-auto border-y bg-card">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">账号</th>
                    <th className="px-4 py-3 font-medium">人工定位</th>
                    <th className="px-4 py-3 font-medium">分析样本</th>
                    <th className="px-4 py-3 font-medium">最近同步</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {accounts.map((account) => (
                    <tr key={account.id} className={selectedAccount?.id === account.id ? "bg-primary/[0.035]" : undefined}>
                      <td className="px-4 py-3.5">
                        <button type="button" onClick={() => setSelectedAccountId(account.id)} className="text-left">
                          <span className="block font-medium">{account.name}</span>
                          <span className="block text-xs text-muted-foreground">{account.nickname || account.red_id || account.xhs_user_id}</span>
                        </button>
                      </td>
                      <td className="max-w-[320px] px-4 py-3.5 text-muted-foreground">
                        <p className="line-clamp-2">{account.positioning || "未填写"}</p>
                      </td>
                      <td className="px-4 py-3.5">{account.analysis.sample_count || 0} 篇</td>
                      <td className="px-4 py-3.5 text-muted-foreground">{formatDate(account.last_analyzed_at)}</td>
                      <td className="px-4 py-3.5">
                        <span className={account.is_active ? "text-emerald-700" : "text-muted-foreground"}>{account.is_active ? "已启用" : "已停用"}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" onClick={() => setSelectedAccountId(account.id)} aria-label={`查看${account.name}分析`} title="查看分析">
                            <BarChart3 />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => void handleAnalyze(account)} disabled={analyzingId === account.id} aria-label={`同步分析${account.name}`} title="同步并分析">
                            {analyzingId === account.id ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(account)} aria-label={`编辑${account.name}`} title="编辑账号">
                            <Pencil />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className={account.is_active ? "text-muted-foreground" : "text-emerald-700"} onClick={() => void handleToggleActive(account)} disabled={analyzingId === account.id} aria-label={account.is_active ? `停用${account.name}` : `启用${account.name}`} title={account.is_active ? "停用账号" : "启用账号"}>
                            <Power />
                          </Button>
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
                      <h2 id="account-analysis-heading" className="text-lg font-semibold">{selectedAccount.name} · 基础画像</h2>
                      {selectedAccount.last_analyzed_at && <Badge variant="outline"><CheckCircle2 />已同步</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">数据时间：{formatDate(selectedAccount.last_analyzed_at)}</p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => void handleAnalyze(selectedAccount)} disabled={analyzingId === selectedAccount.id}>
                    {analyzingId === selectedAccount.id ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                    {analyzingId === selectedAccount.id ? "正在同步" : "同步并重新分析"}
                  </Button>
                </div>

                <dl className="mt-5 grid border-y bg-card sm:grid-cols-2 lg:grid-cols-4">
                  <div className="border-b px-4 py-4 sm:border-r lg:border-b-0">
                    <dt className="text-xs text-muted-foreground">粉丝</dt>
                    <dd className="mt-1 text-xl font-semibold">{selectedAccount.analysis.profile_metrics?.followers ?? 0}</dd>
                  </div>
                  <div className="border-b px-4 py-4 lg:border-b-0 lg:border-r">
                    <dt className="text-xs text-muted-foreground">分析样本</dt>
                    <dd className="mt-1 text-xl font-semibold">{selectedAccount.analysis.sample_count || 0}</dd>
                  </div>
                  <div className="border-b px-4 py-4 sm:border-b-0 sm:border-r">
                    <dt className="text-xs text-muted-foreground">平均标题长度</dt>
                    <dd className="mt-1 text-xl font-semibold">{selectedAccount.analysis.average_title_length || 0}<span className="ml-1 text-xs font-normal text-muted-foreground">字</span></dd>
                  </div>
                  <div className="px-4 py-4">
                    <dt className="text-xs text-muted-foreground">平均正文长度</dt>
                    <dd className="mt-1 text-xl font-semibold">{selectedAccount.analysis.average_body_length || 0}<span className="ml-1 text-xs font-normal text-muted-foreground">字</span></dd>
                  </div>
                </dl>

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
                            <p className="mt-1 text-xs text-muted-foreground">赞 {note.liked_count} · 评 {note.comment_count} · 藏 {note.collected_count}</p>
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
              </section>
            )}
          </>
        )}
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogTitle>{editingAccount ? "编辑创作账号" : "添加创作账号"}</DialogTitle>
          <DialogDescription>配置账号的人工定位规则，并可通过小红书公开笔记生成基础画像。</DialogDescription>

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
              在 AI 创作中启用
            </label>

            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" variant="outline" data-analyze="false" disabled={!form.name.trim() || !form.xhs_user_id.trim() || saving}>
                {saving && !submitAndAnalyze ? <LoaderCircle className="animate-spin" /> : <Pencil />}
                保存
              </Button>
              <Button type="submit" data-analyze="true" disabled={!form.name.trim() || !form.xhs_user_id.trim() || saving}>
                {saving && submitAndAnalyze ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                保存并同步分析
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
