"use client"

import { FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  FileText,
  ImagePlus,
  History,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Type,
  Upload,
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
  getMaterial,
  getMaterials,
  getOptions,
  streamAiChat,
  submitAiFeedback,
  updateMaterial,
  type AiMessage,
  type AiStatus,
  type AiTask,
  type Attachment,
  type Material,
  type MaterialScope,
  type VehicleOption,
} from "@/lib/api"
import { cn } from "@/lib/utils"

const TASKS = [
  { value: "concept" as const, label: "创作方案", icon: Sparkles, placeholder: "说说这篇新笔记的核心想法、想表达的情绪或场景。" },
  { value: "title" as const, label: "生成标题", icon: Type, placeholder: "围绕所选素材生成 10 个标题，突出真实痛点和使用场景。" },
  { value: "note" as const, label: "小红书正文", icon: FileText, placeholder: "根据所选素材写一篇完整的小红书笔记。" },
  { value: "video" as const, label: "视频脚本", icon: Clapperboard, placeholder: "生成一条 60 秒短视频脚本，包含前三秒钩子和分镜。" },
  { value: "rewrite" as const, label: "内容改写", icon: RefreshCw, placeholder: "请根据所选素材重新组织表达，避免照搬原文。" },
]

const MATERIAL_FILTERS: { value: "all" | MaterialScope; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "vehicle", label: "车型" },
  { value: "general", label: "灵感" },
]

function deriveTitle(content: string, carModel: string) {
  const firstLine = content
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").replace(/^[-*\d.、\s]+/, "").trim())
    .find(Boolean)
  return (firstLine || (carModel ? `${carModel} 笔记灵感` : "新笔记灵感")).slice(0, 60)
}

export default function AiStudioPage() {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [scopeFilter, setScopeFilter] = useState<"all" | MaterialScope>("all")
  const [materialSearch, setMaterialSearch] = useState("")
  const [selectedBrand, setSelectedBrand] = useState("")
  const [selectedCarModel, setSelectedCarModel] = useState("")
  const [materials, setMaterials] = useState<Material[]>([])
  const [materialsLoading, setMaterialsLoading] = useState(true)
  const [selectedMaterials, setSelectedMaterials] = useState<Material[]>([])
  const [task, setTask] = useState<AiTask>("concept")
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [chatError, setChatError] = useState("")
  const [imagePrompt, setImagePrompt] = useState("")
  const [referenceImage, setReferenceImage] = useState<File | null>(null)
  const [referencePreview, setReferencePreview] = useState("")
  const [referenceAttachment, setReferenceAttachment] = useState<Attachment | null>(null)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<Attachment[]>([])
  const [noteTitle, setNoteTitle] = useState("")
  const [saving, setSaving] = useState(false)
  const [savedMaterial, setSavedMaterial] = useState<Material | null>(null)
  const [resumedMaterialId, setResumedMaterialId] = useState<string | null>(null)
  const [resumedTitle, setResumedTitle] = useState("")
  const [feedbackChoice, setFeedbackChoice] = useState<"helpful" | "unhelpful" | null>(null)
  const [feedbackComment, setFeedbackComment] = useState("")
  const [feedbackSaving, setFeedbackSaving] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const deferredSearch = useDeferredValue(materialSearch)

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
    const materialId = new URLSearchParams(window.location.search).get("resume")
    if (!materialId) return

    let active = true
    getMaterial(materialId)
      .then(async (material) => {
        const conversation = material.ai_conversation
        if (!conversation) throw new Error("这条笔记灵感没有可恢复的 AI 会话")

        const selectedResults = await Promise.allSettled(
          conversation.selected_material_ids.map((id) => getMaterial(id))
        )
        const restoredMaterials = selectedResults.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : []
        )

        let restoredReference: File | null = null
        const referenceAttachment = conversation.reference_image_attachment ?? null
        if (referenceAttachment) {
          try {
            const response = await fetch(referenceAttachment.path)
            if (response.ok) {
              const blob = await response.blob()
              restoredReference = new File(
                [blob],
                referenceAttachment.name || "参考图.png",
                { type: referenceAttachment.type || blob.type }
              )
            }
          } catch {
            restoredReference = null
          }
        }

        if (!active) return
        setResumedMaterialId(material.id)
        setResumedTitle(material.title)
        setTask(conversation.task)
        setMessages(conversation.messages)
        setSelectedMaterials(restoredMaterials)
        setScopeFilter(conversation.scope_filter || "all")
        setMaterialSearch(conversation.material_search || "")
        setSelectedBrand(conversation.brand || "")
        setSelectedCarModel(conversation.car_model || "")
        setImagePrompt(conversation.image_prompt || "")
        setGeneratedImages(conversation.generated_images || [])
        setReferenceAttachment(referenceAttachment)
        setReferenceImage(restoredReference)
        setReferencePreview(restoredReference ? URL.createObjectURL(restoredReference) : "")
        setNoteTitle(material.title)
        setSavedMaterial(null)
      })
      .catch((error) => {
        if (active) setChatError(error instanceof Error ? error.message : "AI 会话恢复失败")
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    getMaterials({
      q: deferredSearch.trim() || undefined,
      material_scope: scopeFilter === "all" ? undefined : scopeFilter,
      brand: selectedBrand || undefined,
      car_model: selectedCarModel || undefined,
      page: 1,
      page_size: 100,
      sort: "created_at",
      order: "desc",
    })
      .then((result) => {
        if (!active) return
        setMaterials(result.items)
      })
      .catch((error) => {
        if (!active) return
        setMaterials([])
        setChatError(error instanceof Error ? error.message : "参考素材加载失败")
      })
      .finally(() => {
        if (active) setMaterialsLoading(false)
      })
    return () => {
      active = false
    }
  }, [deferredSearch, scopeFilter, selectedBrand, selectedCarModel])

  useEffect(() => () => {
    if (referencePreview) URL.revokeObjectURL(referencePreview)
  }, [referencePreview])

  const brands = useMemo(
    () => Array.from(new Set(vehicles.map((vehicle) => vehicle.brand))),
    [vehicles]
  )
  const carModels = useMemo(
    () => Array.from(new Set(vehicles
      .filter((vehicle) => !selectedBrand || vehicle.brand === selectedBrand)
      .map((vehicle) => vehicle.car_model))),
    [vehicles, selectedBrand]
  )
  const selectedMaterialIds = useMemo(
    () => selectedMaterials.map((material) => material.id),
    [selectedMaterials]
  )
  const latestAssistant = useMemo(
    () => messages.slice().reverse().find((message) => message.role === "assistant" && message.content)?.content ?? "",
    [messages]
  )
  const firstUserIdea = useMemo(
    () => messages.find((message) => message.role === "user")?.content ?? input.trim(),
    [messages, input]
  )
  const selectedTask = TASKS.find((item) => item.value === task) ?? TASKS[0]
  const chatReady = Boolean(status?.chat_configured)
  const imageReady = Boolean(status?.image_configured)

  const toggleMaterial = (material: Material) => {
    setSelectedMaterials((current) =>
      current.some((item) => item.id === material.id)
        ? current.filter((item) => item.id !== material.id)
        : [...current, material]
    )
  }

  const selectReferenceImage = (file: File | null) => {
    if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setChatError("参考图仅支持 JPG、PNG 或 WebP")
      return
    }
    if (file && file.size > 20 * 1024 * 1024) {
      setChatError("参考图不能超过 20MB")
      return
    }
    setChatError("")
    setReferenceAttachment(null)
    setReferenceImage(file)
    setReferencePreview(file ? URL.createObjectURL(file) : "")
  }

  const handleSend = async (event: FormEvent) => {
    event.preventDefault()
    const content = input.trim()
    if (!content || !chatReady || streaming) return

    const nextMessages: AiMessage[] = [...messages, { role: "user", content }]
    const assistantIndex = nextMessages.length
    setMessages([...nextMessages, { role: "assistant", content: "" }])
    setInput("")
    setChatError("")
    setSavedMaterial(null)
    setFeedbackChoice(null)
    setFeedbackComment("")
    setFeedbackSent(false)
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
    if (!prompt || !referenceImage || !imageReady || generatingImage) return
    setGeneratingImage(true)
    setChatError("")
    try {
      const attachment = await generateAiImage({
        prompt,
        reference_image: referenceImage,
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

  const handleFeedback = async () => {
    if (!feedbackChoice || !latestAssistant || feedbackSaving) return
    setFeedbackSaving(true)
    setChatError("")
    try {
      await submitAiFeedback({
        task,
        rating: feedbackChoice,
        comment: feedbackComment.trim() || undefined,
        idea: firstUserIdea || undefined,
        assistant_content: latestAssistant,
        material_ids: selectedMaterialIds,
        brand: selectedBrand || undefined,
        car_model: selectedCarModel || undefined,
      })
      setFeedbackSent(true)
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "AI 反馈提交失败")
    } finally {
      setFeedbackSaving(false)
    }
  }

  const handleSave = async () => {
    if (!latestAssistant || saving) return
    const title = noteTitle.trim() || deriveTitle(latestAssistant, selectedCarModel)
    const conversation = {
      version: 1 as const,
      task,
      messages,
      selected_material_ids: selectedMaterialIds,
      scope_filter: scopeFilter,
      material_search: materialSearch,
      brand: selectedBrand || null,
      car_model: selectedCarModel || null,
      image_prompt: imagePrompt,
      generated_images: generatedImages,
      reference_image_attachment: referenceAttachment,
      prompt_version: status?.prompt_version ?? null,
      saved_at: new Date().toISOString(),
    }
    const retainedAttachments = [
      ...generatedImages,
      ...(referenceAttachment ? [referenceAttachment] : []),
    ]
    const formData = new FormData()
    formData.append("title", title)
    formData.append("material_scope", "general")
    formData.append("source_type", "ai_generated")
    formData.append("content_types", JSON.stringify(["笔记灵感"]))
    formData.append("summary", latestAssistant.slice(0, 500))
    formData.append("original_content", latestAssistant)
    formData.append("save_reason", `AI 创作台基于 ${selectedMaterialIds.length} 条参考素材生成`)
    formData.append("tags", JSON.stringify([
      "AI生成",
      selectedBrand,
      selectedCarModel,
      selectedTask.label,
    ].filter(Boolean)))
    formData.append("attachments", JSON.stringify(retainedAttachments))
    formData.append("ai_conversation", JSON.stringify(conversation))
    if (referenceImage && !referenceAttachment) {
      formData.append("files", referenceImage, referenceImage.name)
    }

    setSaving(true)
    setChatError("")
    try {
      const saved = resumedMaterialId
        ? await updateMaterial(resumedMaterialId, formData)
        : await createMaterial(formData)
      setSavedMaterial(saved)
      setResumedMaterialId(saved.id)
      setResumedTitle(saved.title)
      setReferenceAttachment(saved.ai_conversation?.reference_image_attachment ?? null)
      setNoteTitle(title)
      window.history.replaceState({}, "", `/ai?resume=${saved.id}`)
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
              setSelectedMaterials([])
              setGeneratedImages([])
              selectReferenceImage(null)
              setImagePrompt("")
              setNoteTitle("")
              setSavedMaterial(null)
              setFeedbackChoice(null)
              setFeedbackComment("")
              setFeedbackSent(false)
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
                <Search className="size-4 text-primary" />
                素材与筛选
              </h2>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1" aria-label="素材范围">
                {MATERIAL_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={scopeFilter === filter.value}
                    onClick={() => {
                      setMaterialsLoading(true)
                      setScopeFilter(filter.value)
                      if (filter.value === "general") {
                        setSelectedBrand("")
                        setSelectedCarModel("")
                      }
                    }}
                    className={cn(
                      "h-8 rounded-sm text-xs font-medium text-muted-foreground",
                      scopeFilter === filter.value && "bg-background text-foreground shadow-sm"
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={materialSearch}
                  onChange={(event) => {
                    setMaterialsLoading(true)
                    setMaterialSearch(event.target.value)
                  }}
                  placeholder="搜索素材"
                  className="bg-background pl-8"
                />
              </div>

              {scopeFilter !== "general" && (
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={selectedBrand || "__all__"}
                    onValueChange={(value) => {
                      setMaterialsLoading(true)
                      setSelectedBrand(value === "__all__" ? "" : value)
                      setSelectedCarModel("")
                    }}
                  >
                    <SelectTrigger aria-label="筛选品牌" className="bg-background shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">全部品牌</SelectItem>
                      {brands.map((brand) => <SelectItem key={brand} value={brand}>{brand}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select
                    value={selectedCarModel || "__all__"}
                    onValueChange={(value) => {
                      setMaterialsLoading(true)
                      setSelectedCarModel(value === "__all__" ? "" : value)
                    }}
                  >
                    <SelectTrigger aria-label="筛选车型" className="bg-background shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">全部车型</SelectItem>
                      {carModels.map((carModel) => <SelectItem key={carModel} value={carModel}>{carModel}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedMaterials.length > 0 && (
                <div className="space-y-1.5 border-t pt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>本轮已选</span>
                    <span>{selectedMaterials.length} 条</span>
                  </div>
                  <div className="max-h-24 space-y-1 overflow-y-auto">
                    {selectedMaterials.map((material) => (
                      <div key={material.id} className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
                        <span className="min-w-0 flex-1 truncate">{material.title}</span>
                        <button
                          type="button"
                          onClick={() => toggleMaterial(material)}
                          className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
                          aria-label={`移除 ${material.title}`}
                          title="移除"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">参考素材</span>
                  <span className="text-xs text-muted-foreground">已选 {selectedMaterialIds.length}</span>
                </div>
                <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
                  {materialsLoading ? (
                    <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
                      <LoaderCircle className="size-4 animate-spin" />
                      正在加载
                    </div>
                  ) : materials.length > 0 ? materials.map((material) => (
                    <label key={material.id} className="flex cursor-pointer gap-2 rounded-md px-2 py-2.5 hover:bg-muted/60">
                      <Checkbox
                        checked={selectedMaterialIds.includes(material.id)}
                        onCheckedChange={() => toggleMaterial(material)}
                        aria-label={`选择 ${material.title}`}
                      />
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm font-medium leading-5">{material.title}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                            {material.material_scope === "vehicle" ? "车型" : "灵感"}
                          </Badge>
                          {material.content_types.slice(0, 1).map((type) => (
                            <Badge key={type} variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">{type}</Badge>
                          ))}
                        </span>
                      </span>
                    </label>
                  )) : (
                    <p className="py-6 text-xs leading-5 text-muted-foreground">没有匹配的素材</p>
                  )}
                </div>
              </div>
            </div>
          </aside>

          <section className="overflow-hidden rounded-lg border bg-card" aria-label="AI 对话">
            <div className="border-b p-3">
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:flex" role="tablist" aria-label="创作任务">
                {TASKS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={task === value}
                    onClick={() => setTask(value)}
                    className={cn(
                      "flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors last:col-span-2 sm:last:col-span-1",
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
                    <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">描述你想写的内容、场景或表达方向</p>
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

                {latestAssistant && !streaming && (
                  <div className="max-w-[88%] space-y-2 border-t pt-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="mr-1">这次结果</span>
                      <Button
                        type="button"
                        variant={feedbackChoice === "helpful" ? "secondary" : "ghost"}
                        size="icon"
                        className="size-7"
                        onClick={() => {
                          setFeedbackChoice("helpful")
                          setFeedbackSent(false)
                        }}
                        aria-label="有帮助"
                        title="有帮助"
                      >
                        <ThumbsUp />
                      </Button>
                      <Button
                        type="button"
                        variant={feedbackChoice === "unhelpful" ? "secondary" : "ghost"}
                        size="icon"
                        className="size-7"
                        onClick={() => {
                          setFeedbackChoice("unhelpful")
                          setFeedbackSent(false)
                        }}
                        aria-label="需要改进"
                        title="需要改进"
                      >
                        <ThumbsDown />
                      </Button>
                      {feedbackSent && <span className="ml-1">已记录</span>}
                    </div>
                    {feedbackChoice && !feedbackSent && (
                      <div className="flex gap-2">
                        <Input
                          value={feedbackComment}
                          onChange={(event) => setFeedbackComment(event.target.value)}
                          placeholder="补充意见（可选）"
                          className="h-8 text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-8"
                          onClick={handleFeedback}
                          disabled={feedbackSaving}
                        >
                          {feedbackSaving ? <LoaderCircle className="animate-spin" /> : "提交"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
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
                    disabled={!chatReady || !input.trim() || streaming}
                    aria-label="发送创作要求"
                    title="发送"
                  >
                    {streaming ? <LoaderCircle className="animate-spin" /> : <Send />}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {selectedBrand && selectedCarModel ? `${selectedBrand} · ${selectedCarModel} · ` : ""}
                  {selectedMaterialIds.length} 条参考素材
                </p>
              </form>
            </div>
          </section>

          <aside className="space-y-5 lg:col-span-2 xl:col-span-1" aria-label="生成与保存">
            <section className="overflow-hidden rounded-lg border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <ImagePlus className="size-4 text-primary" />
                  参考图创作
                </h2>
              </div>
              <div className="space-y-3 p-4">
                {referencePreview ? (
                  <div className="relative aspect-[4/3] overflow-hidden rounded-md border bg-muted">
                    <Image src={referencePreview} alt="参考图预览" fill className="object-contain" unoptimized />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute right-2 top-2 size-7"
                      onClick={() => selectReferenceImage(null)}
                      aria-label="移除参考图"
                      title="移除参考图"
                    >
                      <X />
                    </Button>
                  </div>
                ) : (
                  <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/30 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                    <Upload className="size-5" />
                    选择参考图
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(event) => selectReferenceImage(event.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
                <Textarea
                  value={imagePrompt}
                  onChange={(event) => setImagePrompt(event.target.value)}
                  placeholder="描述要保留的内容和希望调整的方向"
                  rows={4}
                />
                {latestAssistant && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground"
                    onClick={() => setImagePrompt(`参考这篇笔记调整图片：\n${latestAssistant.slice(0, 1200)}`)}
                  >
                    <Sparkles />
                    使用当前笔记填写要求
                  </Button>
                )}
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleGenerateImage}
                  disabled={!imageReady || !referenceImage || !imagePrompt.trim() || generatingImage}
                >
                  {generatingImage ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
                  {generatingImage ? "生成中" : "根据参考图生成"}
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
