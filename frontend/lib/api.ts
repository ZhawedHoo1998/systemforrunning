const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export interface Material {
  id: string
  title: string
  brand: string | null
  car_model: string | null
  source_type: string
  source_platform: string | null
  author: string | null
  source_url: string | null
  content_types: string[]
  summary: string | null
  original_content: string | null
  save_reason: string | null
  learning_points: string | null
  suggest_title: string | null
  tags: string[]
  attachments: Attachment[]
  is_favorite: boolean
  created_at: string
  updated_at: string
}

export interface Attachment {
  name: string
  path: string
  type: string
}

export interface MaterialsResponse {
  items: Material[]
  total: number
  page: number
  page_size: number
}

export interface Options {
  brands: string[]
  car_models: string[]
  source_types: [string, string][]
  content_types: string[]
}

export async function getMaterials(params: {
  q?: string
  brand?: string
  car_model?: string
  source_type?: string
  content_types?: string[]
  is_favorite?: boolean
  sort?: string
  order?: string
  page?: number
  page_size?: number
}): Promise<MaterialsResponse> {
  const sp = new URLSearchParams()
  if (params.q) sp.set("q", params.q)
  if (params.brand) sp.set("brand", params.brand)
  if (params.car_model) sp.set("car_model", params.car_model)
  if (params.source_type) sp.set("source_type", params.source_type)
  if (params.content_types?.length) sp.set("content_types", params.content_types.join(","))
  if (params.is_favorite !== undefined) sp.set("is_favorite", String(params.is_favorite))
  if (params.sort) sp.set("sort", params.sort)
  if (params.order) sp.set("order", params.order)
  if (params.page) sp.set("page", String(params.page))
  if (params.page_size) sp.set("page_size", String(params.page_size))

  const res = await fetch(`${API_BASE}/api/materials?${sp.toString()}`)
  if (!res.ok) throw new Error("Failed to fetch materials")
  return res.json()
}

export async function getMaterial(id: string): Promise<Material> {
  const res = await fetch(`${API_BASE}/api/materials/${id}`)
  if (!res.ok) throw new Error("Failed to fetch material")
  return res.json()
}

export async function createMaterial(formData: FormData): Promise<Material> {
  const res = await fetch(`${API_BASE}/api/materials`, {
    method: "POST",
    body: formData,
  })
  if (!res.ok) throw new Error("Failed to create material")
  return res.json()
}

export async function updateMaterial(id: string, formData: FormData): Promise<Material> {
  const res = await fetch(`${API_BASE}/api/materials/${id}`, {
    method: "PUT",
    body: formData,
  })
  if (!res.ok) throw new Error("Failed to update material")
  return res.json()
}

export async function deleteMaterial(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/materials/${id}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error("Failed to delete material")
}

export async function toggleFavorite(id: string): Promise<Material> {
  const res = await fetch(`${API_BASE}/api/materials/${id}/favorite`, {
    method: "POST",
  })
  if (!res.ok) throw new Error("Failed to toggle favorite")
  return res.json()
}

export async function getFavorites(page = 1, pageSize = 20): Promise<MaterialsResponse> {
  const res = await fetch(`${API_BASE}/api/materials/favorites?page=${page}&page_size=${pageSize}`)
  if (!res.ok) throw new Error("Failed to fetch favorites")
  return res.json()
}

export async function getRecent(limit = 30): Promise<Material[]> {
  const res = await fetch(`${API_BASE}/api/materials/recent?limit=${limit}`)
  if (!res.ok) throw new Error("Failed to fetch recent materials")
  return res.json()
}

export async function getOptions(): Promise<Options> {
  const res = await fetch(`${API_BASE}/api/materials/options`)
  if (!res.ok) throw new Error("Failed to fetch options")
  return res.json()
}
