"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Heart, Clock, Search, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface HeaderProps {
  onSearch: (q: string) => void
  onAddClick: () => void
  searchValue: string
}

export function Header({ onSearch, onAddClick, searchValue }: HeaderProps) {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container flex h-14 items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">香氛素材库</span>
        </div>

        <nav className="flex items-center gap-1 ml-4">
          <Link href="/">
            <Button
              variant={pathname === "/" ? "secondary" : "ghost"}
              size="sm"
              className="gap-2"
            >
              <Search className="h-4 w-4" />
              素材库
            </Button>
          </Link>
          <Link href="/favorites">
            <Button
              variant={pathname === "/favorites" ? "secondary" : "ghost"}
              size="sm"
              className="gap-2"
            >
              <Heart className="h-4 w-4" />
              我的收藏
            </Button>
          </Link>
          <Link href="/recent">
            <Button
              variant={pathname === "/recent" ? "secondary" : "ghost"}
              size="sm"
              className="gap-2"
            >
              <Clock className="h-4 w-4" />
              最近新增
            </Button>
          </Link>
        </nav>

        <div className="flex-1 max-w-md ml-auto">
          <Input
            placeholder="搜索标题、车型、作者..."
            value={searchValue}
            onChange={(e) => onSearch(e.target.value)}
            className="h-9"
          />
        </div>

        <Button onClick={onAddClick} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          添加素材
        </Button>
      </div>
    </header>
  )
}
