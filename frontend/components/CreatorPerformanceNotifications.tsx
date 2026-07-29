"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, BellRing, TrendingUp } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getCreatorPerformanceAlerts,
  markCreatorPerformanceAlertsSeen,
  type CreatorPerformanceAlert,
} from "@/lib/api"


const POLL_INTERVAL_MS = 60_000

function metricDelta(value: number) {
  return value > 0 ? `+${value}` : "0"
}

function CreatorPerformanceNotificationSession() {
  const router = useRouter()
  const channelRef = useRef<BroadcastChannel | null>(null)
  const [alerts, setAlerts] = useState<CreatorPerformanceAlert[]>([])
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") return
    try {
      const result = await getCreatorPerformanceAlerts()
      setAlerts(result.items)
      if (result.count > 0 && !document.querySelector('[role="dialog"]')) setOpen(true)
    } catch (error) {
      console.error("Failed to load creator performance alerts", error)
    }
  }, [])

  useEffect(() => {
    const channel = new BroadcastChannel("ruby-rain-creator-performance-alerts")
    channelRef.current = channel
    channel.onmessage = (event) => {
      if (event.data?.type === "seen") {
        setOpen(false)
        setAlerts([])
      }
    }
    const initialTimer = window.setTimeout(() => void refresh(), 1_500)
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibility)
      channel.close()
      channelRef.current = null
    }
  }, [refresh])

  const acknowledge = useCallback(async () => {
    const ids = alerts.map((alert) => alert.id)
    setOpen(false)
    setAlerts([])
    channelRef.current?.postMessage({ type: "seen" })
    try {
      await markCreatorPerformanceAlertsSeen(ids)
    } catch (error) {
      console.error("Failed to acknowledge creator performance alerts", error)
    }
  }, [alerts])

  const openAccountIntel = () => {
    void acknowledge()
    router.push("/creator-accounts")
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) setOpen(true)
      else void acknowledge()
    }}>
      <DialogContent className="max-h-[88dvh] w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="border-b px-5 py-5 pr-12 sm:px-6">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <BellRing className="size-3.5" />
            账号数据提醒
          </div>
          <DialogTitle className="mt-2 text-xl">发现 {alerts.length} 篇高表现笔记</DialogTitle>
          <DialogDescription className="mt-1">基于自有账号近 7 天互动、点赞和收藏变化</DialogDescription>
        </div>

        <div className="max-h-[58dvh] divide-y overflow-y-auto">
          {alerts.map((alert) => (
            <a
              key={alert.id}
              href={alert.source_url || `/creator-accounts`}
              target={alert.source_url ? "_blank" : undefined}
              rel={alert.source_url ? "noreferrer" : undefined}
              onClick={() => void acknowledge()}
              className="grid gap-3 px-5 py-4 hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-red-600 text-white hover:bg-red-600">重点</Badge>
                  <span className="text-xs text-muted-foreground">{alert.account_name}</span>
                </span>
                <strong className="mt-2 block text-sm font-semibold leading-5">{alert.metrics.title || alert.title}</strong>
                <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{alert.message}</span>
              </span>
              <span className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground sm:justify-end">
                <span>赞 {alert.metrics.liked_count} <b className="font-medium text-emerald-700">{metricDelta(alert.metrics.delta.liked_count)}</b></span>
                <span>藏 {alert.metrics.collected_count} <b className="font-medium text-emerald-700">{metricDelta(alert.metrics.delta.collected_count)}</b></span>
                <ArrowUpRight className="size-4" />
              </span>
            </a>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3 sm:px-6">
          <Button type="button" variant="ghost" onClick={() => void acknowledge()}>知道了</Button>
          <Button type="button" variant="outline" onClick={openAccountIntel}><TrendingUp />查看账号情报</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CreatorPerformanceNotifications() {
  const { user } = useAuth()
  return user?.role === "writer" ? <CreatorPerformanceNotificationSession key={user.id} /> : null
}
