"use client"

import { useState } from "react"
import Image from "next/image"
import {
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  RefreshCw,
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
import { Textarea } from "@/components/ui/textarea"
import type { AiImageMessage, Attachment } from "@/lib/api"
import { cn } from "@/lib/utils"

interface SelectedMaterialImage {
  attachment: Attachment
  materialTitle: string
}

interface AiImageWorkspaceProps {
  selectedMaterialImages: SelectedMaterialImage[]
  referenceAttachment: Attachment | null
  referencePreview: string
  loadingReferencePath: string
  imageMessages: AiImageMessage[]
  generatedImages: Attachment[]
  generatingImage: boolean
  imagePrompt: string
  imageReady: boolean
  hasReferenceImage: boolean
  latestAssistant: string
  onSelectReferenceAttachment: (attachment: Attachment) => Promise<void>
  onSelectReferenceImage: (file: File | null) => void
  onImagePromptChange: (value: string) => void
  onGenerateImage: () => void
}

export function AiImageWorkspace({
  selectedMaterialImages,
  referenceAttachment,
  referencePreview,
  loadingReferencePath,
  imageMessages,
  generatedImages,
  generatingImage,
  imagePrompt,
  imageReady,
  hasReferenceImage,
  latestAssistant,
  onSelectReferenceAttachment,
  onSelectReferenceImage,
  onImagePromptChange,
  onGenerateImage,
}: AiImageWorkspaceProps) {
  const [expanded, setExpanded] = useState(false)
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null)

  const openAttachment = (attachment: Attachment, alt: string) => {
    setPreviewImage({ src: attachment.path, alt, name: attachment.name })
  }

  const renderSources = (isExpanded: boolean) => (
    <div className={cn("space-y-3", isExpanded && "space-y-4")}>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">从已选素材选择</span>
          <span className="text-muted-foreground">{selectedMaterialImages.length} 张</span>
        </div>
        {selectedMaterialImages.length > 0 ? (
          <div className={cn(
            "grid max-h-52 grid-cols-4 gap-2 overflow-y-auto p-0.5",
            isExpanded && "max-h-[34vh] grid-cols-3"
          )}>
            {selectedMaterialImages.map(({ attachment, materialTitle }) => {
              const isActive = referenceAttachment?.path === attachment.path
              const isLoading = loadingReferencePath === attachment.path
              return (
                <button
                  key={attachment.path}
                  type="button"
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-md border bg-muted outline-none transition",
                    "hover:border-primary focus-visible:ring-2 focus-visible:ring-ring",
                    isActive && "border-primary ring-2 ring-primary/25"
                  )}
                  onClick={() => void onSelectReferenceAttachment(attachment)}
                  onDoubleClick={() => openAttachment(attachment, `${materialTitle} ${attachment.name}`)}
                  disabled={Boolean(loadingReferencePath)}
                  aria-label={`选择${materialTitle}中的${attachment.name}`}
                  title={`${materialTitle} · ${attachment.name} · 双击查看大图`}
                >
                  <Image src={attachment.path} alt="" fill sizes="160px" className="object-cover" unoptimized />
                  <span className="absolute bottom-1 left-1 grid size-5 place-items-center rounded bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Maximize2 className="size-3" />
                  </span>
                  {(isActive || isLoading) && (
                    <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-background/90 text-primary shadow-sm">
                      {isLoading ? <LoaderCircle className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
            已选素材中暂无图片
          </p>
        )}
      </div>

      <label className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground">
        <Upload className="size-4" />
        从电脑上传参考图
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => onSelectReferenceImage(event.target.files?.[0] ?? null)}
        />
      </label>

      {referencePreview && (
        <div
          className={cn(
            "group relative aspect-[4/3] overflow-hidden rounded-md border bg-muted",
            isExpanded && "max-h-[36vh]"
          )}
          onDoubleClick={() => setPreviewImage({
            src: referencePreview,
            alt: "当前参考图",
            name: referenceAttachment?.name || "当前参考图",
          })}
          title="双击查看大图"
        >
          <Image src={referencePreview} alt="当前参考图" fill sizes={isExpanded ? "300px" : "560px"} className="object-contain" unoptimized />
          <span className="absolute left-2 top-2 rounded bg-background/90 px-2 py-1 text-[11px] font-medium shadow-sm">当前参考图</span>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute bottom-2 right-2 size-8 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={() => setPreviewImage({
              src: referencePreview,
              alt: "当前参考图",
              name: referenceAttachment?.name || "当前参考图",
            })}
            aria-label="放大当前参考图"
            title="查看大图"
          >
            <Maximize2 />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-2 top-2 size-7"
            onClick={() => onSelectReferenceImage(null)}
            aria-label="移除参考图"
            title="移除参考图"
          >
            <X />
          </Button>
        </div>
      )}
    </div>
  )

  const renderHistory = (isExpanded: boolean) => (
    <div
      className={cn(
        "space-y-4",
        isExpanded
          ? "h-full min-h-[280px] overflow-y-auto bg-muted/20 p-4 sm:p-5"
          : "max-h-[560px] overflow-y-auto border-y py-3 pr-1"
      )}
      aria-label="图片生成对话记录"
    >
      {imageMessages.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center text-muted-foreground">
          <span className="mb-3 grid size-10 place-items-center rounded-full bg-accent text-primary">
            <ImagePlus className="size-5" />
          </span>
          <p className="text-sm font-medium text-foreground">等待第一轮图片创作</p>
          <p className="mt-1 max-w-sm text-xs leading-5">选择参考图并说明希望保留与调整的内容</p>
        </div>
      ) : imageMessages.map((message) => message.role === "user" ? (
        <div
          key={message.id}
          className={cn(
            "ml-auto space-y-2 rounded-md bg-primary px-3 py-2 text-sm leading-6 text-primary-foreground",
            isExpanded ? "max-w-[78%] sm:max-w-[68%]" : "ml-10"
          )}
        >
          {message.reference && (
            <button
              type="button"
              className={cn(
                "relative block aspect-[4/3] w-full overflow-hidden rounded border border-primary-foreground/25 bg-background/10",
                isExpanded && "ml-auto max-w-64"
              )}
              onClick={() => openAttachment(message.reference!, "本轮参考图")}
              aria-label="放大本轮参考图"
              title="查看大图"
            >
              <Image src={message.reference.path} alt="本轮参考图" fill sizes="360px" className="object-contain" unoptimized />
            </button>
          )}
          <p>{message.content}</p>
        </div>
      ) : (
        <div key={message.id} className={cn("space-y-2", isExpanded && "max-w-[86%]")}>
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
                variant={referenceAttachment?.path === message.image.path ? "secondary" : "outline"}
                size="sm"
                className={cn("w-full", isExpanded && "max-w-3xl")}
                onClick={() => void onSelectReferenceAttachment(message.image!)}
                disabled={Boolean(loadingReferencePath)}
              >
                {loadingReferencePath === message.image.path
                  ? <LoaderCircle className="animate-spin" />
                  : referenceAttachment?.path === message.image.path
                    ? <CheckCircle2 />
                    : <RefreshCw />}
                {referenceAttachment?.path === message.image.path ? "当前参考图" : "以此图继续修改"}
              </Button>
            </>
          )}
        </div>
      ))}
      {generatingImage && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          正在生成下一版图片
        </div>
      )}
    </div>
  )

  const renderComposer = (isExpanded: boolean) => (
    <div className={cn("space-y-3", isExpanded && "border-t bg-card p-4 sm:p-5")}>
      <Textarea
        value={imagePrompt}
        onChange={(event) => onImagePromptChange(event.target.value)}
        placeholder={generatedImages.length > 0 ? "继续说明下一版要修改的地方" : "描述要保留的内容和希望调整的方向"}
        rows={isExpanded ? 4 : 3}
        className={cn(isExpanded && "min-h-28 resize-y")}
      />
      <div className={cn("space-y-2", isExpanded && "sm:flex sm:items-center sm:justify-between sm:gap-3 sm:space-y-0")}>
        {latestAssistant ? (
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
        <Button
          type="button"
          className={cn("w-full", isExpanded && "sm:w-auto sm:min-w-40")}
          onClick={onGenerateImage}
          disabled={!imageReady || !hasReferenceImage || !imagePrompt.trim() || generatingImage}
        >
          {generatingImage ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
          {generatingImage ? "生成中" : generatedImages.length > 0 ? "生成下一版" : "生成第一版"}
        </Button>
      </div>
      {!imageReady && <p className="text-xs leading-5 text-muted-foreground">后台配置图片模型后可用</p>}
    </div>
  )

  return (
    <>
      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ImagePlus className="size-4 text-primary" />
            图片对话
          </h2>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{generatedImages.length} 轮</Badge>
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
        <div className="space-y-4 p-4">
          {renderSources(false)}
          {imageMessages.length > 0 && renderHistory(false)}
          {renderComposer(false)}
        </div>
      </section>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[96dvh] w-[calc(100vw-1rem)] max-w-[1500px] flex-col gap-0 overflow-hidden p-0 sm:h-[92dvh] sm:max-w-[1500px]">
          <DialogTitle className="sr-only">图片创作大工作区</DialogTitle>
          <DialogDescription className="sr-only">选择参考图并进行多轮图片生成对话</DialogDescription>
          <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4 pr-12 sm:px-5 sm:pr-14">
            <span className="grid size-8 place-items-center rounded-md bg-accent text-primary">
              <ImagePlus className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">图片创作工作区</h2>
              <p className="truncate text-xs text-muted-foreground">{generatedImages.length} 轮生成 · {selectedMaterialImages.length} 张素材图</p>
            </div>
          </div>
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(220px,0.8fr)_minmax(360px,1.2fr)] lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-none">
            <aside className="min-h-0 overflow-y-auto border-b p-4 lg:border-b-0 lg:border-r" aria-label="图片参考素材">
              {renderSources(true)}
            </aside>
            <div className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1">
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
