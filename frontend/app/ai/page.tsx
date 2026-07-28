"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  AlertCircle,
  CarFront,
  CheckCircle2,
  Clapperboard,
  FileText,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  Type,
  X,
} from "lucide-react"
import { Header } from "@/components/Header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  createMaterial,
  generateAiImage,
  getAiStatus,
  getMaterials,
  getOptions,
  streamAiChat,
  type AiMessage,
  type AiStatus,
  type AiTask,
  type Attachment,
  type Material,
  type VehicleOption,
} from "@/lib/api"
import { cn } from "@/lib/utils"

const TASKS = [
  { value: "title" as const, label: "生成标题", icon: Type, placeholder: "围绕所选素材生成 10 个标题，突出真实痛点和使用场景。" },
  { value: "note" as const, label: "小红书正文", icon: FileText, placeholder: "根据所选素材写一篇完整的小红书笔记。" },
  { value: "video" as const, label: "视频脚本", icon: Clapperboard, placeholder: "生成一条 60 秒短视频脚本，包含前三秒钩子和分镜。" },
  { value: "rewrite" as const, label: "内容改写", icon: RefreshCw, placeholder: "请根据所选素材重新组织表达，避免照搬原文。" },
]

function deriveTitle(content: string, carModel: string) {
  const firstLine = content
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").replace(/^[-*\d.、\s]+/, "").trim())
    .find(Boolean)
  return (firstLine || `${carModel} 笔记灵感`).slice(0, 60)
}

export default function AiStudioPage() {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [selectedBrand, setSelectedBrand] = useState("")
  const [selectedCarModel, setSelectedCarModel] = useState("")
  const [materials, setMaterials] = useState<Material[]>([])
  const [materialsLoading, setMaterialsLoading] = useState(false)
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [task, setTask] = useState<AiTask>("note")
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [chatError, setChatError] = useState("")
  const [imagePrompt, setImagePrompt] = useState("")
  const [generatingImage, setGeneratingImage] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<Attachment[]>([])
  const [noteTitle, setNoteTitle] = useState("")
  const [saving, setSaving] = useState(false)
  const [savedMaterial, setSavedMaterial] = useState<Material | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([getAiStatus(), getOptions()])
      .then(([statusResult, optionsResult]) => {
        if (!active) return
        setStatus(statusResult)
        setVehicles(optionsResult.vehicles)
      })
      .catch((error) => {
        if (active) setChatError(error instanceof Error ? error.message : "AI 创作台加载失败")
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selectedBrand || !selectedCarModel) return
    let active = true
    getMaterials({
      material_scope: "vehicle",
      brand: selectedBrand,
      car_model: selectedCarModel,
      page: 1,
      page_size: 100,
      sort: "created_at",
      order: "desc",
    })
      .then((result) => {
        if (!active) return
        setMaterials(result.items)
        setSelectedMaterialIds([])
      })
      .catch((error) => {
        if (active) setChatError(error instanceof Error ? error.message : "参考素材加载失败")
      })
      .finally(() => {
        if (active) setMaterialsLoading(false)
      })
    return () => {
      active = false
    }
  }, [selectedBrand, selectedCarModel])

  const brands = useMemo(
    () => Array.from(new Set(vehicles.map((vehicle) => vehicle.brand))),
    [vehicles]
  )
  const carModels = useMemo(
    () => vehicles
      .filter((vehicle) => vehicle.brand === selectedBrand)
      .map((vehicle) => vehicle.car_model),
    [vehicles, selectedBrand]
  )
  const latestAssistant = useMemo(
    () => messages.slice().reverse().find((message) => message.role === "assistant" && message.content)?.content ?? "",
    [messages]
  )
  const selectedTask = TASKS.find((item) => item.value === task) ?? TASKS[1]
  const chatReady = Boolean(status?.chat_configured)
  const imageReady = Boolean(status?.image_configured)

  const toggleMaterial = (id: string) => {
    setSelectedMaterialIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }

  const handleSend = async (event: FormEvent) => {
    event.preventDefault()
    const content = input.trim()
    if (!content || !chatReady || !selectedCarModel || streaming) return

    const nextMessages: AiMessage[] = [...messages, { role: "user", content }]
    const assistantIndex = nextMessages.length
    setMessages([...nextMessages, { role: "assistant", content: "" }])
    setInput("")
    setChatError("")
    setSavedMaterial(null)
    setStreaming(true)
    let fullResponse = ""

    try {
      await streamAiChat(
        {
          task,
          brand: selectedBrand,
          car_model: selectedCarModel,
          material_ids: selectedMaterialIds,
          messages: nextMessages,
        },
        (delta) => {
          fullResponse += delta
          setMessages((current) => current.map((message, index) =>
            index === assistantIndex
              ? { role: "assistant", content: fullResponse }
              : message
          ))
        }
      )
      if (fullResponse && !noteTitle) setNoteTitle(deriveTitle(fullResponse, selectedCarModel))
    } catch (error) {
      setMessages((current) => current.filter((_, index) => index !== assistantIndex))
      setChatError(error instanceof Error ? error.message : "AI 对话请求失败")
    } finally {
      setStreaming(false)
    }
  }

  const handleGenerateImage = async () => {
    const prompt = imagePrompt.trim()
    if (!prompt || !imageReady || generatingImage) return
    setGeneratingImage(true)
    setChatError("")
    try {
      const attachment = await generateAiImage({
        prompt,
        brand: selectedBrand,
        car_model: selectedCarModel,
        material_ids: selectedMaterialIds,
      })
      setGeneratedImages((current) => [...current, attachment])
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "AI 图片生成失败")
    } finally {
      setGeneratingImage(false)
    }
  }

  const handleSave = async () => {
    if (!latestAssistant || saving) return
    const title = noteTitle.trim() || deriveTitle(latestAssistant, selectedCarModel)
    const formData = new FormData()
    formData.append("title", title)
    formData.append("material_scope", "general")
    formData.append("source_type", "ai_generated")
    formData.append("content_types", JSON.stringify(["笔记灵感"]))
    formData.append("summary", latestAssistant.slice(0, 500))
    formData.append("original_content", latestAssistant)
    formData.append("save_reason", `AI 创作台基于 ${selectedBrand} ${selectedCarModel} 素材生成`)
    formData.append("tags", JSON.stringify([
      "AI生成",
      selectedBrand,
      selectedCarModel,
      selectedTask.label,
    ].filter(Boolean)))
    formData.append("attachments", JSON.stringify(generatedImages))

    setSaving(true)
    setChatError("")
    try {
      const created = await createMaterial(formData)
      setSavedMaterial(created)
      setNoteTitle(title)
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "笔记灵感保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen">
      <Header showActions={false} />

      <main className="app-container py-5 lg:py-7">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" />
              写手创作工作台
            </div>
            <h1 className="text-2xl font-semibold">AI 创作</h1>
            <p className="mt-1 text-sm text-muted-foreground">{status?.text_model ? `当前文本模型：${status.text_model}` : "等待后台模型配置"}</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setMessages([])
              setGeneratedImages([])
              setNoteTitle("")
              setSavedMaterial(null)
              setChatError("")
            }}
            aria-label="清空本轮创作"
            title="清空本轮创作"
          >
            <Trash2 />
          </Button>
        </div>

        {status && !chatReady && (
          <div className="mb-5 flex items-start gap-2 border-y border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            后台尚未配置 OpenAI API Key。填写 `OPENAI_API_KEY` 并重启后端后即可使用。
          </div>
        )}

        {chatError && (
          <div className="mb-5 flex items-start gap-2 border-y border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {chatError}
          </div>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_300px]">
          <aside className="overflow-hidden rounded-lg border bg-card" aria-label="创作参考">
            <div className="border-b px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CarFront className="size-4 text-primary" />
                车型与参考素材
              </h2>
            </div>
            <div className="space-y-4 p-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">品牌</label>
                <Select
                  value={selectedBrand || undefined}
                  onValueChange={(brand) => {
                    setSelectedBrand(brand)
                    setSelectedCarModel("")
                    setMaterials([])
                    setSelectedMaterialIds([])
                  }}
                >
                  <SelectTrigger aria-label="选择品牌" className="bg-background shadow-none">
                    <SelectValue placeholder={brands.length ? "选择品牌" : "暂无品牌"} />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((brand) => <SelectItem key={brand} value={brand}>{brand}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">车型</label>
                <Select
                  value={selectedCarModel || undefined}
                  onValueChange={(carModel) => {
                    setMaterialsLoading(true)
                    setSelectedCarModel(carModel)
                  }}
                  disabled={!selectedBrand}
                >
                  <SelectTrigger aria-label="选择车型" className="bg-background shadow-none">
                    <SelectValue placeholder={selectedBrand ? "选择车型" : "请先选择品牌"} />
                  </SelectTrigger>
                  <SelectContent>
                    {carModels.map((carModel) => <SelectItem key={carModel} value={carModel}>{carModel}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">参考素材</span>
                  <span className="text-xs text-muted-foreground">已选 {selectedMaterialIds.length}</span>
                </div>
                <div className="max-h-[430px] space-y-1 overflow-y-auto pr-1">
                  {materialsLoading ? (
                    <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
                      <LoaderCircle className="size-4 animate-spin" />
                      正在加载
                    </div>
                  ) : materials.length > 0 ? materials.map((material) => (
                    <label key={material.id} className="flex cursor-pointer gap-2 rounded-md px-2 py-2.5 hover:bg-muted/60">
                      <Checkbox
                        checked={selectedMaterialIds.includes(material.id)}
                        onCheckedChange={() => toggleMaterial(material.id)}
                        aria-label={`选择 ${material.title}`}
                      />
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm font-medium leading-5">{material.title}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {material.content_types.slice(0, 2).map((type) => (
                            <Badge key={type} variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">{type}</Badge>
                          ))}
                        </span>
                      </span>
                    </label>
                  )) : (
                    <p className="py-6 text-xs leading-5 text-muted-foreground">
                      {selectedCarModel ? "这个车型还没有可选素材" : "选择车型后显示素材"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </aside>

          <section className="overflow-hidden rounded-lg border bg-card" aria-label="AI 对话">
            <div className="border-b p-3">
              <div className="grid grid-cols-2 gap-1 sm:flex" role="tablist" aria-label="创作任务">
                {TASKS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={task === value}
                    onClick={() => setTask(value)}
                    className={cn(
                      "flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors",
                      task === value && "bg-accent text-accent-foreground"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex h-[min(62vh,650px)] min-h-[480px] flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
                {messages.length === 0 ? (
                  <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
                    <span className="mb-4 grid size-11 place-items-center rounded-full bg-accent text-primary">
                      <Sparkles className="size-5" />
                    </span>
                    <h2 className="text-sm font-semibold">{selectedTask.label}</h2>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">选择车型和参考素材后，输入本轮创作要求</p>
                  </div>
                ) : messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div className={cn(
                      "max-w-[88%] whitespace-pre-wrap break-words rounded-lg px-4 py-3 text-sm leading-7",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "border bg-background text-foreground"
                    )}>
                      {message.content || (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <LoaderCircle className="size-4 animate-spin" />
                          正在生成
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSend} className="border-t bg-card p-3 sm:p-4">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder={selectedTask.placeholder}
                    rows={3}
                    className="min-h-[84px] flex-1 resize-none bg-background"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault()
                        event.currentTarget.form?.requestSubmit()
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="size-10 shrink-0"
                    disabled={!chatReady || !selectedCarModel || !input.trim() || streaming}
                    aria-label="发送创作要求"
                    title="发送"
                  >
                    {streaming ? <LoaderCircle className="animate-spin" /> : <Send />}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {selectedCarModel ? `${selectedBrand} · ${selectedCarModel} · ${selectedMaterialIds.length} 条参考素材` : "请先选择车型"}
                </p>
              </form>
            </div>
          </section>

          <aside className="space-y-5 lg:col-span-2 xl:col-span-1" aria-label="生成与保存">
            <section className="overflow-hidden rounded-lg border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <ImagePlus className="size-4 text-primary" />
                  生成配图
                </h2>
              </div>
              <div className="space-y-3 p-4">
                <Textarea
                  value={imagePrompt}
                  onChange={(event) => setImagePrompt(event.target.value)}
                  placeholder="描述画面主体、场景、构图和风格"
                  rows={4}
                />
                {latestAssistant && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground"
                    onClick={() => setImagePrompt(`为以下笔记生成一张小红书配图：\n${latestAssistant.slice(0, 1200)}`)}
                  >
                    <Sparkles />
                    使用当前笔记生成提示词
                  </Button>
                )}
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleGenerateImage}
                  disabled={!imageReady || !imagePrompt.trim() || generatingImage}
                >
                  {generatingImage ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
                  {generatingImage ? "生成中" : "生成图片"}
                </Button>
                {!imageReady && <p className="text-xs leading-5 text-muted-foreground">后台配置图片模型后可用</p>}

                {generatedImages.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 border-t pt-3">
                    {generatedImages.map((attachment) => (
                      <div key={attachment.path} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
                        <Image src={attachment.path} alt={attachment.name} fill className="object-cover" unoptimized />
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="absolute right-1.5 top-1.5 size-7"
                          onClick={() => setGeneratedImages((current) => current.filter((item) => item.path !== attachment.path))}
                          aria-label="移除生成图片"
                          title="移除图片"
                        >
                          <X />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Save className="size-4 text-primary" />
                  保存笔记灵感
                </h2>
              </div>
              <div className="space-y-3 p-4">
                <Input
                  value={noteTitle}
                  onChange={(event) => setNoteTitle(event.target.value)}
                  placeholder="笔记灵感标题"
                  disabled={!latestAssistant}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  将当前 AI 正文和 {generatedImages.length} 张配图保存到灵感中心
                </p>
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleSave}
                  disabled={!latestAssistant || saving}
                >
                  {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
                  {saving ? "保存中" : "保存为笔记灵感"}
                </Button>
                {savedMaterial && (
                  <div className="flex items-start gap-2 border-t pt-3 text-sm text-insight-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                    <span>
                      已保存“{savedMaterial.title}”
                      <Link href="/inspiration" className="ml-1 font-medium text-primary hover:underline">查看</Link>
                    </span>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
