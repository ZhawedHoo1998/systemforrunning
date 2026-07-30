"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ImagePlus,
  Images,
  LoaderCircle,
  Maximize2,
  MessageSquarePlus,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react"
import { ImageLightbox, type PreviewImage } from "@/components/ImageLightbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type {
  AiCollageSettings,
  AiCollageTemplate,
  AiImageMessage,
  AiImageMode,
  Attachment,
} from "@/lib/api"
import { cn } from "@/lib/utils"

interface SourceImage {
  attachment: Attachment
  label: string
}

interface ImageThreadSummary {
  id: string
  title: string
  generationCount: number
  isGenerating: boolean
}

const COLLAGE_TEMPLATES: {
  id: AiCollageTemplate
  label: string
  countLabel: string
  minimumImages: number
  imageLimit: number
}[] = [
  { id: "hero_headline", label: "大图标题", countLabel: "1 图", minimumImages: 1, imageLimit: 1 },
  { id: "split_compare", label: "左右对比", countLabel: "2 图", minimumImages: 2, imageLimit: 2 },
  { id: "story_triptych", label: "三段故事", countLabel: "3 图", minimumImages: 3, imageLimit: 3 },
  { id: "detail_grid", label: "四宫格", countLabel: "4 图", minimumImages: 4, imageLimit: 4 },
  { id: "review_card", label: "测评卡片", countLabel: "1-3 图", minimumImages: 1, imageLimit: 3 },
]

const COLLAGE_PALETTES = [
  { label: "纸白", background: "#F7F7F5", text: "#171717" },
  { label: "墨黑", background: "#171717", text: "#FFFFFF" },
  { label: "莓红", background: "#B42318", text: "#FFFFFF" },
  { label: "松绿", background: "#1E4D3A", text: "#FFFFFF" },
]

function CollageTemplatePreview({ template }: { template: AiCollageTemplate }) {
  const block = "bg-current/65"
  return (
    <span className="grid aspect-[3/4] h-12 shrink-0 gap-0.5 rounded-sm border border-current/25 p-1">
      {template === "hero_headline" && (
        <>
          <span className="h-2 rounded-[1px] bg-current/25" />
          <span className={cn("rounded-[1px]", block)} />
        </>
      )}
      {template === "split_compare" && (
        <>
          <span className="h-2 rounded-[1px] bg-current/25" />
          <span className="grid grid-cols-2 gap-0.5">
            <span className={cn("rounded-[1px]", block)} />
            <span className={cn("rounded-[1px]", block)} />
          </span>
        </>
      )}
      {template === "story_triptych" && (
        <>
          <span className="h-2 rounded-[1px] bg-current/25" />
          <span className={cn("rounded-[1px]", block)} />
          <span className={cn("rounded-[1px]", block)} />
          <span className={cn("rounded-[1px]", block)} />
        </>
      )}
      {template === "detail_grid" && (
        <>
          <span className="h-2 rounded-[1px] bg-current/25" />
          <span className="grid grid-cols-2 grid-rows-2 gap-0.5">
            {[0, 1, 2, 3].map((index) => <span key={index} className={cn("rounded-[1px]", block)} />)}
          </span>
        </>
      )}
      {template === "review_card" && (
        <>
          <span className="h-2 rounded-[1px] bg-current/25" />
          <span className={cn("rounded-[1px]", block)} />
          <span className="grid grid-cols-[1fr_1.4fr] gap-0.5">
            <span className={cn("rounded-[1px]", block)} />
            <span className="rounded-[1px] bg-current/25" />
          </span>
        </>
      )}
    </span>
  )
}

interface AiImageWorkspaceProps {
  selectedMaterialImages: SourceImage[]
  selectedCreatorNoteImages: SourceImage[]
  uploadedReferenceImages: SourceImage[]
  historicalReferenceImages: SourceImage[]
  generatedImageSources: SourceImage[]
  imageThreads: ImageThreadSummary[]
  activeThreadId: string
  selectedReferences: Attachment[]
  imageMessages: AiImageMessage[]
  generatedImages: Attachment[]
  generatingImage: boolean
  imageGenerationBusy: boolean
  uploadingReferences: boolean
  imageMode: AiImageMode
  imagePrompt: string
  collageSettings: AiCollageSettings
  imageReady: boolean
  latestAssistant: string
  onSelectThread: (threadId: string) => void
  onCreateThread: () => void
  onToggleReferenceAttachment: (attachment: Attachment) => void
  onUploadReferenceImages: (files: File[]) => void
  onImageModeChange: (mode: AiImageMode) => void
  onImagePromptChange: (value: string) => void
  onCollageSettingsChange: (patch: Partial<AiCollageSettings>) => void
  onMoveReferenceAttachment: (path: string, direction: -1 | 1) => void
  onGenerateImage: () => void
}

export function AiImageWorkspace({
  selectedMaterialImages,
  selectedCreatorNoteImages,
  uploadedReferenceImages,
  historicalReferenceImages,
  generatedImageSources,
  imageThreads,
  activeThreadId,
  selectedReferences,
  imageMessages,
  generatedImages,
  generatingImage,
  imageGenerationBusy,
  uploadingReferences,
  imageMode,
  imagePrompt,
  collageSettings,
  imageReady,
  latestAssistant,
  onSelectThread,
  onCreateThread,
  onToggleReferenceAttachment,
  onUploadReferenceImages,
  onImageModeChange,
  onImagePromptChange,
  onCollageSettingsChange,
  onMoveReferenceAttachment,
  onGenerateImage,
}: AiImageWorkspaceProps) {
  const [expanded, setExpanded] = useState(false)
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null)
  const selectedPaths = useMemo(
    () => new Set(selectedReferences.map((attachment) => attachment.path)),
    [selectedReferences]
  )
  const selectedTemplate = COLLAGE_TEMPLATES.find(
    (template) => template.id === collageSettings.template
  ) ?? COLLAGE_TEMPLATES[0]
  const collageReady = Boolean(
    collageSettings.title.trim()
    && selectedReferences.length >= selectedTemplate.minimumImages
  )

  const openAttachment = (attachment: Attachment, alt: string) => {
    setPreviewImage({ src: attachment.path, alt, name: attachment.name })
  }

  const renderThreadBar = () => (
    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto px-3 py-2" role="tablist" aria-label="图片对话">
      {imageThreads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          role="tab"
          aria-selected={thread.id === activeThreadId}
          onClick={() => onSelectThread(thread.id)}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors",
            thread.id === activeThreadId ? "bg-accent text-accent-foreground" : "hover:bg-muted hover:text-foreground"
          )}
        >
          {thread.isGenerating ? <LoaderCircle className="size-3.5 animate-spin" /> : <Images className="size-3.5" />}
          {thread.title}
          {thread.generationCount > 0 && <span className="text-[10px] text-muted-foreground">{thread.generationCount}</span>}
        </button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        onClick={onCreateThread}
        aria-label="新建图片对话"
        title="新建图片对话"
      >
        <Plus />
      </Button>
    </div>
  )

  const renderSourceSection = (title: string, items: SourceImage[], isExpanded: boolean) => {
    if (items.length === 0) return null
    return (
      <div>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground">{items.length} 张</span>
        </div>
        <div className={cn(
          "grid max-h-52 grid-cols-4 gap-2 overflow-y-auto p-0.5",
          isExpanded && "max-h-[30vh] grid-cols-3"
        )}>
          {items.map(({ attachment, label }) => {
            const selected = selectedPaths.has(attachment.path)
            return (
              <div
                key={`${title}-${attachment.path}`}
                className={cn(
                  "group relative aspect-square overflow-hidden rounded-md border bg-muted transition",
                  selected && "border-primary ring-2 ring-primary/25"
                )}
                onDoubleClick={() => openAttachment(attachment, `${label} ${attachment.name}`)}
                title={`${label} · ${attachment.name}`}
              >
                <button
                  type="button"
                  className="absolute inset-0 z-10 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => onToggleReferenceAttachment(attachment)}
                  aria-label={`${selected ? "取消选择" : "选择"}${label}中的${attachment.name}`}
                >
                  <span className="sr-only">{selected ? "取消选择" : "选择"}</span>
                </button>
                <Image src={attachment.path} alt="" fill sizes="160px" className="object-cover" unoptimized />
                <span className={cn(
                  "absolute right-1 top-1 z-20 grid size-5 place-items-center rounded-full shadow-sm",
                  selected ? "bg-primary text-primary-foreground" : "border bg-background/85 text-muted-foreground"
                )}>
                  {selected ? <CheckCircle2 className="size-3.5" /> : <Plus className="size-3" />}
                </span>
                <button
                  type="button"
                  className="absolute bottom-1 left-1 z-20 grid size-6 place-items-center rounded bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => openAttachment(attachment, `${label} ${attachment.name}`)}
                  aria-label={`放大${attachment.name}`}
                  title="查看大图"
                >
                  <Maximize2 className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderSources = (isExpanded: boolean) => (
    <div className={cn("space-y-4", isExpanded && "space-y-5")}>
      {renderSourceSection("从已选素材选择", selectedMaterialImages, isExpanded)}
      {renderSourceSection("账号旧帖图片", selectedCreatorNoteImages, isExpanded)}
      {renderSourceSection("本次上传", uploadedReferenceImages, isExpanded)}
      {renderSourceSection("历史参考", historicalReferenceImages, isExpanded)}
      {renderSourceSection("历史生成", generatedImageSources, isExpanded)}

      {selectedMaterialImages.length === 0
        && selectedCreatorNoteImages.length === 0
        && uploadedReferenceImages.length === 0
        && historicalReferenceImages.length === 0
        && generatedImageSources.length === 0 && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">暂无可选图片</p>
        )}

      <label className={cn(
        "flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground",
        uploadingReferences && "pointer-events-none opacity-60"
      )}>
        {uploadingReferences ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {uploadingReferences ? "正在上传" : "从电脑上传参考图"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={uploadingReferences}
          className="sr-only"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ""
            if (files.length > 0) onUploadReferenceImages(files)
          }}
        />
      </label>

      <div className="border-t pt-4">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">本轮参考图</span>
          <span className="text-muted-foreground">已选 {selectedReferences.length}/8</span>
        </div>
        {selectedReferences.length > 0 ? (
          <div className={cn("grid grid-cols-4 gap-2", isExpanded && "grid-cols-3")}>
            {selectedReferences.map((attachment, index) => (
              <div
                key={attachment.path}
                className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                onDoubleClick={() => openAttachment(attachment, attachment.name)}
              >
                <Image src={attachment.path} alt={attachment.name} fill sizes="160px" className="object-cover" unoptimized />
                {imageMode === "collage" && (
                  <span className="absolute left-1 top-1 grid size-6 place-items-center rounded bg-black/70 text-[11px] font-semibold text-white">
                    {index + 1}
                  </span>
                )}
                <button
                  type="button"
                  className="absolute bottom-1 left-1 grid size-6 place-items-center rounded bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => openAttachment(attachment, attachment.name)}
                  aria-label={`放大${attachment.name}`}
                  title="查看大图"
                >
                  <Maximize2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded bg-background/90 text-foreground shadow-sm"
                  onClick={() => onToggleReferenceAttachment(attachment)}
                  aria-label={`移除参考图${attachment.name}`}
                  title="移除参考图"
                >
                  <X className="size-3.5" />
                </button>
                {imageMode === "collage" && (
                  <span className="absolute bottom-1 right-1 flex overflow-hidden rounded bg-background/90 shadow-sm">
                    <button
                      type="button"
                      className="grid size-6 place-items-center text-foreground disabled:opacity-35"
                      onClick={() => onMoveReferenceAttachment(attachment.path, -1)}
                      disabled={index === 0}
                      aria-label={`将第 ${index + 1} 张参考图前移`}
                      title="前移"
                    >
                      <ArrowLeft className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="grid size-6 place-items-center border-l text-foreground disabled:opacity-35"
                      onClick={() => onMoveReferenceAttachment(attachment.path, 1)}
                      disabled={index === selectedReferences.length - 1}
                      aria-label={`将第 ${index + 1} 张参考图后移`}
                      title="后移"
                    >
                      <ArrowRight className="size-3.5" />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">未选择参考图</p>
        )}
      </div>
    </div>
  )

  const renderHistory = (isExpanded: boolean) => (
    <div
      className={cn(
        "space-y-4",
        isExpanded
          ? "min-h-[280px] bg-muted/20 p-4 sm:p-5 lg:h-full lg:overflow-y-auto"
          : "max-h-[560px] overflow-y-auto border-y py-3 pr-1"
      )}
      aria-label="图片生成对话记录"
    >
      {imageMessages.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center text-muted-foreground">
          <span className="mb-3 grid size-10 place-items-center rounded-full bg-accent text-primary">
            <MessageSquarePlus className="size-5" />
          </span>
          <p className="text-sm font-medium text-foreground">新图片对话</p>
          <p className="mt-1 text-xs">已选 {selectedReferences.length} 张参考图</p>
        </div>
      ) : imageMessages.map((message) => {
        const references = message.references ?? (message.reference ? [message.reference] : [])
        return message.role === "user" ? (
          <div
            key={message.id}
            className={cn(
              "ml-auto space-y-2 rounded-md bg-primary px-3 py-2 text-sm leading-6 text-primary-foreground",
              isExpanded ? "max-w-[82%] sm:max-w-[72%]" : "ml-10"
            )}
          >
            {references.length > 0 && (
              <div className={cn("grid gap-1.5", references.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                {references.map((reference) => (
                  <button
                    key={reference.path}
                    type="button"
                    className={cn(
                      "relative block aspect-[4/3] w-full overflow-hidden rounded border border-primary-foreground/25 bg-background/10",
                      isExpanded && references.length === 1 && "ml-auto max-w-64"
                    )}
                    onClick={() => openAttachment(reference, "本轮参考图")}
                    aria-label={`放大本轮参考图${reference.name}`}
                    title="查看大图"
                  >
                    <Image src={reference.path} alt="本轮参考图" fill sizes="360px" className="object-contain" unoptimized />
                  </button>
                ))}
              </div>
            )}
            <p>{message.content}</p>
          </div>
        ) : (
          <div key={message.id} className={cn("space-y-2", isExpanded && "max-w-[90%]")}>
            <p className="text-xs font-medium text-muted-foreground">{message.content}</p>
            {message.image && (
              <>
                <button
                  type="button"
                  className={cn(
                    "group relative block aspect-[4/3] w-full overflow-hidden rounded-md border bg-muted",
                    isExpanded && "max-h-[58vh] max-w-3xl"
                  )}
                  onClick={() => openAttachment(message.image!, message.content)}
                  aria-label={`放大${message.content}`}
                  title="查看大图"
                >
                  <Image src={message.image.path} alt={message.content} fill sizes={isExpanded ? "900px" : "600px"} className="object-contain" unoptimized />
                  <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Maximize2 className="size-4" />
                  </span>
                </button>
                <Button
                  type="button"
                  variant={selectedPaths.has(message.image.path) ? "secondary" : "outline"}
                  size="sm"
                  className={cn("w-full", isExpanded && "max-w-3xl")}
                  onClick={() => onToggleReferenceAttachment(message.image!)}
                >
                  {selectedPaths.has(message.image.path) ? <CheckCircle2 /> : <Plus />}
                  {selectedPaths.has(message.image.path) ? "已加入本轮参考" : "加入本轮参考"}
                </Button>
              </>
            )}
          </div>
        )
      })}
      {generatingImage && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          正在生成图片
        </div>
      )}
    </div>
  )

  const renderCollageControls = (isExpanded: boolean) => (
    <div className="space-y-3 border-y py-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium">拼图版式</span>
        <span className="text-muted-foreground">1080 × 1440</span>
      </div>
      <div className={cn("grid grid-cols-2 gap-2", isExpanded && "sm:grid-cols-5")}>
        {COLLAGE_TEMPLATES.map((template) => {
          const selected = template.id === collageSettings.template
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onCollageSettingsChange({ template: template.id })}
              className={cn(
                "flex min-h-16 items-center gap-2 rounded-md border px-2 py-2 text-left text-xs transition-colors",
                selected
                  ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary/25"
                  : "bg-background text-muted-foreground hover:border-primary/60 hover:text-foreground"
              )}
              aria-pressed={selected}
            >
              <CollageTemplatePreview template={template.id} />
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{template.label}</span>
                <span className="mt-0.5 block text-[10px]">{template.countLabel}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className={cn("grid gap-2", isExpanded && "sm:grid-cols-2")}>
        <label className="space-y-1 text-xs font-medium">
          <span>封面标题</span>
          <Input
            value={collageSettings.title}
            onChange={(event) => onCollageSettingsChange({ title: event.target.value })}
            placeholder="输入主标题"
            maxLength={60}
          />
        </label>
        <label className="space-y-1 text-xs font-medium">
          <span>副标题</span>
          <Input
            value={collageSettings.subtitle}
            onChange={(event) => onCollageSettingsChange({ subtitle: event.target.value })}
            placeholder="可选"
            maxLength={120}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium">配色</span>
        {COLLAGE_PALETTES.map((palette) => {
          const selected = palette.background === collageSettings.background_color
            && palette.text === collageSettings.text_color
          return (
            <button
              key={palette.label}
              type="button"
              className={cn(
                "relative size-7 overflow-hidden rounded border shadow-sm",
                selected && "ring-2 ring-primary ring-offset-2"
              )}
              onClick={() => onCollageSettingsChange({
                background_color: palette.background,
                text_color: palette.text,
              })}
              aria-label={`使用${palette.label}配色`}
              title={palette.label}
              style={{ backgroundColor: palette.background }}
            >
              <span
                className="absolute bottom-0 right-0 size-3.5 border-l border-t"
                style={{ backgroundColor: palette.text }}
              />
            </button>
          )
        })}
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          底色
          <input
            type="color"
            value={collageSettings.background_color}
            onChange={(event) => onCollageSettingsChange({ background_color: event.target.value.toUpperCase() })}
            className="size-7 cursor-pointer rounded border bg-background p-0.5"
            aria-label="自定义拼图底色"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          文字
          <input
            type="color"
            value={collageSettings.text_color}
            onChange={(event) => onCollageSettingsChange({ text_color: event.target.value.toUpperCase() })}
            className="size-7 cursor-pointer rounded border bg-background p-0.5"
            aria-label="自定义拼图文字颜色"
          />
        </label>
      </div>
    </div>
  )

  const renderComposer = (isExpanded: boolean) => (
    <div className={cn("space-y-3", isExpanded && "border-t bg-card p-4 sm:p-5")}>
      <div className="grid grid-cols-2 rounded-md bg-muted p-1" role="tablist" aria-label="图片生成方式">
        <button
          type="button"
          role="tab"
          aria-selected={imageMode === "ai"}
          onClick={() => onImageModeChange("ai")}
          className={cn(
            "flex h-8 items-center justify-center gap-1.5 rounded text-xs font-medium transition-colors",
            imageMode === "ai" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          <ImagePlus className="size-3.5" />
          单图生成
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={imageMode === "collage"}
          onClick={() => onImageModeChange("collage")}
          className={cn(
            "flex h-8 items-center justify-center gap-1.5 rounded text-xs font-medium transition-colors",
            imageMode === "collage" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          <Images className="size-3.5" />
          拼图排版
        </button>
      </div>

      {imageMode === "collage" ? renderCollageControls(isExpanded) : (
        <Textarea
          value={imagePrompt}
          onChange={(event) => onImagePromptChange(event.target.value)}
          placeholder={generatedImages.length > 0 ? "继续说明下一版要修改的地方" : "描述要保留的内容和希望调整的方向"}
          rows={isExpanded ? 4 : 3}
          className={cn(isExpanded && "min-h-28 resize-y")}
        />
      )}
      <div className={cn("space-y-2", isExpanded && "sm:flex sm:items-center sm:justify-between sm:gap-3 sm:space-y-0")}>
        {imageMode === "ai" && latestAssistant ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground sm:w-auto"
            onClick={() => onImagePromptChange(`参考这篇笔记调整图片：\n${latestAssistant.slice(0, 1200)}`)}
          >
            <Sparkles />
            使用当前笔记填写要求
          </Button>
        ) : <span />}
        <div className="space-y-1 text-right">
          <Button
            type="button"
            className={cn("w-full", isExpanded && "sm:w-auto sm:min-w-40")}
            onClick={onGenerateImage}
            disabled={
              selectedReferences.length === 0
              || imageGenerationBusy
              || uploadingReferences
              || (imageMode === "ai" ? !imageReady || !imagePrompt.trim() : !collageReady)
            }
          >
            {imageGenerationBusy
              ? <LoaderCircle className="animate-spin" />
              : imageMode === "collage" ? <Images /> : <ImagePlus />}
            {generatingImage
              ? imageMode === "collage" ? "拼图中" : "生成中"
              : imageGenerationBusy
                ? "其他对话生成中"
                : imageMode === "collage"
                  ? generatedImages.length > 0 ? "生成下一版拼图" : "生成拼图"
                  : generatedImages.length > 0 ? "生成下一版" : "生成第一版"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {imageMode === "collage"
              ? `按顺序使用前 ${Math.min(selectedReferences.length, selectedTemplate.imageLimit)} 张参考图`
              : `使用 ${selectedReferences.length} 张参考图`}
          </p>
        </div>
      </div>
      {imageMode === "collage" && selectedReferences.length < selectedTemplate.minimumImages && (
        <p className="text-xs leading-5 text-destructive">
          当前版式还需选择 {selectedTemplate.minimumImages - selectedReferences.length} 张参考图
        </p>
      )}
      {imageMode === "ai" && !imageReady && (
        <p className="text-xs leading-5 text-muted-foreground">后台配置图片模型后可用</p>
      )}
    </div>
  )

  const activeThread = imageThreads.find((thread) => thread.id === activeThreadId)

  return (
    <>
      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ImagePlus className="size-4 text-primary" />
            图片对话
          </h2>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{imageThreads.length} 个对话</Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setExpanded(true)}
              aria-label="打开图片创作大工作区"
              title="放大图片工作区"
            >
              <Maximize2 />
            </Button>
          </div>
        </div>
        <div className="border-b">{renderThreadBar()}</div>
        <div className="space-y-4 p-4">
          {renderSources(false)}
          {imageMessages.length > 0 && renderHistory(false)}
          {renderComposer(false)}
        </div>
      </section>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[96dvh] w-[calc(100vw-1rem)] max-w-[1500px] flex-col gap-0 overflow-hidden p-0 sm:h-[92dvh] sm:max-w-[1500px]">
          <DialogTitle className="sr-only">图片创作大工作区</DialogTitle>
          <DialogDescription className="sr-only">选择多张参考图并进行多个独立图片对话</DialogDescription>
          <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4 pr-12 sm:px-5 sm:pr-14">
            <span className="grid size-8 place-items-center rounded-md bg-accent text-primary">
              <ImagePlus className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">{activeThread?.title || "图片创作工作区"}</h2>
              <p className="truncate text-xs text-muted-foreground">{generatedImages.length} 轮生成 · {selectedReferences.length} 张参考图</p>
            </div>
          </div>
          <div className="shrink-0 border-b">{renderThreadBar()}</div>
          <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-none lg:overflow-hidden">
            <aside className="border-b p-4 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r" aria-label="图片参考素材">
              {renderSources(true)}
            </aside>
            <div className="flex flex-col lg:min-h-0">
              <div className="lg:min-h-0 lg:flex-1">
                {renderHistory(true)}
              </div>
              {renderComposer(true)}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ImageLightbox image={previewImage} onOpenChange={(open) => !open && setPreviewImage(null)} />
    </>
  )
}
