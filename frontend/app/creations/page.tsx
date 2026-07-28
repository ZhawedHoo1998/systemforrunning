"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  AlertCircle,
  FileText,
  LoaderCircle,
  Maximize2,
  MessageSquareMore,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react"
import { Header } from "@/components/Header"
import { ImageLightbox, type PreviewImage } from "@/components/ImageLightbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { deleteCreation, getCreations, type Creation } from "@/lib/api"
import { isImageAttachment } from "@/lib/materials"
import { cn } from "@/lib/utils"

const TASK_LABELS = {
  concept: "创作方案",
  title: "标题创作",
  note: "小红书正文",
  video: "视频脚本",
  rewrite: "内容改写",
}

function formatCreationDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default function CreationsPage() {
  const [creations, setCreations] = useState<Creation[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deletingId, setDeletingId] = useState("")
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    let active = true
    getCreations({ q: deferredQuery.trim() || undefined, page_size: 100 })
      .then((result) => {
        if (!active) return
        setCreations(result.items)
        setError("")
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "我的创作加载失败")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [deferredQuery])

  const totalImages = useMemo(
    () => creations.reduce(
      (total, creation) => total + creation.attachments.filter(isImageAttachment).length,
      0
    ),
    [creations]
  )

  const handleDelete = async (creation: Creation) => {
    if (!window.confirm(`确定删除“${creation.title}”吗？此操作无法撤销。`)) return
    setDeletingId(creation.id)
    setError("")
    try {
      await deleteCreation(creation.id)
      setCreations((current) => current.filter((item) => item.id !== creation.id))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除创作失败")
    } finally {
      setDeletingId("")
    }
  }

  return (
    <div className="min-h-screen">
      <Header showActions={false} />
      <main className="app-container py-6 lg:py-8">
        <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" />
              写手个人工作区
            </div>
            <h1 className="text-2xl font-semibold">我的创作</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {creations.length} 篇创作 · {totalImages} 张配图
            </p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => {
                setLoading(true)
                setQuery(event.target.value)
              }}
              placeholder="搜索创作标题或正文"
              aria-label="搜索我的创作"
              className="bg-card pl-9"
            />
          </div>
        </div>

        {error && (
          <div className="mt-5 flex items-start gap-2 border-y border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            正在加载我的创作
          </div>
        ) : creations.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center border-b px-6 text-center">
            <span className="mb-4 grid size-12 place-items-center rounded-full bg-accent text-primary">
              <FileText className="size-5" />
            </span>
            <h2 className="text-base font-semibold">{query ? "没有匹配的创作" : "还没有保存的创作"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {query ? "换一个关键词继续查找" : "在 AI 创作中完成对话后保存到这里"}
            </p>
            {!query && (
              <Button asChild className="mt-5">
                <Link href="/ai">
                  <Sparkles />
                  开始 AI 创作
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 pt-5 md:grid-cols-2 xl:grid-cols-3">
            {creations.map((creation) => {
              const finalDraft = creation.ai_conversation.draft
              const selectedAssetPaths = new Set(finalDraft?.selected_asset_paths || [])
              const allImages = creation.attachments.filter(isImageAttachment)
              const selectedImages = allImages.filter((image) => selectedAssetPaths.has(image.path))
              const images = selectedImages.length > 0 ? selectedImages : allImages
              const previewImages = images.slice(0, 3)
              const taskLabel = TASK_LABELS[creation.ai_conversation.task]
              const displayTitle = finalDraft?.title || creation.title
              const displayContent = finalDraft?.content || creation.summary || creation.original_content || "暂无文字内容"
              const imageRecordCount = creation.ai_conversation.image_threads
                ? creation.ai_conversation.image_threads.reduce((total, thread) => total + thread.messages.length, 0)
                : creation.ai_conversation.image_messages?.length || 0
              return (
                <article key={creation.id} className="flex min-h-[320px] flex-col overflow-hidden rounded-lg border bg-card">
                  {previewImages.length > 0 && (
                    <div className={cn(
                      "grid aspect-[16/8] shrink-0 gap-px overflow-hidden border-b bg-border",
                      previewImages.length === 1 ? "grid-cols-1" : "grid-cols-3"
                    )}>
                      {previewImages.map((image, index) => (
                        <button
                          type="button"
                          key={`${image.path}-${index}`}
                          className="group relative min-w-0 overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          onClick={() => setPreviewImage({
                            src: image.path,
                            alt: image.name || `${displayTitle} 配图 ${index + 1}`,
                            name: image.name,
                          })}
                          aria-label={`放大${image.name || `配图 ${index + 1}`}`}
                          title="查看大图"
                        >
                          <Image src={image.path} alt="" fill sizes="420px" className="object-cover" unoptimized />
                          <span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                            <Maximize2 className="size-3.5" />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary">{taskLabel}</Badge>
                        {finalDraft?.content && <Badge variant="outline">已成稿</Badge>}
                        {creation.ai_conversation.brand && creation.ai_conversation.car_model && (
                          <Badge variant="outline">
                            {creation.ai_conversation.brand} · {creation.ai_conversation.car_model}
                          </Badge>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="-mr-2 -mt-2 size-8 shrink-0 text-muted-foreground hover:bg-red-50 hover:text-destructive"
                        onClick={() => void handleDelete(creation)}
                        disabled={deletingId === creation.id}
                        aria-label={`删除${creation.title}`}
                        title="删除创作"
                      >
                        {deletingId === creation.id ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                      </Button>
                    </div>
                    <h2 className="line-clamp-2 text-base font-semibold leading-6">{displayTitle}</h2>
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {displayContent}
                    </p>
                    <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                      <span>{creation.ai_conversation.messages.length} 条文案对话 · {imageRecordCount} 条图片记录</span>
                      <time dateTime={creation.updated_at}>{formatCreationDate(creation.updated_at)}</time>
                    </div>
                    <Button asChild className="mt-3 w-full">
                      <Link href={`/ai?resume=${creation.id}`}>
                        <MessageSquareMore />
                        继续创作
                      </Link>
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>

      <ImageLightbox image={previewImage} onOpenChange={(open) => !open && setPreviewImage(null)} />
    </div>
  )
}
