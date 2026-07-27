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
    <div className="flex gap-1 p-1 bg-muted rounded-lg">
      <Button
        variant={viewMode === "table" ? "secondary" : "ghost"}
        size="sm"
        className="h-8 px-2"
        onClick={() => onViewModeChange("table")}
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant={viewMode === "card" ? "secondary" : "ghost"}
        size="sm"
        className="h-8 px-2"
        onClick={() => onViewModeChange("card")}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
    </div>
  )
}
