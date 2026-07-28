"use client"

import { useState } from "react"
import Image from "next/image"
import {
  Check,
  Copy,
  Edit3,
  ExternalLink,
  FileText,
  Heart,
  MessageCircle,
  Maximize2,
  Trash2,
  ThumbsUp,
  Video,
  X,
} from "lucide-react"
import type { Material } from "@/lib/api"
import { isImageAttachment, isVideoAttachment, MATERIAL_SCOPE_LABELS, SOURCE_TYPE_LABELS } from "@/lib/materials"
import { ImageLightbox, type PreviewImage } from "@/components/ImageLightbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

interface MaterialDrawerProps {
  material: Material | null
  onClose: () => void
  onToggleFavorite: (id: string) => void
  onEdit: (material: Material) => void
  onDelete: (id: string) => Promise<void>
}

interface ContentSectionProps {
  id: string
  title: string
  content: string
  copiedSection: string | null
  onCopy: (id: string, content: string) => void
  accent?: boolean
}

function ContentSection({ id, title, content, copiedSection, onCopy, accent }: ContentSectionProps) {
  const copied = copiedSection === id

  return (
    <section className={cn("py-5", accent && "border-l-2 border-[#7aa889] bg-insight px-4") }>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground shadow-none"
          onClick={() => onCopy(id, content)}
          aria-label={`复制${title}`}
          title={`复制${title}`}
        >
          {copied ? <Check className="text-insight-foreground" /> : <Copy />}
        </Button>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/80">{content}</p>
    </section>
  )
}

export function MaterialDrawer({
  material,
  onClose,
  onToggleFavorite,
  onEdit,
  onDelete,
}: MaterialDrawerProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [copiedSection, setCopiedSection] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null)

  if (!material) return null

  const handleCopy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedSection(id)
      window.setTimeout(() => setCopiedSection(null), 1600)
    } catch (error) {
      console.error("Failed to copy material content", error)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm("确定要删除这个素材吗？此操作无法撤销。")) return
    setIsDeleting(true)
    try {
      await onDelete(material.id)
    } finally {
      setIsDeleting(false)
    }
  }

  const imageAttachments = material.attachments.filter(isImageAttachment)
  const videoAttachments = material.attachments.filter(isVideoAttachment)
  const otherAttachments = material.attachments.filter(
    (attachment) => !isImageAttachment(attachment) && !isVideoAttachment(attachment)
  )
  const sourceMetadata = material.source_metadata?.platform === "xiaohongshu"
    ? material.source_metadata
    : null
  const metrics = sourceMetadata?.metrics
  const topComments = sourceMetadata?.top_comments ?? []
  const formatMetric = (value?: number) => (value ?? 0).toLocaleString("zh-CN")

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px]" onClick={onClose} />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-card shadow-2xl"
        aria-label="素材详情"
      >
        <header className="flex min-h-16 items-center gap-3 border-b px-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-primary">素材详情</p>
            <h2 className="truncate text-sm font-semibold sm:text-base">{material.title}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭详情" title="关闭详情">
            <X />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6">
          <section className="py-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge className="bg-source font-medium text-source-foreground shadow-none hover:bg-source">
                    {SOURCE_TYPE_LABELS[material.source_type] || material.source_type}
                  </Badge>
                  <Badge variant="secondary">{MATERIAL_SCOPE_LABELS[material.material_scope]}</Badge>
                  {material.brand && <Badge variant="outline">{material.brand}</Badge>}
                  {material.car_model && <Badge variant="outline">{material.car_model}</Badge>}
                </div>
                <h1 className="text-xl font-semibold leading-8">{material.title}</h1>
                {material.author && <p className="mt-2 text-sm text-muted-foreground">来自 @{material.author}</p>}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => handleCopy("title", material.title)}
                aria-label="复制标题"
                title="复制标题"
              >
                {copiedSection === "title" ? <Check className="text-insight-foreground" /> : <Copy />}
              </Button>
            </div>

            {material.source_url && (
              <a
                href={material.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <span className="truncate">打开原始来源</span>
                <ExternalLink className="size-3.5 shrink-0" />
              </a>
            )}
          </section>

          {sourceMetadata && (
            <section className="border-t py-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">小红书互动数据</h3>
                <span className="text-xs text-muted-foreground">已自动导入</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  ["获赞", formatMetric(metrics?.likes)],
                  ["收藏", formatMetric(metrics?.collections)],
                  ["评论", formatMetric(metrics?.comments)],
                  ["分享", formatMetric(metrics?.shares)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border bg-muted/25 px-2 py-2 text-center">
                    <p className="text-sm font-semibold">{value}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              {topComments.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <MessageCircle className="size-4 text-primary" />
                    热门评论 Top {topComments.length}
                  </div>
                  <div className="space-y-2">
                    {topComments.map((comment, index) => (
                      <div key={comment.id} className="flex gap-2 rounded-md border bg-background px-3 py-2 text-xs leading-5">
                        <span className="w-4 shrink-0 text-muted-foreground">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p><span className="font-medium">{comment.author}</span><span className="ml-2 text-muted-foreground">{comment.content}</span></p>
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <ThumbsUp className="size-3" /> {formatMetric(comment.likes)} 赞
                            {comment.reply_count > 0 && <span className="ml-2">{comment.reply_count} 条回复</span>}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {imageAttachments.length > 0 && (
            <section className="border-t py-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">图片预览</h3>
                <span className="text-xs text-muted-foreground">{imageAttachments.length} 张</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {imageAttachments.map((attachment, index) => (
                  <button
                    type="button"
                    key={`${attachment.path}-${index}`}
                    className={cn(
                      "group relative aspect-[4/3] overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      imageAttachments.length === 1 && "col-span-2 aspect-video"
                    )}
                    onClick={() => setPreviewImage({
                      src: attachment.path,
                      alt: attachment.name || `${material.title} 图片 ${index + 1}`,
                      name: attachment.name,
                    })}
                    onDoubleClick={() => setPreviewImage({
                      src: attachment.path,
                      alt: attachment.name || `${material.title} 图片 ${index + 1}`,
                      name: attachment.name,
                    })}
                    aria-label={`放大${attachment.name || `图片 ${index + 1}`}`}
                    title="查看大图"
                  >
                    <Image
                      src={attachment.path}
                      alt={attachment.name || `${material.title} 图片 ${index + 1}`}
                      fill
                      sizes={imageAttachments.length === 1 ? "(max-width: 640px) 100vw, 640px" : "(max-width: 640px) 50vw, 320px"}
                      className="object-cover"
                      unoptimized
                    />
                    <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <Maximize2 className="size-4" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {videoAttachments.length > 0 && (
            <section className="border-t py-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Video className="size-4 text-primary" />
                  视频预览
                </h3>
                <span className="text-xs text-muted-foreground">{videoAttachments.length} 个</span>
              </div>
              <div className="space-y-4">
                {videoAttachments.map((attachment, index) => (
                  <div key={`${attachment.path}-${index}`}>
                    <video
                      src={attachment.path}
                      controls
                      playsInline
                      preload="metadata"
                      className="aspect-video w-full rounded-md bg-black"
                    >
                      当前浏览器不支持视频播放。
                    </video>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {attachment.name}
                      </span>
                      <a
                        href={attachment.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                      >
                        打开原视频
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(material.content_types.length > 0 || material.tags.length > 0) && (
            <section className="flex flex-wrap gap-2 border-t py-5">
              {material.content_types.map((type) => (
                <Badge key={type} variant="secondary" className="font-normal">{type}</Badge>
              ))}
              {material.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="font-normal text-muted-foreground">#{tag}</Badge>
              ))}
            </section>
          )}

          {material.suggest_title && (
            <>
              <Separator />
              <ContentSection
                id="suggest-title"
                title="建议标题"
                content={material.suggest_title}
                copiedSection={copiedSection}
                onCopy={handleCopy}
              />
            </>
          )}

          {material.summary && (
            <>
              <Separator />
              <ContentSection
                id="summary"
                title="内容概述"
                content={material.summary}
                copiedSection={copiedSection}
                onCopy={handleCopy}
              />
            </>
          )}

          {material.original_content && (
            <>
              <Separator />
              <ContentSection
                id="original"
                title="原始内容"
                content={material.original_content}
                copiedSection={copiedSection}
                onCopy={handleCopy}
              />
            </>
          )}

          {material.learning_points && (
            <>
              <Separator />
              <ContentSection
                id="learning"
                title="值得学习"
                content={material.learning_points}
                copiedSection={copiedSection}
                onCopy={handleCopy}
                accent
              />
            </>
          )}

          {material.save_reason && (
            <>
              <Separator />
              <ContentSection
                id="reason"
                title="保存理由"
                content={material.save_reason}
                copiedSection={copiedSection}
                onCopy={handleCopy}
              />
            </>
          )}

          {otherAttachments.length > 0 && (
            <section className="border-t py-5">
              <h3 className="mb-3 text-sm font-semibold">其他附件</h3>
              <div className="space-y-2">
                {otherAttachments.map((attachment, index) => (
                    <a
                      key={`${attachment.path}-${index}`}
                      href={attachment.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <FileText className="size-4 shrink-0" />
                      <span className="truncate">{attachment.name}</span>
                    </a>
                  ))}
              </div>
            </section>
          )}

          <p className="border-t py-5 text-center text-xs text-muted-foreground">
            创建于 {new Date(material.created_at).toLocaleString("zh-CN")}
          </p>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t bg-card px-4 py-3 sm:px-6">
          <Button
            variant={material.is_favorite ? "secondary" : "outline"}
            className={cn("flex-1", material.is_favorite && "text-primary")}
            onClick={() => onToggleFavorite(material.id)}
          >
            <Heart className={cn(material.is_favorite && "fill-primary text-primary")} />
            {material.is_favorite ? "已收藏" : "收藏"}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => onEdit(material)}>
            <Edit3 />
            编辑
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-red-50 hover:text-destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            aria-label="删除素材"
            title="删除素材"
          >
            <Trash2 />
          </Button>
        </footer>
      </aside>
      <ImageLightbox image={previewImage} onOpenChange={(open) => !open && setPreviewImage(null)} />
    </>
  )
}
