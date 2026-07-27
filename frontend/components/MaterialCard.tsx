"use client"

import { Heart } from "lucide-react"
import { Material } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const SOURCE_TYPE_LABELS: Record<string, string> = {
  self_experience: "自家经验",
  product资料: "产品资料",
  customer_feedback: "客户反馈",
  xiaohongshu: "小红书博主",
  douyin: "抖音博主",
  bilibili: "B站内容",
  competitor: "竞品账号",
  car_group: "车友群",
  sales_feedback: "销售反馈",
  wechat_article: "公众号文章",
  other: "其他",
}

interface MaterialCardProps {
  material: Material
  onToggleFavorite: (id: string) => void
  onClick: (material: Material) => void
}

export function MaterialCard({ material, onToggleFavorite, onClick }: MaterialCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
      onClick={() => onClick(material)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium line-clamp-2 text-sm leading-snug">
              {material.title}
            </h3>
            {material.author && (
              <p className="text-xs text-muted-foreground mt-1">@{material.author}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite(material.id)
            }}
          >
            <Heart
              className={cn(
                "h-4 w-4",
                material.is_favorite && "fill-red-500 text-red-500"
              )}
            />
          </Button>
        </div>

        {material.summary && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
            {material.summary}
          </p>
        )}

        <div className="flex flex-wrap gap-1 mt-3">
          {material.brand && (
            <Badge variant="outline" className="text-xs">
              {material.brand}
            </Badge>
          )}
          {material.car_model && (
            <Badge variant="outline" className="text-xs">
              {material.car_model}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-1 mt-2">
          {material.content_types.slice(0, 3).map((t) => (
            <Badge key={t} variant="secondary" className="text-xs">
              {t}
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <span className="text-xs text-muted-foreground">
            {SOURCE_TYPE_LABELS[material.source_type] || material.source_type}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(material.created_at).toLocaleDateString("zh-CN")}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
