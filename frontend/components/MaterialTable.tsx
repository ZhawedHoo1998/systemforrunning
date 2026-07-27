"use client"

import { useState } from "react"
import Link from "next/link"
import { ExternalLink, Heart, Star } from "lucide-react"
import { Material } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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

interface MaterialTableProps {
  materials: Material[]
  onToggleFavorite: (id: string) => void
  onRowClick: (material: Material) => void
}

export function MaterialTable({ materials, onToggleFavorite, onRowClick }: MaterialTableProps) {
  if (materials.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        暂无素材，试试调整筛选条件或添加新素材
      </div>
    )
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">标题</TableHead>
            <TableHead>品牌</TableHead>
            <TableHead>车型</TableHead>
            <TableHead>来源</TableHead>
            <TableHead>内容类型</TableHead>
            <TableHead>收藏</TableHead>
            <TableHead>时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {materials.map((m) => (
            <TableRow
              key={m.id}
              className="cursor-pointer hover:bg-zinc-50"
              onClick={() => onRowClick(m)}
            >
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span className="font-medium line-clamp-1">{m.title}</span>
                  {m.author && (
                    <span className="text-xs text-muted-foreground">@{m.author}</span>
                  )}
                </div>
              </TableCell>
              <TableCell>{m.brand || "-"}</TableCell>
              <TableCell>{m.car_model || "-"}</TableCell>
              <TableCell>{SOURCE_TYPE_LABELS[m.source_type] || m.source_type}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {m.content_types.slice(0, 2).map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs">
                      {t}
                    </Badge>
                  ))}
                  {m.content_types.length > 2 && (
                    <Badge variant="outline" className="text-xs">
                      +{m.content_types.length - 2}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFavorite(m.id)
                  }}
                >
                  <Heart
                    className={cn(
                      "h-4 w-4",
                      m.is_favorite && "fill-red-500 text-red-500"
                    )}
                  />
                </Button>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(m.created_at).toLocaleDateString("zh-CN")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
