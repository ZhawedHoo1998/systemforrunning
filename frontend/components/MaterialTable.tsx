"use client"

import { Heart } from "lucide-react"
import type { Material } from "@/lib/api"
import { formatMaterialDate, MATERIAL_SCOPE_LABELS, SOURCE_TYPE_LABELS } from "@/lib/materials"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface MaterialTableProps {
  materials: Material[]
  onToggleFavorite: (id: string) => void
  onRowClick: (material: Material) => void
}

export function MaterialTable({ materials, onToggleFavorite, onRowClick }: MaterialTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table className="min-w-[960px]">
        <TableHeader className="bg-muted/70">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[36%] px-4">素材内容</TableHead>
            <TableHead className="w-[15%]">适用范围</TableHead>
            <TableHead className="w-[15%]">来源</TableHead>
            <TableHead className="w-[24%]">内容类型</TableHead>
            <TableHead className="w-[70px] text-center">收藏</TableHead>
            <TableHead className="w-[82px] pr-4 text-right">新增</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {materials.map((material) => (
            <TableRow
              key={material.id}
              className="cursor-pointer hover:bg-muted/40"
              onClick={() => onRowClick(material)}
            >
              <TableCell className="px-4 py-3">
                <div className="min-w-0">
                  <p className="line-clamp-1 font-medium">{material.title}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    {material.summary || "暂无内容概述"}
                  </p>
                </div>
              </TableCell>
              <TableCell className="text-sm">
                {material.material_scope === "general" ? (
                  <Badge variant="outline" className="font-normal">{MATERIAL_SCOPE_LABELS.general}</Badge>
                ) : (
                  <>
                    <p>{material.brand || "-"}</p>
                    {material.car_model && <p className="mt-1 text-xs text-muted-foreground">{material.car_model}</p>}
                  </>
                )}
              </TableCell>
              <TableCell>
                <p className="text-sm">{SOURCE_TYPE_LABELS[material.source_type] || material.source_type}</p>
                {material.author && <p className="mt-1 text-xs text-muted-foreground">@{material.author}</p>}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1.5">
                  {material.content_types.slice(0, 2).map((type) => (
                    <Badge key={type} variant="secondary" className="font-normal">{type}</Badge>
                  ))}
                  {material.content_types.length > 2 && (
                    <Badge variant="outline" className="font-normal text-muted-foreground">
                      +{material.content_types.length - 2}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground shadow-none hover:text-primary"
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleFavorite(material.id)
                  }}
                  aria-label={material.is_favorite ? "取消收藏" : "收藏素材"}
                  title={material.is_favorite ? "取消收藏" : "收藏素材"}
                >
                  <Heart className={cn(material.is_favorite && "fill-primary text-primary")} />
                </Button>
              </TableCell>
              <TableCell className="pr-4 text-right text-xs text-muted-foreground">
                {formatMaterialDate(material.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
