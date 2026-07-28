"use client"

import { RotateCcw, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
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
  showVehicleFilters?: boolean
  showContentTypes?: boolean
}

const ALL_VALUE = "__all__"

export function FilterPanel({
  filters,
  onFilterChange,
  options,
  className,
  showVehicleFilters = true,
  showContentTypes = true,
}: FilterPanelProps) {
  const handleSelect = (key: "brand" | "car_model" | "source_type", value: string) => {
    onFilterChange({ ...filters, [key]: value === ALL_VALUE ? "" : value })
  }

  const handleContentTypeToggle = (type: string) => {
    const contentTypes = filters.content_types.includes(type)
      ? filters.content_types.filter((item) => item !== type)
      : [...filters.content_types, type]
    onFilterChange({ ...filters, content_types: contentTypes })
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

  const activeCount = [
    filters.brand,
    filters.car_model,
    filters.source_type,
    ...filters.content_types,
    filters.is_favorite === true ? "favorite" : "",
  ].filter(Boolean).length

  return (
    <aside className={cn("rounded-lg border bg-card p-4", className)} aria-label="素材筛选">
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">筛选素材</h2>
          {activeCount > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
              {activeCount}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            onClick={clearFilters}
            aria-label="清除全部筛选"
            title="清除全部筛选"
          >
            <RotateCcw />
          </Button>
        )}
      </div>

      <div className={cn("grid gap-4 pt-4 lg:grid-cols-1", showVehicleFilters && "sm:grid-cols-3")}>
        {showVehicleFilters && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">品牌</Label>
              <Select value={filters.brand || ALL_VALUE} onValueChange={(value) => handleSelect("brand", value)}>
                <SelectTrigger className="w-full bg-background shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>全部品牌</SelectItem>
                  {options.brands.map((brand) => (
                    <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">车型</Label>
              <Select value={filters.car_model || ALL_VALUE} onValueChange={(value) => handleSelect("car_model", value)}>
                <SelectTrigger className="w-full bg-background shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>全部车型</SelectItem>
                  {options.car_models.map((model) => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">素材来源</Label>
          <Select value={filters.source_type || ALL_VALUE} onValueChange={(value) => handleSelect("source_type", value)}>
            <SelectTrigger className="w-full bg-background shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>全部来源</SelectItem>
              {options.source_types.map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {showContentTypes && (
        <div className="mt-5 border-t pt-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">内容类型</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-1">
            {options.content_types.map((type) => {
              const checked = filters.content_types.includes(type)
              return (
                <label key={type} className="flex min-w-0 cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => handleContentTypeToggle(type)}
                    aria-label={type}
                  />
                  <span className="truncate">{type}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      <label className="mt-5 flex cursor-pointer items-center gap-2 border-t pt-4 text-sm font-medium">
        <Checkbox
          checked={filters.is_favorite === true}
          onCheckedChange={(checked) =>
            onFilterChange({ ...filters, is_favorite: checked === true ? true : null })
          }
          aria-label="只看收藏"
        />
        只看收藏
      </label>
    </aside>
  )
}
