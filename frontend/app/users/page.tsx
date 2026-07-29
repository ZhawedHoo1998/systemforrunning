"use client"

import { FormEvent, useEffect, useState } from "react"
import { AlertCircle, LoaderCircle, Pencil, ShieldCheck, UserPlus, UsersRound, UserX } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { Header } from "@/components/Header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createUser,
  getUsers,
  updateUser,
  type User,
} from "@/lib/api"


export default function UsersPage() {
  const { user: currentUser, refreshUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [username, setUsername] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<User["role"]>("writer")
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState("")

  useEffect(() => {
    if (currentUser?.role !== "admin") return
    let active = true
    getUsers()
      .then((result) => {
        if (!active) return
        setUsers(result)
        setError("")
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "用户列表加载失败")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [currentUser?.role])

  const openCreate = () => {
    setEditingUser(null)
    setUsername("")
    setDisplayName("")
    setPassword("")
    setRole("writer")
    setError("")
    setDialogOpen(true)
  }

  const openEdit = (user: User) => {
    setEditingUser(user)
    setUsername(user.username)
    setDisplayName(user.display_name)
    setPassword("")
    setRole(user.role)
    setError("")
    setDialogOpen(true)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      if (editingUser) {
        const updated = await updateUser(editingUser.id, {
          display_name: displayName.trim(),
          role,
          ...(password ? { password } : {}),
        })
        setUsers((current) => current.map((item) => item.id === updated.id ? updated : item))
        if (updated.id === currentUser?.id) await refreshUser()
      } else {
        const created = await createUser({
          username: username.trim(),
          display_name: displayName.trim(),
          password,
          role,
        })
        setUsers((current) => [...current, created])
      }
      setDialogOpen(false)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "用户保存失败")
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (user: User) => {
    setUpdatingId(user.id)
    setError("")
    try {
      const updated = await updateUser(user.id, { is_active: !user.is_active })
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "账号状态更新失败")
    } finally {
      setUpdatingId("")
    }
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="min-h-screen">
        <Header showActions={false} />
        <main className="app-container py-16 text-center">
          <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">没有用户管理权限</h1>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header showActions={false} />
      <main className="app-container py-6 lg:py-8">
        <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-primary">
              <ShieldCheck className="size-3.5" />
              管理员工作区
            </div>
            <h1 className="text-2xl font-semibold">用户管理</h1>
            <p className="mt-1 text-sm text-muted-foreground">{users.length} 个账号 · {users.filter((user) => user.is_active).length} 个启用</p>
          </div>
          <Button onClick={openCreate}>
            <UserPlus />
            添加用户
          </Button>
        </div>

        {error && !dialogOpen && (
          <div className="mt-5 flex items-start gap-2 border-y border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            正在加载用户
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto border-y bg-card">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">用户</th>
                  <th className="px-4 py-3 font-medium">用户名</th>
                  <th className="px-4 py-3 font-medium">角色</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3.5 font-medium">
                      {user.display_name}
                      {user.id === currentUser.id && <span className="ml-2 text-xs font-normal text-muted-foreground">当前账号</span>}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">{user.username}</td>
                    <td className="px-4 py-3.5">
                      <Badge variant={user.role === "admin" ? "secondary" : "outline"}>
                        {user.role === "admin" ? "管理员" : user.role === "manager" ? "运营管理" : "写手"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={user.is_active ? "text-emerald-700" : "text-muted-foreground"}>{user.is_active ? "已启用" : "已停用"}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(user)} aria-label={`编辑${user.display_name}`} title="编辑用户">
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={user.is_active ? "text-muted-foreground hover:bg-red-50 hover:text-destructive" : "text-emerald-700"}
                          onClick={() => void handleToggleActive(user)}
                          disabled={user.id === currentUser.id || updatingId === user.id}
                          aria-label={user.is_active ? `停用${user.display_name}` : `启用${user.display_name}`}
                          title={user.is_active ? "停用账号" : "启用账号"}
                        >
                          {updatingId === user.id ? <LoaderCircle className="animate-spin" /> : user.is_active ? <UserX /> : <UsersRound />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>{editingUser ? "编辑用户" : "添加用户"}</DialogTitle>
          <DialogDescription>{editingUser ? "修改姓名、角色或重置密码" : "为内部写手创建独立账号"}</DialogDescription>

          {error && (
            <div className="flex items-start gap-2 border-y border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="user-name" className="text-sm font-medium">姓名</label>
              <Input id="user-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：王小雨" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="user-username" className="text-sm font-medium">用户名</label>
              <Input id="user-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="例如：xiaoyu.wang" disabled={Boolean(editingUser)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="user-password" className="text-sm font-medium">{editingUser ? "重置密码（可选）" : "初始密码"}</label>
              <Input id="user-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">角色</label>
              <Select value={role} onValueChange={(value) => setRole(value as User["role"])} disabled={editingUser?.id === currentUser.id}>
                <SelectTrigger aria-label="选择用户角色"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="writer">写手</SelectItem>
                  <SelectItem value="manager">运营管理</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={!displayName.trim() || (!editingUser && (!username.trim() || password.length < 8)) || saving}>
                {saving ? <LoaderCircle className="animate-spin" /> : editingUser ? <Pencil /> : <UserPlus />}
                {saving ? "保存中" : "保存"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
