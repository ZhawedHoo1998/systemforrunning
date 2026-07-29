"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, CarFront, ClipboardCheck, Clock3, FileText, Heart, Lightbulb, Plus, Search, Sparkles, UserRound } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getTaskSummary } from "@/lib/api"
import { cn } from "@/lib/utils"

interface HeaderProps {
  onSearch?: (query: string) => void
  onAddClick?: () => void
  searchValue?: string
  showActions?: boolean
}

const navigation = [
  { href: "/", label: "车型素材", icon: CarFront },
  { href: "/inspiration", label: "灵感中心", icon: Lightbulb },
  { href: "/ai", label: "AI 创作", icon: Sparkles },
  { href: "/creator-accounts", label: "账号情报", icon: BarChart3 },
  { href: "/tasks", label: "任务", icon: ClipboardCheck },
  { href: "/creations", label: "我的创作", icon: FileText },
  { href: "/favorites", label: "我的收藏", icon: Heart },
  { href: "/recent", label: "最近新增", icon: Clock3 },
]

export function Header({
  onSearch = () => undefined,
  onAddClick = () => undefined,
  searchValue = "",
  showActions = true,
}: HeaderProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const [taskReminderCount, setTaskReminderCount] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const refresh = async () => {
      try {
        const result = await getTaskSummary(true)
        if (!cancelled) setTaskReminderCount(result.notification_count)
      } catch {
        if (!cancelled) setTaskReminderCount(0)
      }
    }
    const handleTasksUpdated = (event: Event) => {
      const count = (event as CustomEvent<number>).detail
      if (typeof count === "number") setTaskReminderCount(count)
      else void refresh()
    }

    void refresh()
    const interval = window.setInterval(() => void refresh(), 60_000)
    window.addEventListener("ruby-rain:tasks-updated", handleTasksUpdated)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener("ruby-rain:tasks-updated", handleTasksUpdated)
    }
  }, [user])

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
      <div className="app-container flex h-16 items-center gap-3 lg:gap-5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Ruby Rain 素材库首页">
          <span className="grid size-9 place-items-center rounded-md bg-primary font-semibold text-primary-foreground">
            R
          </span>
          <span className="hidden leading-tight sm:block">
            <strong className="block text-sm font-semibold">Ruby Rain</strong>
            <span className="block text-[11px] text-muted-foreground">内容素材库</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="主导航">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Button
                key={href}
                asChild
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 px-2.5 text-muted-foreground shadow-none",
                  active && "bg-accent text-accent-foreground"
                )}
              >
                <Link href={href} aria-current={active ? "page" : undefined}>
                  <span className="relative">
                    <Icon />
                    {href === "/tasks" && taskReminderCount > 0 && (
                      <span className="absolute -right-2.5 -top-2.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-semibold leading-4 text-white">
                        {taskReminderCount > 99 ? "99+" : taskReminderCount}
                      </span>
                    )}
                  </span>
                  {label}
                </Link>
              </Button>
            )
          })}
        </nav>

        {showActions ? (
          <>
            <div className="relative ml-auto min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="搜索素材"
                placeholder="搜索标题、车型、作者或标签"
                value={searchValue}
                onChange={(event) => onSearch(event.target.value)}
                className="h-10 bg-background pl-9 shadow-none"
              />
            </div>

            <Button
              onClick={onAddClick}
              className="h-10 shrink-0 px-3 sm:px-4"
              aria-label="添加素材"
              title="添加素材"
            >
              <Plus />
              <span className="hidden sm:inline">添加素材</span>
            </Button>
          </>
        ) : (
          <div className="ml-auto" />
        )}

        <Button
          asChild
          variant="ghost"
          size="sm"
          className={cn(
            "h-10 shrink-0 px-2 text-muted-foreground sm:px-3",
            pathname === "/account" && "bg-accent text-accent-foreground"
          )}
        >
          <Link href="/account" aria-label="账号设置" title="账号设置">
            <UserRound />
            <span className="hidden max-w-24 truncate xl:inline">{user?.display_name}</span>
          </Link>
        </Button>
      </div>

      <nav className="app-container flex h-12 items-stretch gap-0.5 border-t lg:hidden" aria-label="移动端导航">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-b-2 border-transparent text-[10px] text-muted-foreground sm:flex-row sm:gap-1.5 sm:text-xs",
                active && "border-primary font-medium text-primary"
              )}
            >
              <span className="relative">
                <Icon className="size-3.5" />
                {href === "/tasks" && taskReminderCount > 0 && (
                  <span className="absolute -right-2 -top-2 grid min-w-3.5 place-items-center rounded-full bg-red-600 px-0.5 text-[8px] font-semibold leading-[14px] text-white">
                    {taskReminderCount > 9 ? "9+" : taskReminderCount}
                  </span>
                )}
              </span>
              {label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
