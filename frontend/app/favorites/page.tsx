"use client"

import { useState, useEffect, useCallback } from "react"
import { Header } from "@/components/Header"
import { MaterialTable } from "@/components/MaterialTable"
import { MaterialCard } from "@/components/MaterialCard"
import { MaterialDrawer } from "@/components/MaterialDrawer"
import { AddMaterialModal } from "@/components/AddMaterialModal"
import { ViewModeToggle } from "@/components/ViewModeToggle"
import { getFavorites, toggleFavorite, deleteMaterial, updateMaterial, Material } from "@/lib/api"

export default function FavoritesPage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"table" | "card">("table")
  const [search, setSearch] = useState("")
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)

  const loadFavorites = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getFavorites()
      setMaterials(result.items)
    } catch (e) {
      console.error("Failed to load favorites", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  const handleToggleFavorite = async (id: string) => {
    try {
      const updated = await toggleFavorite(id)
      setMaterials((prev) => prev.filter((m) => m.id !== id))
      if (selectedMaterial?.id === id) {
        setSelectedMaterial(null)
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

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        searchValue={search}
        onSearch={setSearch}
        onAddClick={() => {
          setEditingMaterial(null)
          setAddModalOpen(true)
        }}
      />

      <main className="flex-1 container py-4">
        <h1 className="text-xl font-semibold mb-4">我的收藏</h1>

        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-muted-foreground">
            共 {materials.length} 条收藏
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
                暂无收藏内容
              </div>
            )}
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
        onSubmit={async (formData) => {
          try {
            if (editingMaterial) {
              const updated = await updateMaterial(editingMaterial.id, formData)
              setMaterials((prev) =>
                prev.map((m) => (m.id === editingMaterial.id ? updated : m))
              )
            }
          } catch (e) {
            console.error("Failed to submit", e)
            throw e
          }
        }}
        editingMaterial={editingMaterial}
      />
    </div>
  )
}
