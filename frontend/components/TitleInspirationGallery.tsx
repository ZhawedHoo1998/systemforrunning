"use client"

import { useState } from "react"
import Image from "next/image"
import { Check, Copy, FilePlus2, Heart, ImageIcon, SearchX } from "lucide-react"
import type { Material } from "@/lib/api"
import {
  formatMaterialDate,
  getPreviewImage,
  SOURCE_TYPE_LABELS,
  TITLE_INSPIRATION_TYPES,
} from "@/lib/materials"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface TitleInspirationGalleryProps {
  materials: Material[]
  loading: boolean
  onToggleFavorite: (id: string) => void
  onSelect: (material: Material) => void
  onAdd: () => void
  emptyTitle?: string
  emptyDescription?: string
}

function getDisplayTitle(material: Material) {
  return material.suggest_title?.trim() || material.title.trim()
}

function getTitleType(material: Material) {
  const title = getDisplayTitle(material)
  const classificationText = [
    ...material.tags,
    material.learning_points,
    material.save_reason,
  ].filter(Boolean).join(" ")
  const explicitType = TITLE_INSPIRATION_TYPES.find((type) => classificationText.includes(type))
  if (explicitType) return explicitType

  if (/(痛点|避雷|踩坑|劝退|别再|千万别|后悔)/.test(title)) return "痛点型"
  if (/(为什么|怎么|如何|吗[？?]?|[？?])/.test(title)) return "提问型"
  if (/(竟然|没想到|反而|居然|以为.+却|原来不是)/.test(title)) return "反差型"
  if (/([0-9０-９一二三四五六七八九十]+个|[0-9０-９]+条|Top\s*[0-9０-９]+)/i.test(title)) return "数字型"
  if (/(教程|攻略|指南|方法|清单|步骤|干货)/.test(title)) return "干货型"
  if (/(救命|真香|破防|治愈|狠狠爱|太爱|好喜欢|幸福感)/.test(title)) return "情绪型"
  if (/(通勤|约会|旅行|露营|车里|车内|下班|周末|雨天|夏天|冬天)/.test(title)) return "场景型"
  return "钩子型"
}

export function TitleInspirationGallery({
  materials,
  loading,
  onToggleFavorite,
  onSelect,
  onAdd,
  emptyTitle = "暂无标题灵感",
  emptyDescription = "可以添加标题和对应主图",
}: TitleInspirationGalleryProps) {
  const [copiedMaterialId, setCopiedMaterialId] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="space-y-7">
        {Array.from({ length: 2 }).map((_, sectionIndex) => (
          <section key={sectionIndex}>
            <div className="mb-3 h-6 w-24 animate-pulse rounded bg-muted" />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {Array.from({ length: 2 }).map((__, cardIndex) => (
                <div key={cardIndex} className="h-[240px] animate-pulse rounded-lg border bg-card" />
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  }

  if (materials.length === 0) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center border-y border-dashed px-6 text-center">
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <SearchX className="size-5" />
        </span>
        <h2 className="text-base font-semibold">{emptyTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
        <Button className="mt-5" onClick={onAdd}>
          <FilePlus2 />
          添加标题灵感
        </Button>
      </div>
    )
  }

  const groups = TITLE_INSPIRATION_TYPES.map((type) => ({
    type,
    materials: materials.filter((material) => getTitleType(material) === type),
  })).filter((group) => group.materials.length > 0)

  const handleCopy = async (material: Material) => {
    try {
      await navigator.clipboard.writeText(getDisplayTitle(material))
      setCopiedMaterialId(material.id)
      window.setTimeout(() => setCopiedMaterialId(null), 1600)
    } catch (error) {
      console.error("Failed to copy title inspiration", error)
    }
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.type} aria-labelledby={`title-group-${group.type}`}>
          <div className="mb-3 flex items-center gap-3 border-b pb-2">
            <h2 id={`title-group-${group.type}`} className="text-base font-semibold">{group.type}</h2>
            <span className="text-xs text-muted-foreground">{group.materials.length} 条</span>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {group.materials.map((material) => {
              const displayTitle = getDisplayTitle(material)
              const previewImage = getPreviewImage(material)
              return (
                <Card
                  key={material.id}
                  className="group grid min-h-[224px] cursor-pointer grid-cols-[minmax(120px,38%)_minmax(0,1fr)] overflow-hidden border bg-card p-0 shadow-none transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-input hover:shadow-[0_10px_30px_rgba(32,35,32,0.08)] sm:grid-cols-[180px_minmax(0,1fr)]"
                  onClick={() => onSelect(material)}
                >
                  <div className="relative min-h-[224px] overflow-hidden border-r bg-muted">
                    {previewImage ? (
                      <Image
                        src={previewImage.path}
                        alt={previewImage.name || `${displayTitle} 主图`}
                        fill
                        sizes="(max-width: 640px) 38vw, 180px"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        unoptimized
                      />
                    ) : (
                      <div className="flex size-full min-h-[224px] flex-col items-center justify-center gap-2 text-muted-foreground">
                        <ImageIcon className="size-6" />
                        <span className="text-xs">暂无主图</span>
                      </div>
                    )}
                    <Badge className="absolute left-2 top-2 bg-black/70 text-white shadow-none hover:bg-black/70">
                      主图
                    </Badge>
                  </div>

                  <CardContent className="flex min-w-0 flex-col p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="secondary" className="font-normal">{group.type}</Badge>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground shadow-none"
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleCopy(material)
                          }}
                          aria-label="复制标题"
                          title="复制标题"
                        >
                          {copiedMaterialId === material.id ? <Check className="text-insight-foreground" /> : <Copy />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground shadow-none hover:text-primary"
                          onClick={(event) => {
                            event.stopPropagation()
                            onToggleFavorite(material.id)
                          }}
                          aria-label={material.is_favorite ? "取消收藏" : "收藏标题"}
                          title={material.is_favorite ? "取消收藏" : "收藏标题"}
                        >
                          <Heart className={cn(material.is_favorite && "fill-primary text-primary")} />
                        </Button>
                      </div>
                    </div>

                    <h3 className="mt-3 line-clamp-3 text-lg font-semibold leading-7" title={displayTitle}>
                      {displayTitle}
                    </h3>
                    {material.suggest_title && material.title !== displayTitle && (
                      <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">素材：{material.title}</p>
                    )}
                    {material.summary && (
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{material.summary}</p>
                    )}

                    <div className="mt-auto flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">
                        {SOURCE_TYPE_LABELS[material.source_type] || material.source_type}
                      </span>
                      <time className="shrink-0" dateTime={material.created_at}>
                        {formatMaterialDate(material.created_at)}
                      </time>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
