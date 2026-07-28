"use client"

import { FilePlus2, SearchX } from "lucide-react"
import type { Material } from "@/lib/api"
import { MaterialCard } from "@/components/MaterialCard"
import { MaterialTable } from "@/components/MaterialTable"
import { Button } from "@/components/ui/button"

interface CollectionContentProps {
  materials: Material[]
  loading: boolean
  viewMode: "table" | "card"
  onToggleFavorite: (id: string) => void
  onSelect: (material: Material) => void
  onAdd: () => void
  emptyTitle?: string
  emptyDescription?: string
}

export function CollectionContent({
  materials,
  loading,
  viewMode,
  onToggleFavorite,
  onSelect,
  onAdd,
  emptyTitle = "还没有匹配的素材",
  emptyDescription = "换个关键词或筛选条件试试",
}: CollectionContentProps) {
  if (loading) {
    return viewMode === "card" ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-[280px] animate-pulse rounded-lg border bg-card"
          />
        ))}
      </div>
    ) : (
      <div className="h-[420px] animate-pulse rounded-lg border bg-card" />
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
          添加素材
        </Button>
      </div>
    )
  }

  if (viewMode === "table") {
    return (
      <MaterialTable
        materials={materials}
        onToggleFavorite={onToggleFavorite}
        onRowClick={onSelect}
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {materials.map((material) => (
        <MaterialCard
          key={material.id}
          material={material}
          onToggleFavorite={onToggleFavorite}
          onClick={onSelect}
        />
      ))}
    </div>
  )
}
