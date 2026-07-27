"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/Header"
import { FilterPanel, FilterState } from "@/components/FilterPanel"
import { MaterialTable } from "@/components/MaterialTable"
import { MaterialCard } from "@/components/MaterialCard"
import { MaterialDrawer } from "@/components/MaterialDrawer"
import { AddMaterialModal } from "@/components/AddMaterialModal"
import { ViewModeToggle } from "@/components/ViewModeToggle"
import { getMaterials, getOptions, toggleFavorite, deleteMaterial, createMaterial, updateMaterial, Material, Options } from "@/lib/api"

export default function HomePage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [options, setOptions] = useState<Options>({
    brands: [],
    car_models: [],
    source_types: [],
    content_types: [],
  })
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"table" | "card">("table")
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState<FilterState>({
    brand: "",
    car_model: "",
    source_type: "",
    content_types: [],
    is_favorite: null,
  })
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  const loadOptions = useCallback(async () => {
    try {
      const opts = await getOptions()
      setOptions(opts)
    } catch (e) {
      console.error("Failed to load options", e)
    }
  }, [])

  const loadMaterials = useCallback(async () => {
    setLoading(true)
    try {
      const params: Parameters<typeof getMaterials>[0] = {
        q: search || undefined,
        brand: filters.brand || undefined,
        car_model: filters.car_model || undefined,
        source_type: filters.source_type || undefined,
        content_types: filters.content_types.length > 0 ? filters.content_types : undefined,
        is_favorite: filters.is_favorite ?? undefined,
        page,
        page_size: pageSize,
        sort: "created_at",
        order: "desc",
      }
      const result = await getMaterials(params)
      setMaterials(result.items)
      setTotal(result.total)
    } catch (e) {
      console.error("Failed to load materials", e)
    } finally {
      setLoading(false)
    }
  }, [search, filters, page, pageSize])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  useEffect(() => {
    loadMaterials()
  }, [loadMaterials])

  const handleToggleFavorite = async (id: string) => {
    try {
      const updated = await toggleFavorite(id)
      setMaterials((prev) =>
        prev.map((m) => (m.id === id ? updated : m))
      )
      if (selectedMaterial?.id === id) {
        setSelectedMaterial(updated)
      }
    } catch (e) {
      console.error("Failed to toggle favorite", e)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteMaterial(id)
      setMaterials((prev) => prev.filter((m) => m.id !== id))
      setSelectedMaterial(null)
    } catch (e) {
      console.error("Failed to delete material", e)
    }
  }

  const handleEdit = (material: Material) => {
    setEditingMaterial(material)
    setAddModalOpen(true)
  }

  const handleSubmit = async (formData: FormData) => {
    try {
      if (editingMaterial) {
        const updated = await updateMaterial(editingMaterial.id, formData)
        setMaterials((prev) =>
          prev.map((m) => (m.id === editingMaterial.id ? updated : m))
        )
        if (selectedMaterial?.id === editingMaterial.id) {
          setSelectedMaterial(updated)
        }
      } else {
        const created = await createMaterial(formData)
        setMaterials((prev) => [created, ...prev])
      }
      await loadOptions()
      setEditingMaterial(null)
    } catch (e) {
      console.error("Failed to submit material", e)
      throw e
    }
  }

  const handleSearchChange = (q: string) => {
    setSearch(q)
    setPage(1)
  }

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters)
    setPage(1)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        searchValue={search}
        onSearch={handleSearchChange}
        onAddClick={() => {
          setEditingMaterial(null)
          setAddModalOpen(true)
        }}
      />

      <main className="flex-1 container py-4">
        <FilterPanel
          filters={filters}
          onFilterChange={handleFilterChange}
          options={options}
          className="mb-4"
        />

        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-muted-foreground">
            共 {total} 条素材
          </div>
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">加载中...</div>
        ) : viewMode === "table" ? (
          <MaterialTable
            materials={materials}
            onToggleFavorite={handleToggleFavorite}
            onRowClick={setSelectedMaterial}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {materials.map((m) => (
              <MaterialCard
                key={m.id}
                material={m}
                onToggleFavorite={handleToggleFavorite}
                onClick={setSelectedMaterial}
              />
            ))}
            {materials.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                暂无素材，试试调整筛选条件或添加新素材
              </div>
            )}
          </div>
        )}

        {total > pageSize && (
          <div className="flex justify-center gap-2 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              上一页
            </button>
            <span className="px-3 py-1">
              第 {page} / {Math.ceil(total / pageSize)} 页
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * pageSize >= total}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        )}
      </main>

      <MaterialDrawer
        material={selectedMaterial}
        onClose={() => setSelectedMaterial(null)}
        onToggleFavorite={handleToggleFavorite}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <AddMaterialModal
        open={addModalOpen}
        onClose={() => {
          setAddModalOpen(false)
          setEditingMaterial(null)
        }}
        onSubmit={handleSubmit}
        editingMaterial={editingMaterial}
      />
    </div>
  )
}
