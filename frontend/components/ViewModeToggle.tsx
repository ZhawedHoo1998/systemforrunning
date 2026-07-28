"use client"

import { LayoutGrid, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ViewModeToggleProps {
  viewMode: "table" | "card"
  onViewModeChange: (mode: "table" | "card") => void
}

export function ViewModeToggle({ viewMode, onViewModeChange }: ViewModeToggleProps) {
  return (
    <div className="grid h-9 w-[76px] grid-cols-2 rounded-md border bg-card p-0.5" aria-label="切换素材视图">
      <Button
        variant="ghost"
        size="icon"
        className={cn("size-8 rounded-sm shadow-none", viewMode === "table" && "bg-secondary text-foreground")}
        onClick={() => onViewModeChange("table")}
        aria-label="列表视图"
        title="列表视图"
      >
        <List />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn("size-8 rounded-sm shadow-none", viewMode === "card" && "bg-secondary text-foreground")}
        onClick={() => onViewModeChange("card")}
        aria-label="卡片视图"
        title="卡片视图"
      >
        <LayoutGrid />
      </Button>
    </div>
  )
}
