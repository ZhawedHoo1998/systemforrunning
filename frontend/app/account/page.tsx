"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { AlertCircle, KeyRound, LoaderCircle, LogOut, ShieldCheck, Users } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { Header } from "@/components/Header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { changePassword } from "@/lib/api"


export default function AccountPage() {
  const { user, signOut } = useAuth()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const handlePasswordChange = async (event: FormEvent) => {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致")
      return
    }
    if (newPassword.length < 8) {
      setError("新密码至少需要 8 位")
      return
    }
    setSaving(true)
    setError("")
    try {
      await changePassword(currentPassword, newPassword)
      await signOut()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "密码修改失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen">
      <Header showActions={false} />
      <main className="app-container py-6 lg:py-8">
        <div className="border-b pb-5">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-primary">
            <ShieldCheck className="size-3.5" />
            个人账号
          </div>
          <h1 className="text-2xl font-semibold">账号设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理登录密码和当前会话</p>
        </div>

        <div className="grid gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.7fr)]">
          <section aria-labelledby="profile-heading">
            <h2 id="profile-heading" className="text-base font-semibold">账号信息</h2>
            <dl className="mt-4 divide-y border-y bg-card px-4 sm:px-5">
              <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr] sm:items-center">
                <dt className="text-sm text-muted-foreground">姓名</dt>
                <dd className="text-sm font-medium">{user?.display_name}</dd>
              </div>
              <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr] sm:items-center">
                <dt className="text-sm text-muted-foreground">用户名</dt>
                <dd className="text-sm font-medium">{user?.username}</dd>
              </div>
              <div className="grid gap-1 py-4 sm:grid-cols-[140px_1fr] sm:items-center">
                <dt className="text-sm text-muted-foreground">权限</dt>
                <dd className="text-sm font-medium">{user?.role === "admin" ? "管理员" : "写手"}</dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-wrap gap-3">
              {user?.role === "admin" && (
                <Button asChild>
                  <Link href="/users">
                    <Users />
                    用户管理
                  </Link>
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => void signOut()}>
                <LogOut />
                退出登录
              </Button>
            </div>
          </section>

          <section aria-labelledby="password-heading">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              <h2 id="password-heading" className="text-base font-semibold">修改密码</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">修改成功后需要重新登录</p>

            {error && (
              <div className="mt-4 flex items-start gap-2 border-y border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="mt-4 space-y-4 border-y bg-card px-4 py-5">
              <div className="space-y-1.5">
                <label htmlFor="current-password" className="text-sm font-medium">当前密码</label>
                <Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="text-sm font-medium">新密码</label>
                <Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="text-sm font-medium">确认新密码</label>
                <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </div>
              <Button type="submit" disabled={!currentPassword || !newPassword || !confirmPassword || saving}>
                {saving ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
                {saving ? "正在修改" : "修改密码"}
              </Button>
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}
