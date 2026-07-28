"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CarFront, Clock3, Heart, Lightbulb, Plus, Search, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
                  "h-9 px-3 text-muted-foreground shadow-none",
                  active && "bg-accent text-accent-foreground"
                )}
              >
                <Link href={href} aria-current={active ? "page" : undefined}>
                  <Icon />
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
              <Icon className="size-3.5" />
              {label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
