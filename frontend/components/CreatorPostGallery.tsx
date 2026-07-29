"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import {
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  ImageOff,
  Images,
  LoaderCircle,
  Maximize2,
  Search,
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
import type { CreatorAccountSampleNote } from "@/lib/api"
import { isImageAttachment } from "@/lib/materials"
import { cn } from "@/lib/utils"

interface CreatorPostGalleryProps {
  accountName: string
  notes: CreatorAccountSampleNote[]
  selectedNotes: CreatorAccountSampleNote[]
  loading: boolean
  search: string
  maxSelected: number
  onSearchChange: (value: string) => void
  onToggle: (note: CreatorAccountSampleNote) => void
  onBack: () => void
}

type GalleryMode = "all" | "selected"
type GallerySort = "published_at" | "engagement"

function postImageCount(note: CreatorAccountSampleNote) {
  return (note.attachments ?? []).filter(isImageAttachment).length || note.image_count || 0
}

function postCover(note: CreatorAccountSampleNote) {
  return (note.attachments ?? []).find(isImageAttachment)?.path || note.cover_url
}

function publishedTimestamp(value: string | null) {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function CreatorPostGallery({
  accountName,
  notes,
  selectedNotes,
  loading,
  search,
  maxSelected,
  onSearchChange,
  onToggle,
  onBack,
}: CreatorPostGalleryProps) {
  const [mode, setMode] = useState<GalleryMode>("all")
  const [sort, setSort] = useState<GallerySort>("published_at")
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null)

  useEffect(() => {
    const resetScroll = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    resetScroll()
    const frame = window.requestAnimationFrame(resetScroll)
    const timeout = window.setTimeout(resetScroll, 100)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
    }
  }, [])

  const selectedIds = useMemo(
    () => new Set(selectedNotes.map((note) => note.id)),
    [selectedNotes]
  )
  const visibleNotes = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase()
    const source = mode === "selected"
      ? selectedNotes.filter((note) => (
          !keyword
          || note.title.toLocaleLowerCase().includes(keyword)
          || note.content.toLocaleLowerCase().includes(keyword)
        ))
      : notes
    return source.slice().sort((left, right) => {
      if (sort === "engagement") {
        return (right.engagement_score || 0) - (left.engagement_score || 0)
      }
      return publishedTimestamp(right.published_at) - publishedTimestamp(left.published_at)
    })
  }, [mode, notes, search, selectedNotes, sort])

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-background pb-24 lg:min-h-[calc(100dvh-4rem)]">
      <div className="border-b bg-card">
        <div className="app-container py-4 sm:py-5">
          <div className="flex items-start gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-0.5 size-9 shrink-0"
              onClick={onBack}
              aria-label="返回 AI 创作"
              title="返回 AI 创作"
            >
              <ArrowLeft />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold sm:text-2xl">{accountName} · 历史帖子</h1>
                <Badge variant="secondary">已选 {selectedNotes.length}/{maxSelected}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">共 {notes.length} 篇可用帖子</p>
            </div>
            <Button type="button" onClick={onBack} className="hidden sm:inline-flex">
              <CheckCircle2 />
              完成选择
            </Button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="搜索标题或正文"
                className="bg-background pl-9 shadow-none"
              />
            </div>
            <div className="grid grid-cols-2 rounded-md bg-muted p-1" role="tablist" aria-label="帖子范围">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "all"}
                onClick={() => setMode("all")}
                className={cn(
                  "h-8 rounded-sm px-3 text-xs font-medium text-muted-foreground",
                  mode === "all" && "bg-background text-foreground shadow-sm"
                )}
              >
                全部帖子
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "selected"}
                onClick={() => setMode("selected")}
                className={cn(
                  "h-8 rounded-sm px-3 text-xs font-medium text-muted-foreground",
                  mode === "selected" && "bg-background text-foreground shadow-sm"
                )}
              >
                仅看已选
              </button>
            </div>
            <Select value={sort} onValueChange={(value) => setSort(value as GallerySort)}>
              <SelectTrigger className="bg-background shadow-none sm:w-36" aria-label="旧帖排序">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="published_at">最新发布</SelectItem>
                <SelectItem value="engagement">互动最高</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="app-container py-5 sm:py-6">
        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            正在加载历史帖子
          </div>
        ) : visibleNotes.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {visibleNotes.map((note) => {
              const selected = selectedIds.has(note.id)
              const cover = postCover(note)
              const imageCount = postImageCount(note)
              const title = note.title || "无标题笔记"
              return (
                <article
                  key={note.id}
                  className={cn(
                    "overflow-hidden rounded-md border bg-card transition-colors",
                    selected && "border-primary ring-2 ring-primary/15"
                  )}
                >
                  <div className="group relative aspect-[3/4] overflow-hidden bg-muted">
                    {cover ? (
                      <button
                        type="button"
                        className="absolute inset-0 block size-full"
                        onClick={() => setPreviewImage({ src: cover, alt: title, name: title })}
                        aria-label={`放大查看 ${title}`}
                        title="查看大图"
                      >
                        <Image
                          src={cover}
                          alt={title}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                          className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                          unoptimized
                        />
                        <span className="absolute bottom-2 left-2 grid size-7 place-items-center rounded bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <Maximize2 className="size-3.5" />
                        </span>
                      </button>
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <ImageOff className="size-7" />
                        <span className="text-xs">暂无封面</span>
                      </div>
                    )}
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => onToggle(note)}
                      className="absolute right-2 top-2 z-10 size-6 border-background/80 bg-background/90 shadow-sm"
                      aria-label={`${selected ? "取消选择" : "选择"} ${title}`}
                    />
                    <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/65 px-1.5 py-1 text-[10px] text-white">
                      {note.has_video ? <Clapperboard className="size-3" /> : <Images className="size-3" />}
                      {imageCount > 0 ? `${imageCount} 张` : note.has_video ? "视频" : "无图片"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="block min-h-[76px] w-full px-3 py-2.5 text-left"
                    onClick={() => onToggle(note)}
                    aria-pressed={selected}
                  >
                    <h2 className="line-clamp-2 text-sm font-medium leading-5">{title}</h2>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      赞 {note.liked_count} · 藏 {note.collected_count}
                    </p>
                  </button>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center text-center text-muted-foreground">
            <Images className="size-8" />
            <p className="mt-3 text-sm font-medium text-foreground">
              {mode === "selected" ? "还没有选择历史帖子" : "没有匹配的历史帖子"}
            </p>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-4 py-3 backdrop-blur sm:hidden">
        <Button type="button" className="w-full" onClick={onBack}>
          <CheckCircle2 />
          完成选择 · {selectedNotes.length} 篇
        </Button>
      </div>

      <ImageLightbox image={previewImage} onOpenChange={(open) => !open && setPreviewImage(null)} />
    </main>
  )
}
