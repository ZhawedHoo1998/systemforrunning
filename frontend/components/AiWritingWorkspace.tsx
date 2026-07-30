"use client"

import { useState } from "react"
import Image from "next/image"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  FilePenLine,
  History,
  LoaderCircle,
  Maximize2,
  MessageSquareText,
  Sparkles,
  Star,
} from "lucide-react"
import { ImageLightbox, type PreviewImage } from "@/components/ImageLightbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { AiDraft, AiWritingPlan, Attachment } from "@/lib/api"
import { cn } from "@/lib/utils"

interface PlanWorkspaceProps {
  plans: AiWritingPlan[]
  activePlan: AiWritingPlan | null
  onSelectPlan: (planId: string) => void
  onSelectTitle: (titleId: string) => void
  onToggleDirection: (directionId: string) => void
  onDevelopDraft: () => void
}

export function AiPlanWorkspace({
  plans,
  activePlan,
  onSelectPlan,
  onSelectTitle,
  onToggleDirection,
  onDevelopDraft,
}: PlanWorkspaceProps) {
  if (!activePlan) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 grid size-11 place-items-center rounded-full bg-accent text-primary">
          <Sparkles className="size-5" />
        </span>
        <h2 className="text-sm font-semibold">还没有可选方案</h2>
        <p className="mt-1 text-xs text-muted-foreground">先在 AI 对话中讨论，准备好后再整理标题与创作方案</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">方案选择</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">标题单选，内容方向最多组合两项</p>
        </div>
        {plans.length > 1 && (
          <Select value={activePlan.id} onValueChange={onSelectPlan}>
            <SelectTrigger className="h-8 w-36" aria-label="切换创作方案">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plans.map((plan, index) => (
                <SelectItem key={plan.id} value={plan.id}>方案 {index + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        <section className="border-b pb-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-primary">想法理解</span>
            {activePlan.recommendation_reason && <Badge variant="secondary">AI 推荐已标记</Badge>}
          </div>
          <p className="text-sm leading-7 text-foreground/85">{activePlan.understanding}</p>
          {activePlan.factual_questions.length > 0 && (
            <div className="mt-3 space-y-1 text-xs leading-5 text-amber-800">
              {activePlan.factual_questions.map((question) => <p key={question}>待确认：{question}</p>)}
            </div>
          )}
        </section>

        <section className="border-b py-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">标题候选</h3>
            <span className="text-xs text-muted-foreground">{activePlan.titles.length} 个</span>
          </div>
          <div className="divide-y rounded-md border">
            {activePlan.titles.map((title) => {
              const selected = activePlan.selected_title_id === title.id
              const recommended = activePlan.recommended_title_id === title.id
              return (
                <label
                  key={title.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/50",
                    selected && "bg-accent/60"
                  )}
                >
                  <input
                    type="radio"
                    name={`title-${activePlan.id}`}
                    value={title.id}
                    checked={selected}
                    onChange={() => onSelectTitle(title.id)}
                    className="mt-1 size-4 accent-[var(--primary)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{title.category}</Badge>
                      {recommended && <Badge variant="secondary">推荐</Badge>}
                    </span>
                    <span className="mt-1.5 block text-sm font-medium leading-6">{title.text}</span>
                    {title.rationale && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{title.rationale}</span>}
                  </span>
                </label>
              )
            })}
          </div>
        </section>

        <section className="border-b py-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">内容方向</h3>
            <span className="text-xs text-muted-foreground">已选 {activePlan.selected_direction_ids.length}/2</span>
          </div>
          <div className="divide-y rounded-md border">
            {activePlan.directions.map((direction) => {
              const selected = activePlan.selected_direction_ids.includes(direction.id)
              const recommended = activePlan.recommended_direction_ids.includes(direction.id)
              const disabled = !selected && activePlan.selected_direction_ids.length >= 2
              return (
                <label
                  key={direction.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/50",
                    selected && "bg-accent/60",
                    disabled && "cursor-not-allowed opacity-55"
                  )}
                >
                  <Checkbox
                    checked={selected}
                    disabled={disabled}
                    onCheckedChange={() => onToggleDirection(direction.id)}
                    aria-label={`选择内容方向 ${direction.name}`}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold">{direction.name}</span>
                      {direction.content_type && <Badge variant="outline">{direction.content_type}</Badge>}
                      {direction.conversion_strength && (
                        <Badge variant="outline">带货 {direction.conversion_strength}</Badge>
                      )}
                      {recommended && <Badge variant="secondary">推荐</Badge>}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{direction.summary}</span>
                    <span className="mt-2 block text-xs leading-5"><strong>开头：</strong>{direction.opening}</span>
                    <span className="mt-1 block text-xs leading-5"><strong>语气：</strong>{direction.tone}</span>
                    <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                      {direction.outline.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                  </span>
                </label>
              )
            })}
          </div>
          {activePlan.recommendation_reason && (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">推荐理由：{activePlan.recommendation_reason}</p>
          )}
        </section>

        {(activePlan.cover_suggestions ?? []).length > 0 && (
          <section className="border-b py-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">首图建议</h3>
              <span className="text-xs text-muted-foreground">{activePlan.cover_suggestions?.length} 种</span>
            </div>
            <div className="divide-y rounded-md border">
              {activePlan.cover_suggestions?.map((cover) => (
                <div key={cover.id} className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{cover.type}</Badge>
                    {cover.headline && <span className="text-sm font-semibold">{cover.headline}</span>}
                  </div>
                  <p className="mt-2 text-xs leading-5"><strong>画面：</strong>{cover.visual}</p>
                  {cover.rationale && (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{cover.rationale}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {activePlan.testing_advice && (
          <section className="py-5">
            <h3 className="text-sm font-semibold">发布测试建议</h3>
            <p className="mt-2 text-sm leading-6">{activePlan.testing_advice.primary_goal}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">发布前</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5">
                  {activePlan.testing_advice.pre_publish_checks.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">观察信号</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5">
                  {activePlan.testing_advice.success_signals.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">迭代动作</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5">
                  {activePlan.testing_advice.iteration_actions.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="flex items-center justify-end border-t bg-card px-5 py-3">
        <Button
          type="button"
          onClick={onDevelopDraft}
          disabled={!activePlan.selected_title_id || activePlan.selected_direction_ids.length === 0}
        >
          <MessageSquareText />
          采用并继续讨论
        </Button>
      </div>
    </div>
  )
}

interface DraftWorkspaceProps {
  draft: AiDraft
  latestAssistant: string
  exportableImages: Attachment[]
  exporting: boolean
  copyNotice: string
  onTitleChange: (value: string) => void
  onContentChange: (value: string) => void
  onApplyAssistant: () => void
  onRestoreVersion: (versionId: string) => void
  onToggleAsset: (path: string) => void
  onMoveAsset: (path: string, direction: -1 | 1) => void
  onSetCover: (path: string) => void
  onCopyTitle: () => void
  onCopyContent: () => void
  onExport: () => void
}

export function AiDraftWorkspace({
  draft,
  latestAssistant,
  exportableImages,
  exporting,
  copyNotice,
  onTitleChange,
  onContentChange,
  onApplyAssistant,
  onRestoreVersion,
  onToggleAsset,
  onMoveAsset,
  onSetCover,
  onCopyTitle,
  onCopyContent,
  onExport,
}: DraftWorkspaceProps) {
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null)
  const selectedPaths = new Set(draft.selected_asset_paths)
  const imagesByPath = new Map(exportableImages.map((image) => [image.path, image]))
  const selectedImages = draft.selected_asset_paths.flatMap((path) => {
    const image = imagesByPath.get(path)
    return image ? [image] : []
  })

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">最终文稿</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{draft.content.length} 字 · {selectedImages.length} 张导出配图</p>
          </div>
          <div className="flex items-center gap-1.5">
            {draft.versions.length > 0 && (
              <Select onValueChange={onRestoreVersion}>
                <SelectTrigger className="h-8 w-32" aria-label="恢复文稿版本">
                  <History className="size-3.5" />
                  <SelectValue placeholder={`${draft.versions.length} 个版本`} />
                </SelectTrigger>
                <SelectContent>
                  {draft.versions.slice().reverse().map((version, index) => (
                    <SelectItem key={version.id} value={version.id}>版本 {draft.versions.length - index} · {version.source}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button type="button" variant="outline" size="sm" onClick={onCopyTitle} disabled={!draft.title.trim()}>
              <Clipboard />
              复制标题
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onCopyContent} disabled={!draft.content.trim()}>
              <Clipboard />
              复制正文
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {copyNotice && (
            <div className="mb-4 flex items-center gap-2 border-y border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <Check className="size-3.5" />
              {copyNotice}
            </div>
          )}

          <section className="border-b pb-5">
            <label className="mb-2 block text-xs font-semibold text-muted-foreground" htmlFor="final-draft-title">最终标题</label>
            <Input
              id="final-draft-title"
              value={draft.title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="选择方案或输入最终标题"
              className="h-11 text-base font-semibold"
            />
            <div className="mt-4 flex items-center justify-between gap-3">
              <label className="text-xs font-semibold text-muted-foreground" htmlFor="final-draft-content">最终正文</label>
              {latestAssistant && latestAssistant.trim() !== draft.content.trim() && (
                <Button type="button" variant="outline" size="sm" onClick={onApplyAssistant}>
                  <Sparkles />
                  采用本轮 AI 回复
                </Button>
              )}
            </div>
            <Textarea
              id="final-draft-content"
              value={draft.content}
              onChange={(event) => onContentChange(event.target.value)}
              placeholder="采用方案后，AI 生成的正文会进入这里"
              rows={18}
              className="mt-2 min-h-[420px] resize-y bg-background text-[15px] leading-7"
            />
          </section>

          <section className="pt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">发布配图</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">勾选后按顺序导出，星标图片作为首图</p>
              </div>
              <span className="text-xs text-muted-foreground">已选 {selectedImages.length} 张</span>
            </div>
            {exportableImages.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {exportableImages.map((image) => {
                  const selected = selectedPaths.has(image.path)
                  const selectedIndex = draft.selected_asset_paths.indexOf(image.path)
                  const isCover = draft.cover_asset_path === image.path
                  return (
                    <div key={image.path} className={cn("overflow-hidden rounded-md border bg-muted", selected && "border-primary ring-2 ring-primary/20")}>
                      <div className="group relative aspect-square">
                        <Image src={image.path} alt={image.name} fill sizes="260px" className="object-cover" unoptimized />
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => onToggleAsset(image.path)}
                          className="absolute right-2 top-2 z-10 size-5 bg-background/90"
                          aria-label={`${selected ? "取消导出" : "选择导出"}${image.name}`}
                        />
                        {selected && (
                          <span className="absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-white">
                            {selectedIndex + 1}{isCover ? " · 首图" : ""}
                          </span>
                        )}
                        <button
                          type="button"
                          className="absolute bottom-2 right-2 grid size-7 place-items-center rounded bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => setPreviewImage({ src: image.path, alt: image.name, name: image.name })}
                          aria-label={`放大${image.name}`}
                          title="查看大图"
                        >
                          <Maximize2 className="size-3.5" />
                        </button>
                      </div>
                      {selected && (
                        <div className="flex items-center justify-between border-t bg-background px-1.5 py-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => onSetCover(image.path)}
                            aria-label={`设为首图${image.name}`}
                            title="设为首图"
                          >
                            <Star className={cn("size-3.5", isCover && "fill-current text-amber-500")} />
                          </Button>
                          <div className="flex items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => onMoveAsset(image.path, -1)}
                              disabled={selectedIndex <= 0}
                              aria-label={`前移${image.name}`}
                              title="前移"
                            >
                              <ArrowLeft className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => onMoveAsset(image.path, 1)}
                              disabled={selectedIndex >= draft.selected_asset_paths.length - 1}
                              aria-label={`后移${image.name}`}
                              title="后移"
                            >
                              <ArrowRight className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-md bg-muted/50 px-3 py-3 text-xs text-muted-foreground">当前创作还没有生成配图</p>
            )}
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-card px-5 py-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {draft.title.trim() && draft.content.trim() ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <FilePenLine className="size-3.5" />}
            {draft.title.trim() && draft.content.trim() ? "文稿可导出" : "填写最终标题和正文后可导出"}
          </span>
          <Button type="button" onClick={onExport} disabled={!draft.title.trim() || !draft.content.trim() || exporting}>
            {exporting ? <LoaderCircle className="animate-spin" /> : <Download />}
            {exporting ? "正在整理发布包" : "一键导出发布包"}
          </Button>
        </div>
      </div>

      <ImageLightbox image={previewImage} onOpenChange={(open) => !open && setPreviewImage(null)} />
    </>
  )
}
