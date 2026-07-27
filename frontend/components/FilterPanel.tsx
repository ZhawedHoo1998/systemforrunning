"use client"

import { useState } from "react"
import { Filter, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface FilterState {
  brand: string
  car_model: string
  source_type: string
  content_types: string[]
  is_favorite: boolean | null
}

interface FilterPanelProps {
  filters: FilterState
  onFilterChange: (filters: FilterState) => void
  options: {
    brands: string[]
    car_models: string[]
    source_types: [string, string][]
    content_types: string[]
  }
  className?: string
}

export function FilterPanel({ filters, onFilterChange, options, className }: FilterPanelProps) {
  const [showContentTypes, setShowContentTypes] = useState(false)

  const handleContentTypeToggle = (type: string) => {
    const newTypes = filters.content_types.includes(type)
      ? filters.content_types.filter((t) => t !== type)
      : [...filters.content_types, type]
    onFilterChange({ ...filters, content_types: newTypes })
  }

  const clearFilters = () => {
    onFilterChange({
      brand: "",
      car_model: "",
      source_type: "",
      content_types: [],
      is_favorite: null,
    })
  }

  const hasActiveFilters =
    filters.brand ||
    filters.car_model ||
    filters.source_type ||
    filters.content_types.length > 0 ||
    filters.is_favorite !== null

  return (
    <div className={cn("flex flex-wrap items-center gap-2 p-3 bg-zinc-50 rounded-lg", className)}>
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span>筛选:</span>
      </div>

      <Select
        value={filters.brand}
        onValueChange={(v) => onFilterChange({ ...filters, brand: v })}
      >
        <SelectTrigger className="h-8 w-[140px]">
          <SelectValue placeholder="品牌" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">全部品牌</SelectItem>
          {options.brands.map((b) => (
            <SelectItem key={b} value={b}>{b}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.car_model}
        onValueChange={(v) => onFilterChange({ ...filters, car_model: v })}
      >
        <SelectTrigger className="h-8 w-[140px]">
          <SelectValue placeholder="车型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">全部车型</SelectItem>
          {options.car_models.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.source_type}
        onValueChange={(v) => onFilterChange({ ...filters, source_type: v })}
      >
        <SelectTrigger className="h-8 w-[140px]">
          <SelectValue placeholder="来源" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">全部来源</SelectItem>
          {options.source_types.map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative">
        <Button
          variant={filters.content_types.length > 0 ? "secondary" : "outline"}
          size="sm"
          className="h-8 gap-1"
          onClick={() => setShowContentTypes(!showContentTypes)}
        >
          内容类型 {filters.content_types.length > 0 && `(${filters.content_types.length})`}
        </Button>
        {showContentTypes && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-lg border shadow-lg p-3 min-w-[300px]">
            <div className="flex flex-wrap gap-2">
              {options.content_types.map((type) => (
                <Badge
                  key={type}
                  variant={filters.content_types.includes(type) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => handleContentTypeToggle(type)}
                >
                  {type}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <Button
        variant={filters.is_favorite === true ? "default" : "outline"}
        size="sm"
        className="h-8"
        onClick={() =>
          onFilterChange({
            ...filters,
            is_favorite: filters.is_favorite === true ? null : true,
          })
        }
      >
        只看收藏
      </Button>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={clearFilters}>
          <X className="h-4 w-4" />
          清除筛选
        </Button>
      )}
    </div>
  )
}
