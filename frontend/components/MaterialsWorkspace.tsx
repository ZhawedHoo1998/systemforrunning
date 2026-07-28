"use client"

import { useEffect, useMemo, useState } from "react"
import { CarFront, ChevronLeft, ChevronRight, Lightbulb, Plus } from "lucide-react"
import { AddMaterialModal } from "@/components/AddMaterialModal"
import { CollectionContent } from "@/components/CollectionContent"
import { FilterPanel, type FilterState } from "@/components/FilterPanel"
import { Header } from "@/components/Header"
import { MaterialDrawer } from "@/components/MaterialDrawer"
import { ViewModeToggle } from "@/components/ViewModeToggle"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createMaterial,
  deleteMaterial,
  getMaterialFacets,
  getMaterials,
  getOptions,
  toggleFavorite,
  updateMaterial,
  type Material,
  type MaterialFacets,
  type MaterialScope,
  type Options,
} from "@/lib/api"
import { GENERAL_CONTENT_TYPES, VEHICLE_CONTENT_TYPES } from "@/lib/materials"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 18
const LAST_VEHICLE_KEY = "ruby-rain-last-vehicle"

const EMPTY_FILTERS: FilterState = {
  brand: "",
  car_model: "",
  source_type: "",
  content_types: [],
  is_favorite: null,
}

const EMPTY_OPTIONS: Options = {
  brands: [],
  car_models: [],
  vehicles: [],
  source_types: [],
  content_types: [],
  content_type_groups: {
    vehicle: VEHICLE_CONTENT_TYPES,
    general: GENERAL_CONTENT_TYPES,
  },
}

const EMPTY_FACETS: MaterialFacets = { total: 0, content_types: {} }

interface MaterialsWorkspaceProps {
  scope: MaterialScope
}

export function MaterialsWorkspace({ scope }: MaterialsWorkspaceProps) {
  const isVehicleWorkspace = scope === "vehicle"
  const [materials, setMaterials] = useState<Material[]>([])
  const [options, setOptions] = useState<Options>(EMPTY_OPTIONS)
  const [facets, setFacets] = useState<MaterialFacets>(EMPTY_FACETS)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(!isVehicleWorkspace)
  const [viewMode, setViewMode] = useState<"table" | "card">("card")
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [selectedBrand, setSelectedBrand] = useState("")
  const [selectedCarModel, setSelectedCarModel] = useState("")
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)

  const contentTypes = options.content_type_groups[scope] ?? (
    isVehicleWorkspace ? VEHICLE_CONTENT_TYPES : GENERAL_CONTENT_TYPES
  )
  const brands = useMemo(
    () => Array.from(new Set(options.vehicles.map((vehicle) => vehicle.brand))),
    [options.vehicles]
  )
  const carModels = useMemo(
    () => options.vehicles
      .filter((vehicle) => vehicle.brand === selectedBrand)
      .map((vehicle) => vehicle.car_model),
    [options.vehicles, selectedBrand]
  )
  const canLoadMaterials = !isVehicleWorkspace || Boolean(selectedBrand && selectedCarModel)

  useEffect(() => {
    let active = true

    getOptions()
      .then((result) => {
        if (!active) return
        setOptions(result)

        if (isVehicleWorkspace && !selectedBrand && !selectedCarModel) {
          try {
            const saved = JSON.parse(localStorage.getItem(LAST_VEHICLE_KEY) ?? "null") as {
              brand?: string
              car_model?: string
            } | null
            const exists = result.vehicles.some(
              (vehicle) => vehicle.brand === saved?.brand && vehicle.car_model === saved?.car_model
            )
            if (exists && saved?.brand && saved.car_model) {
              setLoading(true)
              setSelectedBrand(saved.brand)
              setSelectedCarModel(saved.car_model)
            }
          } catch {
            localStorage.removeItem(LAST_VEHICLE_KEY)
          }
        }
      })
      .catch((error) => console.error("Failed to load options", error))

    return () => {
      active = false
    }
  }, [isVehicleWorkspace, refreshKey, selectedBrand, selectedCarModel])

  useEffect(() => {
    if (!canLoadMaterials) {
      return
    }

    let active = true
    Promise.all([
      getMaterials({
        q: search || undefined,
        material_scope: scope,
        brand: isVehicleWorkspace ? selectedBrand : undefined,
        car_model: isVehicleWorkspace ? selectedCarModel : undefined,
        source_type: filters.source_type || undefined,
        content_types: filters.content_types.length > 0 ? filters.content_types : undefined,
        is_favorite: filters.is_favorite ?? undefined,
        page,
        page_size: PAGE_SIZE,
        sort: "created_at",
        order: "desc",
      }),
      getMaterialFacets({
        material_scope: scope,
        brand: isVehicleWorkspace ? selectedBrand : undefined,
        car_model: isVehicleWorkspace ? selectedCarModel : undefined,
      }),
    ])
      .then(([result, facetResult]) => {
        if (!active) return
        setMaterials(result.items)
        setTotal(result.total)
        setFacets(facetResult)
      })
      .catch((error) => console.error("Failed to load materials", error))
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [
    canLoadMaterials,
    filters,
    isVehicleWorkspace,
    page,
    refreshKey,
    scope,
    search,
    selectedBrand,
    selectedCarModel,
  ])

  const openAddModal = () => {
    setEditingMaterial(null)
    setAddModalOpen(true)
  }

  const handleVehicleChange = (brand: string, carModel: string) => {
    setLoading(true)
    setSelectedBrand(brand)
    setSelectedCarModel(carModel)
    setFilters(EMPTY_FILTERS)
    setPage(1)
    localStorage.setItem(LAST_VEHICLE_KEY, JSON.stringify({ brand, car_model: carModel }))
  }

  const handleSearchChange = (query: string) => {
    if (canLoadMaterials) setLoading(true)
    setSearch(query)
    setPage(1)
  }

  const handleFilterChange = (nextFilters: FilterState) => {
    if (canLoadMaterials) setLoading(true)
    setFilters(nextFilters)
    setPage(1)
  }

  const handleContentTypeChange = (contentType: string) => {
    setLoading(true)
    setFilters((current) => ({
      ...current,
      content_types: contentType ? [contentType] : [],
    }))
    setPage(1)
  }

  const handleToggleFavorite = async (id: string) => {
    try {
      const updated = await toggleFavorite(id)
      setMaterials((current) => current.map((material) => material.id === id ? updated : material))
      if (selectedMaterial?.id === id) setSelectedMaterial(updated)
    } catch (error) {
      console.error("Failed to toggle favorite", error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteMaterial(id)
      setMaterials((current) => current.filter((material) => material.id !== id))
      setSelectedMaterial(null)
      setRefreshKey((current) => current + 1)
    } catch (error) {
      console.error("Failed to delete material", error)
      throw error
    }
  }

  const handleEdit = (material: Material) => {
    setEditingMaterial(material)
    setAddModalOpen(true)
  }

  const handleSubmit = async (formData: FormData) => {
    if (editingMaterial) {
      const updated = await updateMaterial(editingMaterial.id, formData)
      if (updated.material_scope !== scope || (
        isVehicleWorkspace && (
          updated.brand !== selectedBrand || updated.car_model !== selectedCarModel
        )
      )) {
        setMaterials((current) => current.filter((material) => material.id !== updated.id))
        setSelectedMaterial(null)
      } else {
        setMaterials((current) => current.map((material) => material.id === updated.id ? updated : material))
        if (selectedMaterial?.id === updated.id) setSelectedMaterial(updated)
      }
    } else {
      const created = await createMaterial(formData)
      if (isVehicleWorkspace && created.material_scope === "vehicle" && created.brand && created.car_model) {
        handleVehicleChange(created.brand, created.car_model)
      }
    }

    setLoading(true)
    setRefreshKey((current) => current + 1)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const activeContentType = filters.content_types[0] ?? ""

  return (
    <div className="min-h-screen">
      <Header searchValue={search} onSearch={handleSearchChange} onAddClick={openAddModal} />

      <main className="app-container py-6 lg:py-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-primary">
              {isVehicleWorkspace ? <CarFront className="size-3.5" /> : <Lightbulb className="size-3.5" />}
              {isVehicleWorkspace ? "车型创作工作台" : "通用创作参考"}
            </div>
            <h1 className="text-2xl font-semibold">
              {isVehicleWorkspace ? "车型素材" : "灵感中心"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isVehicleWorkspace && selectedCarModel
                ? `${selectedBrand} · ${selectedCarModel}，共 ${facets.total} 条素材`
                : !isVehicleWorkspace
                  ? `共收录 ${facets.total} 条通用灵感`
                  : "选择车型后开始查找资料"}
            </p>
          </div>
        </div>

        {isVehicleWorkspace && (
          <section className="mb-6 flex flex-col gap-4 border-y bg-card px-4 py-4 sm:flex-row sm:items-end sm:px-5" aria-label="选择车型">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">品牌</label>
                <Select
                  value={selectedBrand || undefined}
                  onValueChange={(brand) => {
                    setSelectedBrand(brand)
                    setSelectedCarModel("")
                    setLoading(false)
                    setFilters(EMPTY_FILTERS)
                    setPage(1)
                  }}
                  disabled={brands.length === 0}
                >
                  <SelectTrigger className="h-10 bg-background shadow-none">
                    <SelectValue placeholder={brands.length === 0 ? "暂无品牌" : "选择品牌"} />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((brand) => <SelectItem key={brand} value={brand}>{brand}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">车型</label>
                <Select
                  value={selectedCarModel || undefined}
                  onValueChange={(carModel) => handleVehicleChange(selectedBrand, carModel)}
                  disabled={!selectedBrand || carModels.length === 0}
                >
                  <SelectTrigger className="h-10 bg-background shadow-none">
                    <SelectValue placeholder={!selectedBrand ? "请先选择品牌" : carModels.length === 0 ? "暂无车型" : "选择车型"} />
                  </SelectTrigger>
                  <SelectContent>
                    {carModels.map((carModel) => <SelectItem key={carModel} value={carModel}>{carModel}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="outline" className="h-10 shrink-0" onClick={openAddModal}>
              <Plus />
              添加车型素材
            </Button>
          </section>
        )}

        {canLoadMaterials ? (
          <>
            <div className="mb-5 overflow-x-auto border-b pb-3">
              <div className="flex min-w-max items-center gap-1" role="tablist" aria-label="内容类型">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!activeContentType}
                  onClick={() => handleContentTypeChange("")}
                  className={cn(
                    "h-9 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors",
                    !activeContentType && "bg-accent text-accent-foreground"
                  )}
                >
                  全部 <span className="ml-1 text-xs opacity-70">{facets.total}</span>
                </button>
                {contentTypes.map((contentType) => (
                  <button
                    key={contentType}
                    type="button"
                    role="tab"
                    aria-selected={activeContentType === contentType}
                    onClick={() => handleContentTypeChange(contentType)}
                    className={cn(
                      "h-9 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted",
                      activeContentType === contentType && "bg-accent text-accent-foreground"
                    )}
                  >
                    {contentType}
                    <span className="ml-1 text-xs opacity-70">{facets.content_types[contentType] ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-6">
              <FilterPanel
                filters={filters}
                onFilterChange={handleFilterChange}
                options={{ ...options, content_types: contentTypes }}
                showVehicleFilters={false}
                showContentTypes={false}
                className="lg:sticky lg:top-24"
              />

              <section className="min-w-0">
                <div className="mb-4 flex h-10 items-center justify-between border-b pb-4">
                  <p className="text-sm text-muted-foreground">
                    {loading ? "正在加载" : `当前显示 ${materials.length} 条`}
                  </p>
                  <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
                </div>

                <CollectionContent
                  materials={materials}
                  loading={loading}
                  viewMode={viewMode}
                  onToggleFavorite={handleToggleFavorite}
                  onSelect={setSelectedMaterial}
                  onAdd={openAddModal}
                  emptyTitle={activeContentType ? `暂无${activeContentType}素材` : "还没有匹配的素材"}
                  emptyDescription={search ? "换个关键词继续查找" : "可以直接添加一条新素材"}
                />

                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={page === 1}
                      onClick={() => {
                        setLoading(true)
                        setPage((current) => Math.max(1, current - 1))
                      }}
                      aria-label="上一页"
                      title="上一页"
                    >
                      <ChevronLeft />
                    </Button>
                    <span className="min-w-20 text-center text-sm text-muted-foreground">{page} / {totalPages}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={page >= totalPages}
                      onClick={() => {
                        setLoading(true)
                        setPage((current) => current + 1)
                      }}
                      aria-label="下一页"
                      title="下一页"
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                )}
              </section>
            </div>
          </>
        ) : (
          <section className="flex min-h-[360px] flex-col items-center justify-center border-y border-dashed px-6 text-center">
            <span className="mb-4 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <CarFront className="size-5" />
            </span>
            <h2 className="text-base font-semibold">先选择一个车型</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {brands.length > 0 ? "从上方选择品牌和车型" : "添加第一条车型素材后，这里会生成车型列表"}
            </p>
            <Button className="mt-5" onClick={openAddModal}>
              <Plus />
              添加车型素材
            </Button>
          </section>
        )}
      </main>

      <MaterialDrawer
        material={selectedMaterial}
        onClose={() => setSelectedMaterial(null)}
        onToggleFavorite={handleToggleFavorite}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {addModalOpen && (
        <AddMaterialModal
          key={editingMaterial?.id ?? `new-${scope}`}
          open
          onClose={() => {
            setAddModalOpen(false)
            setEditingMaterial(null)
          }}
          onSubmit={handleSubmit}
          editingMaterial={editingMaterial}
          defaultScope={scope}
        />
      )}
    </div>
  )
}
