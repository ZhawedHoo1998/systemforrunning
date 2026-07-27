"use client"

import { useState } from "react"
import { X, ExternalLink, Trash2, Edit, Heart } from "lucide-react"
import { Material } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
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

interface MaterialDrawerProps {
  material: Material | null
  onClose: () => void
  onToggleFavorite: (id: string) => void
  onEdit: (material: Material) => void
  onDelete: (id: string) => void
}

export function MaterialDrawer({
  material,
  onClose,
  onToggleFavorite,
  onEdit,
  onDelete,
}: MaterialDrawerProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  if (!material) return null

  const handleDelete = async () => {
    if (!confirm("确定要删除这个素材吗？")) return
    setIsDeleting(true)
    try {
      onDelete(material.id)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-xl z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b flex items-center justify-between p-4">
          <h2 className="font-semibold truncate pr-4">{material.title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {material.brand && (
              <Badge variant="outline">{material.brand}</Badge>
            )}
            {material.car_model && (
              <Badge variant="outline">{material.car_model}</Badge>
            )}
            <Badge variant="secondary">
              {SOURCE_TYPE_LABELS[material.source_type] || material.source_type}
            </Badge>
          </div>

          {material.author && (
            <div className="text-sm">
              <span className="text-muted-foreground">作者: </span>
              <span>{material.author}</span>
            </div>
          )}

          {material.source_url && (
            <div className="text-sm">
              <span className="text-muted-foreground">链接: </span>
              <a
                href={material.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                {material.source_url.slice(0, 50)}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          <Separator />

          <div>
            <h3 className="text-sm font-medium mb-2">内容类型</h3>
            <div className="flex flex-wrap gap-2">
              {material.content_types.map((t) => (
                <Badge key={t} variant="default">{t}</Badge>
              ))}
            </div>
          </div>

          {material.summary && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium mb-2">内容概述</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {material.summary}
                </p>
              </div>
            </>
          )}

          {material.save_reason && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium mb-2">为什么保存</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {material.save_reason}
                </p>
              </div>
            </>
          )}

          {material.learning_points && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium mb-2">值得学习</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {material.learning_points}
                </p>
              </div>
            </>
          )}

          {material.attachments && material.attachments.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium mb-2">附件</h3>
                <div className="space-y-2">
                  {material.attachments.map((att, i) => (
                    <a
                      key={i}
                      href={att.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                    >
                      {att.name}
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="flex gap-2">
            <Button
              variant={material.is_favorite ? "default" : "outline"}
              className="flex-1 gap-2"
              onClick={() => onToggleFavorite(material.id)}
            >
              <Heart className={cn("h-4 w-4", material.is_favorite && "fill-current")} />
              {material.is_favorite ? "已收藏" : "收藏"}
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={() => onEdit(material)}>
              <Edit className="h-4 w-4" />
              编辑
            </Button>
            <Button
              variant="destructive"
              size="icon"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="text-xs text-muted-foreground text-center pt-4">
            创建于 {new Date(material.created_at).toLocaleString("zh-CN")}
          </div>
        </div>
      </div>
    </>
  )
}
