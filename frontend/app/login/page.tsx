"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"


export default function LoginPage() {
  const router = useRouter()
  const { signIn } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!username.trim() || !password || submitting) return
    setSubmitting(true)
    setError("")
    try {
      await signIn(username.trim(), password)
      const requestedPath = new URLSearchParams(window.location.search).get("next")
      const next = requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
        ? requestedPath
        : "/"
      router.replace(next)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "登录失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(320px,0.72fr)_minmax(480px,1.28fr)]">
      <section className="hidden border-r bg-foreground px-10 py-12 text-background lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-md bg-primary text-lg font-semibold text-primary-foreground">R</span>
          <div>
            <h1 className="text-base font-semibold">Ruby Rain</h1>
            <p className="text-xs text-background/65">内容素材与 AI 创作平台</p>
          </div>
        </div>
        <div className="mt-auto max-w-sm border-t border-background/20 pt-6">
          <p className="text-2xl font-semibold leading-9">团队共享素材，个人沉淀创作。</p>
          <p className="mt-3 text-sm leading-6 text-background/65">车型资料与灵感统一协作，收藏、AI 对话和创作记录归属个人账号。</p>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-md bg-primary font-semibold text-primary-foreground">R</span>
            <div>
              <h1 className="text-sm font-semibold">Ruby Rain</h1>
              <p className="text-xs text-muted-foreground">内容素材库</p>
            </div>
          </div>

          <div className="mb-6">
            <span className="mb-4 grid size-10 place-items-center rounded-md bg-accent text-primary">
              <LockKeyhole className="size-5" />
            </span>
            <h2 className="text-2xl font-semibold">登录工作台</h2>
            <p className="mt-2 text-sm text-muted-foreground">使用公司内部账号继续</p>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 border-y border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium">用户名</label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="输入用户名"
                className="h-11 bg-card"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">密码</label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="输入密码"
                  className="h-11 bg-card pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-1 top-1 grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  title={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="h-11 w-full" disabled={!username.trim() || !password || submitting}>
              {submitting && <LoaderCircle className="animate-spin" />}
              {submitting ? "正在登录" : "登录"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  )
}
