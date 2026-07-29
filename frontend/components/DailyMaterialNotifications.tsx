"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ArrowRight, BellRing, Clock3, ImageIcon, LoaderCircle } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { MaterialDrawer } from "@/components/MaterialDrawer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getDailyMaterialNotifications,
  markDailyMaterialNotificationsSeen,
  toggleFavorite,
  type DailyMaterialNotifications as DailyMaterialNotificationsPayload,
  type Material,
} from "@/lib/api"
import { getPreviewImage, MATERIAL_SCOPE_LABELS, SOURCE_TYPE_LABELS } from "@/lib/materials"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

const POLL_INTERVAL_MS = 2 * 60 * 1000

function DailyMaterialNotificationSession() {
  const router = useRouter()
  const notificationChannel = useRef<BroadcastChannel | null>(null)
  const [batch, setBatch] = useState<DailyMaterialNotificationsPayload | null>(null)
  const [open, setOpen] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") return
    setLoading(true)
    try {
      const result = await getDailyMaterialNotifications()
      if (result.count > 0) {
        setBatch(result)
        setOpen(true)
      }
    } catch (error) {
      console.error("Failed to load daily material notifications", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const channel = new BroadcastChannel("ruby-rain-material-notifications")
    notificationChannel.current = channel
    channel.onmessage = (event) => {
      if (event.data?.type === "seen") {
        setOpen(false)
        setBatch(null)
      }
    }
    const initialTimer = window.setTimeout(() => void refresh(), 800)
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    const handleMaterialCreated = () => window.setTimeout(() => void refresh(), 250)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    window.addEventListener("ruby-rain:material-created", handleMaterialCreated)
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(interval)
      window.removeEventListener("ruby-rain:material-created", handleMaterialCreated)
      document.removeEventListener("visibilitychange", handleVisibility)
      notificationChannel.current = null
      channel.close()
    }
  }, [refresh])

  const acknowledgeBatch = useCallback(async () => {
    const cutoff = batch?.cutoff
    setOpen(false)
    setBatch(null)
    notificationChannel.current?.postMessage({ type: "seen" })
    if (!cutoff) return
    try {
      await markDailyMaterialNotificationsSeen(cutoff)
    } catch (error) {
      console.error("Failed to acknowledge material notifications", error)
    }
  }, [batch])

  const openMaterial = (material: Material) => {
    setSelectedMaterial(material)
    void acknowledgeBatch()
  }

  const openRecent = () => {
    void acknowledgeBatch()
    router.push("/recent")
  }

  const handleToggleFavorite = async (id: string) => {
    try {
      const updated = await toggleFavorite(id)
      setSelectedMaterial((current) => current?.id === id ? updated : current)
      setBatch((current) => current ? {
        ...current,
        items: current.items.map((item) => item.id === id ? updated : item),
      } : current)
    } catch (error) {
      console.error("Failed to toggle favorite from notification", error)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        if (nextOpen) setOpen(true)
        else void acknowledgeBatch()
      }}>
        <DialogContent className="max-h-[88dvh] w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <div className="border-b px-5 py-5 pr-12 sm:px-6">
            <div className="flex items-center gap-2 text-xs font-medium text-primary">
              <BellRing className="size-3.5" />
              今日新入库
            </div>
            <DialogTitle className="mt-2 text-xl">新增 {batch?.count || 0} 条素材</DialogTitle>
            <DialogDescription className="mt-1">
              {batch?.date || "今天"} · 已同步到全员素材库
            </DialogDescription>
          </div>

          <div className="max-h-[58dvh] divide-y overflow-y-auto">
            {batch?.items.map((material) => {
              const preview = getPreviewImage(material)
              return (
                <button
                  key={material.id}
                  type="button"
                  onClick={() => openMaterial(material)}
                  className="grid w-full grid-cols-[72px_minmax(0,1fr)_20px] items-center gap-3 px-5 py-3.5 text-left hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[88px_minmax(0,1fr)_20px] sm:px-6"
                >
                  <span className="relative grid aspect-[4/3] overflow-hidden rounded-md border bg-muted">
                    {preview ? (
                      <Image src={preview.path} alt="" fill sizes="88px" className="object-cover" unoptimized />
                    ) : (
                      <ImageIcon className="m-auto size-5 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="font-normal">{SOURCE_TYPE_LABELS[material.source_type] || material.source_type}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {material.material_scope === "vehicle"
                          ? [material.brand, material.car_model].filter(Boolean).join(" · ")
                          : MATERIAL_SCOPE_LABELS.general}
                      </span>
                    </span>
                    <strong className="mt-1.5 block truncate text-sm font-semibold">{material.title}</strong>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {material.summary || material.original_content || "暂无内容概述"}
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </button>
              )
            })}
            {loading && !batch && (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />正在同步
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3 sm:px-6">
            <Button type="button" variant="ghost" onClick={() => void acknowledgeBatch()}>稍后查看</Button>
            <Button type="button" variant="outline" onClick={openRecent}><Clock3 />全部最近新增</Button>
          </div>
        </DialogContent>
      </Dialog>

      <MaterialDrawer
        material={selectedMaterial}
        onClose={() => setSelectedMaterial(null)}
        onToggleFavorite={handleToggleFavorite}
      />
    </>
  )
}

export function DailyMaterialNotifications() {
  const { user } = useAuth()
  return user ? <DailyMaterialNotificationSession key={user.id} /> : null
}
