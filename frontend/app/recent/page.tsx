"use client"

import { useEffect, useMemo, useState } from "react"
import { Clock3 } from "lucide-react"
import { Header } from "@/components/Header"
import { MaterialDrawer } from "@/components/MaterialDrawer"
import { AddMaterialModal } from "@/components/AddMaterialModal"
import { CollectionContent } from "@/components/CollectionContent"
import { ViewModeToggle } from "@/components/ViewModeToggle"
import {
  createMaterial,
  deleteMaterial,
  getRecent,
  toggleFavorite,
  updateMaterial,
  type Material,
} from "@/lib/api"
import { filterMaterials } from "@/lib/materials"

const RECENT_LIMIT = 50

export default function RecentPage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"table" | "card">("card")
  const [search, setSearch] = useState("")
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)

  useEffect(() => {
    let active = true

    getRecent(RECENT_LIMIT)
      .then((result) => {
        if (active) setMaterials(result)
      })
      .catch((error) => console.error("Failed to load recent materials", error))
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const visibleMaterials = useMemo(() => filterMaterials(materials, search), [materials, search])

  const openAddModal = () => {
    setEditingMaterial(null)
    setAddModalOpen(true)
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
      setMaterials((current) => current.map((material) => material.id === updated.id ? updated : material))
      if (selectedMaterial?.id === updated.id) setSelectedMaterial(updated)
      return
    }

    const created = await createMaterial(formData)
    setMaterials((current) => [created, ...current].slice(0, RECENT_LIMIT))
  }

  return (
    <div className="min-h-screen">
      <Header searchValue={search} onSearch={setSearch} onAddClick={openAddModal} />

      <main className="app-container py-6 lg:py-8">
        <div className="mb-6 flex items-end justify-between gap-4 border-b pb-5">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-primary">
              <Clock3 className="size-3.5" />
              最新入库
            </div>
            <h1 className="text-2xl font-semibold">最近新增</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {search ? `找到 ${visibleMaterials.length} 条结果` : `最近 ${materials.length} 条素材`}
            </p>
          </div>
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
        </div>

        <CollectionContent
          materials={visibleMaterials}
          loading={loading}
          viewMode={viewMode}
          onToggleFavorite={handleToggleFavorite}
          onSelect={setSelectedMaterial}
          onAdd={openAddModal}
          emptyTitle={search ? "最近素材中没有匹配结果" : "还没有新增素材"}
          emptyDescription={search ? "换个关键词继续查找" : "添加后会按时间显示在这里"}
        />
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
          key={editingMaterial?.id ?? "new"}
          open
          onClose={() => {
            setAddModalOpen(false)
            setEditingMaterial(null)
          }}
          onSubmit={handleSubmit}
          editingMaterial={editingMaterial}
        />
      )}
    </div>
  )
}
