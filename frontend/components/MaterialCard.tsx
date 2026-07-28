"use client"

import Image from "next/image"
import { CirclePlay, Heart, Lightbulb, Paperclip, Video } from "lucide-react"
import type { Material } from "@/lib/api"
import { formatMaterialDate, isImageAttachment, isVideoAttachment, MATERIAL_SCOPE_LABELS, SOURCE_TYPE_LABELS } from "@/lib/materials"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface MaterialCardProps {
  material: Material
  onToggleFavorite: (id: string) => void
  onClick: (material: Material) => void
}

export function MaterialCard({ material, onToggleFavorite, onClick }: MaterialCardProps) {
  const imageAttachments = material.attachments.filter(isImageAttachment)
  const videoAttachments = material.attachments.filter(isVideoAttachment)
  const previewImages = imageAttachments.slice(0, 4)
  const insight = material.learning_points || material.save_reason

  return (
    <Card
      className="group flex min-h-[280px] cursor-pointer flex-col overflow-hidden border bg-card shadow-none transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-input hover:shadow-[0_10px_30px_rgba(32,35,32,0.08)]"
      onClick={() => onClick(material)}
    >
      {previewImages.length > 0 && (
        <div
          className={cn(
            "grid aspect-[16/9] shrink-0 gap-px overflow-hidden border-b bg-border",
            previewImages.length === 1 && "grid-cols-1",
            previewImages.length === 2 && "grid-cols-2",
            previewImages.length >= 3 && "grid-cols-2 grid-rows-2"
          )}
        >
          {previewImages.map((image, index) => (
            <div
              key={`${image.path}-${index}`}
              className={cn(
                "relative min-h-0 min-w-0 overflow-hidden bg-muted",
                previewImages.length === 3 && index === 0 && "row-span-2"
              )}
            >
              <Image
                src={image.path}
                alt={image.name || `${material.title} 图片 ${index + 1}`}
                fill
                sizes={previewImages.length === 1
                  ? "(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  : "(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 17vw"}
                className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                unoptimized
              />
              {index === 3 && imageAttachments.length > 4 && (
                <span className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-semibold text-white">
                  +{imageAttachments.length - 4}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {previewImages.length === 0 && videoAttachments.length > 0 && (
        <div className="relative aspect-video shrink-0 overflow-hidden border-b bg-black">
          <video
            src={videoAttachments[0].path}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover opacity-90"
            aria-hidden="true"
          />
          <span className="absolute inset-0 grid place-items-center bg-black/15 text-white">
            <CirclePlay className="size-10 drop-shadow-md" />
          </span>
          {videoAttachments.length > 1 && (
            <span className="absolute bottom-2 right-2 rounded-sm bg-black/65 px-2 py-1 text-xs font-medium text-white">
              {videoAttachments.length} 个视频
            </span>
          )}
        </div>
      )}

      <CardContent className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-source-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-source-foreground" />
            <span className="truncate">{SOURCE_TYPE_LABELS[material.source_type] || material.source_type}</span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 size-8 shrink-0 text-muted-foreground shadow-none hover:text-primary"
            onClick={(event) => {
              event.stopPropagation()
              onToggleFavorite(material.id)
            }}
            aria-label={material.is_favorite ? "取消收藏" : "收藏素材"}
            title={material.is_favorite ? "取消收藏" : "收藏素材"}
          >
            <Heart className={cn(material.is_favorite && "fill-primary text-primary")} />
          </Button>
        </div>

        <h3 className="line-clamp-2 text-[15px] font-semibold leading-6" title={material.title}>
          {material.title}
        </h3>

        {material.summary ? (
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
            {material.summary}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground/70">暂无内容概述</p>
        )}

        {insight && (
          <div className="mt-3 flex gap-2 border-l-2 border-[#7aa889] bg-insight px-3 py-2 text-xs leading-5 text-insight-foreground">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2">{insight}</span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {material.content_types.slice(0, 2).map((type) => (
            <Badge key={type} variant="secondary" className="font-normal">
              {type}
            </Badge>
          ))}
          {material.content_types.length > 2 && (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              +{material.content_types.length - 2}
            </Badge>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {material.material_scope === "general"
              ? MATERIAL_SCOPE_LABELS.general
              : [material.brand, material.car_model].filter(Boolean).join(" · ")}
          </span>
          {material.attachments.length > 0 && (
            <span className="flex shrink-0 items-center gap-1" title={`${material.attachments.length} 个附件`}>
              {videoAttachments.length > 0 ? <Video className="size-3.5" /> : <Paperclip className="size-3.5" />}
              {videoAttachments.length > 0 ? videoAttachments.length : material.attachments.length}
            </span>
          )}
          <time className="shrink-0" dateTime={material.created_at}>
            {formatMaterialDate(material.created_at)}
          </time>
        </div>
      </CardContent>
    </Card>
  )
}
