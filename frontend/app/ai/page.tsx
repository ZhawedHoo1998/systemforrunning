"use client"

import { FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  FileText,
  History,
  LoaderCircle,
  Maximize2,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Type,
  X,
} from "lucide-react"
import { AiImageWorkspace } from "@/components/AiImageWorkspace"
import { AiMarkdown } from "@/components/AiMarkdown"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  createCreation,
  generateAiImage,
  getAiStatus,
  getCreation,
  getMaterial,
  getMaterials,
  getOptions,
  streamAiChat,
  submitAiFeedback,
  uploadAiReferenceImages,
  updateCreation,
  type Creation,
  type AiMessage,
  type AiImageMessage,
  type AiImageThread,
  type AiStatus,
  type AiTask,
  type Attachment,
  type Material,
  type MaterialScope,
  type VehicleOption,
} from "@/lib/api"
import { isImageAttachment } from "@/lib/materials"
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

const MAX_IMAGE_REFERENCES = 8

function createImageThread(index: number, id = `image-thread-${Date.now()}-${index}`): AiImageThread {
  const now = new Date().toISOString()
  return {
    id,
    title: `图片对话 ${index}`,
    image_prompt: "",
    selected_references: [],
    generated_images: [],
    messages: [],
    created_at: now,
    updated_at: now,
  }
}

function deriveTitle(content: string, carModel: string) {
  const firstLine = content
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").replace(/^[-*\d.、\s]+/, "").trim())
    .find(Boolean)
  return (firstLine || (carModel ? `${carModel} 笔记灵感` : "新笔记灵感")).slice(0, 60)
}

async function attachmentToFile(attachment: Attachment) {
  const response = await fetch(attachment.path)
  if (!response.ok) throw new Error("参考图加载失败")
  const blob = await response.blob()
  return new File(
    [blob],
    attachment.name || "参考图.png",
    { type: attachment.type || blob.type || "image/png" }
  )
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
  const [imageThreads, setImageThreads] = useState<AiImageThread[]>(() => [
    createImageThread(1, "image-thread-1"),
  ])
  const [activeImageThreadId, setActiveImageThreadId] = useState("image-thread-1")
  const [uploadedReferenceImages, setUploadedReferenceImages] = useState<Attachment[]>([])
  const [generatingImageThreadId, setGeneratingImageThreadId] = useState<string | null>(null)
  const [uploadingReferences, setUploadingReferences] = useState(false)
  const [noteTitle, setNoteTitle] = useState("")
  const [saving, setSaving] = useState(false)
  const [savedCreation, setSavedCreation] = useState<Creation | null>(null)
  const [resumedCreationId, setResumedCreationId] = useState<string | null>(null)
  const [resumedTitle, setResumedTitle] = useState("")
  const [feedbackChoice, setFeedbackChoice] = useState<"helpful" | "unhelpful" | null>(null)
  const [feedbackComment, setFeedbackComment] = useState("")
  const [feedbackSaving, setFeedbackSaving] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [textWorkspaceOpen, setTextWorkspaceOpen] = useState(false)
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
    const creationId = new URLSearchParams(window.location.search).get("resume")
    if (!creationId) return

    let active = true
    getCreation(creationId)
      .then(async (creation) => {
        const conversation = creation.ai_conversation

        const selectedResults = await Promise.allSettled(
          conversation.selected_material_ids.map((id) => getMaterial(id))
        )
        const restoredMaterials = selectedResults.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : []
        )

        const legacyReference = conversation.active_reference_attachment
          ?? conversation.reference_image_attachment
          ?? null
        const restoredThreads = conversation.image_threads?.length
          ? conversation.image_threads.map((thread, index) => ({
              ...thread,
              id: thread.id || `restored-image-thread-${index + 1}`,
              title: thread.title || `图片对话 ${index + 1}`,
              image_prompt: thread.image_prompt || "",
              selected_references: thread.selected_references || [],
              generated_images: thread.generated_images || [],
              messages: thread.messages || [],
              created_at: thread.created_at || creation.created_at,
              updated_at: thread.updated_at || creation.updated_at,
            }))
          : [{
              ...createImageThread(1, "legacy-image-thread"),
              image_prompt: conversation.image_prompt || "",
              selected_references: legacyReference ? [legacyReference] : [],
              generated_images: conversation.generated_images || [],
              messages: conversation.image_messages || (conversation.generated_images || []).map((image, index) => ({
                id: `restored-image-${index}`,
                role: "assistant" as const,
                content: `历史生成结果 ${index + 1}`,
                image,
              })),
              created_at: creation.created_at,
              updated_at: creation.updated_at,
            }]
        const restoredActiveThreadId = restoredThreads.some(
          (thread) => thread.id === conversation.active_image_thread_id
        )
          ? conversation.active_image_thread_id!
          : restoredThreads[0].id

        if (!active) return
        setResumedCreationId(creation.id)
        setResumedTitle(creation.title)
        setTask(conversation.task)
        setMessages(conversation.messages)
        setSelectedMaterials(restoredMaterials)
        setScopeFilter(conversation.scope_filter || "all")
        setMaterialSearch(conversation.material_search || "")
        setSelectedBrand(conversation.brand || "")
        setSelectedCarModel(conversation.car_model || "")
        setImageThreads(restoredThreads)
        setActiveImageThreadId(restoredActiveThreadId)
        setUploadedReferenceImages(conversation.uploaded_reference_images || [])
        setNoteTitle(creation.title)
        setSavedCreation(null)
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
  const selectedMaterialImages = useMemo(() => {
    const seen = new Set<string>()
    return selectedMaterials.flatMap((material) => material.attachments
      .filter(isImageAttachment)
      .filter((attachment) => {
        if (seen.has(attachment.path)) return false
        seen.add(attachment.path)
        return true
      })
      .map((attachment) => ({ attachment, label: material.title })))
  }, [selectedMaterials])
  const activeImageThread = useMemo(
    () => imageThreads.find((thread) => thread.id === activeImageThreadId) ?? imageThreads[0],
    [activeImageThreadId, imageThreads]
  )
  const imageMessages = activeImageThread?.messages ?? []
  const imagePrompt = activeImageThread?.image_prompt ?? ""
  const selectedImageReferences = activeImageThread?.selected_references ?? []
  const activeGeneratedImages = activeImageThread?.generated_images ?? []
  const generatedImages = useMemo(() => Array.from(new Map(
    imageThreads
      .flatMap((thread) => thread.generated_images)
      .map((attachment) => [attachment.path, attachment])
  ).values()), [imageThreads])
  const generatedImageSources = useMemo(() => imageThreads.flatMap((thread) =>
    thread.generated_images.map((attachment) => ({ attachment, label: thread.title }))
  ), [imageThreads])
  const uploadedReferenceSources = useMemo(() => uploadedReferenceImages.map((attachment) => ({
    attachment,
    label: "本次上传",
  })), [uploadedReferenceImages])
  const historicalReferenceImages = useMemo(() => {
    const visiblePaths = new Set([
      ...selectedMaterialImages.map(({ attachment }) => attachment.path),
      ...uploadedReferenceImages.map((attachment) => attachment.path),
      ...generatedImages.map((attachment) => attachment.path),
    ])
    const historical = imageThreads.flatMap((thread) => [
      ...thread.selected_references,
      ...thread.messages.flatMap((message) => message.references ?? (message.reference ? [message.reference] : [])),
    ])
    return Array.from(new Map(historical
      .filter((attachment) => !visiblePaths.has(attachment.path))
      .map((attachment) => [attachment.path, { attachment, label: "历史参考" }])
    ).values())
  }, [generatedImages, imageThreads, selectedMaterialImages, uploadedReferenceImages])
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
  const hasImageResults = generatedImages.length > 0
  const canSaveIdea = Boolean(latestAssistant || hasImageResults)

  const toggleMaterial = (material: Material) => {
    setSelectedMaterials((current) =>
      current.some((item) => item.id === material.id)
        ? current.filter((item) => item.id !== material.id)
        : [...current, material]
    )
  }

  const updateImageThread = (
    threadId: string,
    updater: (thread: AiImageThread) => AiImageThread
  ) => {
    setImageThreads((current) => current.map((thread) =>
      thread.id === threadId ? updater(thread) : thread
    ))
  }

  const handleImagePromptChange = (value: string) => {
    if (!activeImageThread) return
    updateImageThread(activeImageThread.id, (thread) => ({
      ...thread,
      image_prompt: value,
      updated_at: new Date().toISOString(),
    }))
  }

  const toggleReferenceAttachment = (attachment: Attachment) => {
    if (!activeImageThread) return
    const isSelected = activeImageThread.selected_references.some(
      (reference) => reference.path === attachment.path
    )
    if (!isSelected && activeImageThread.selected_references.length >= MAX_IMAGE_REFERENCES) {
      setChatError(`每轮最多选择 ${MAX_IMAGE_REFERENCES} 张参考图`)
      return
    }
    setChatError("")
    updateImageThread(activeImageThread.id, (thread) => ({
      ...thread,
      selected_references: isSelected
        ? thread.selected_references.filter((reference) => reference.path !== attachment.path)
        : [...thread.selected_references, attachment],
      updated_at: new Date().toISOString(),
    }))
  }

  const handleUploadReferenceImages = async (files: File[]) => {
    if (!activeImageThread || uploadingReferences) return
    if (files.length > MAX_IMAGE_REFERENCES) {
      setChatError(`每次最多上传 ${MAX_IMAGE_REFERENCES} 张参考图`)
      return
    }
    const invalidType = files.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    if (invalidType) {
      setChatError("参考图仅支持 JPG、PNG 或 WebP")
      return
    }
    const oversized = files.find((file) => file.size > 20 * 1024 * 1024)
    if (oversized) {
      setChatError("单张参考图不能超过 20MB")
      return
    }

    const targetThreadId = activeImageThread.id
    setUploadingReferences(true)
    setChatError("")
    try {
      const result = await uploadAiReferenceImages(files)
      setUploadedReferenceImages((current) => Array.from(new Map(
        [...current, ...result.attachments].map((attachment) => [attachment.path, attachment])
      ).values()))
      updateImageThread(targetThreadId, (thread) => {
        const existingPaths = new Set(thread.selected_references.map((attachment) => attachment.path))
        const availableSlots = MAX_IMAGE_REFERENCES - thread.selected_references.length
        const additions = result.attachments
          .filter((attachment) => !existingPaths.has(attachment.path))
          .slice(0, availableSlots)
        return {
          ...thread,
          selected_references: [...thread.selected_references, ...additions],
          updated_at: new Date().toISOString(),
        }
      })
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "参考图上传失败")
    } finally {
      setUploadingReferences(false)
    }
  }

  const handleCreateImageThread = () => {
    const nextThread = createImageThread(imageThreads.length + 1)
    setImageThreads((current) => [...current, nextThread])
    setActiveImageThreadId(nextThread.id)
    setChatError("")
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
    setSavedCreation(null)
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
    if (!activeImageThread || generatingImageThreadId) return
    const prompt = activeImageThread.image_prompt.trim()
    const references = activeImageThread.selected_references
    if (!prompt || references.length === 0 || !imageReady) return
    const targetThreadId = activeImageThread.id
    const userMessage: AiImageMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      references,
      reference: references[0],
    }
    updateImageThread(targetThreadId, (thread) => ({
      ...thread,
      messages: [...thread.messages, userMessage],
      updated_at: new Date().toISOString(),
    }))
    setGeneratingImageThreadId(targetThreadId)
    setChatError("")
    setSavedCreation(null)
    try {
      const referenceFiles = await Promise.all(references.map((attachment) => attachmentToFile(attachment)))
      const result = await generateAiImage({
        prompt,
        reference_images: referenceFiles,
        reference_attachments: references,
        history: activeImageThread.messages
          .filter((message) => message.role === "user")
          .map((message) => message.content),
        brand: selectedBrand,
        car_model: selectedCarModel,
        material_ids: selectedMaterialIds,
      })
      const attachment = result.attachment
      const persistedReferences = result.reference_attachments?.length
        ? result.reference_attachments
        : references
      updateImageThread(targetThreadId, (thread) => ({
        ...thread,
        image_prompt: "",
        generated_images: [...thread.generated_images, attachment],
        messages: [
          ...thread.messages.map((message) => message.id === userMessage.id
            ? { ...message, references: persistedReferences, reference: persistedReferences[0] }
            : message),
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: `已生成第 ${thread.generated_images.length + 1} 版`,
            image: attachment,
          },
        ],
        updated_at: new Date().toISOString(),
      }))
    } catch (error) {
      updateImageThread(targetThreadId, (thread) => ({
        ...thread,
        messages: thread.messages.filter((message) => message.id !== userMessage.id),
        updated_at: new Date().toISOString(),
      }))
      setChatError(error instanceof Error ? error.message : "AI 图片生成失败")
    } finally {
      setGeneratingImageThreadId(null)
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
    if (!canSaveIdea || saving) return
    const imageRequirements = imageThreads
      .flatMap((thread) => thread.messages)
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n")
    const savedContent = latestAssistant || imageRequirements || "图片创作灵感"
    const title = noteTitle.trim() || deriveTitle(savedContent, selectedCarModel)
    const activeReference = activeImageThread?.selected_references[0] ?? null
    const conversation = {
      version: 2 as const,
      task,
      messages,
      selected_material_ids: selectedMaterialIds,
      scope_filter: scopeFilter,
      material_search: materialSearch,
      brand: selectedBrand || null,
      car_model: selectedCarModel || null,
      image_prompt: imagePrompt,
      generated_images: generatedImages,
      image_messages: imageMessages,
      reference_image_attachment: activeReference,
      active_reference_attachment: activeReference,
      image_threads: imageThreads,
      active_image_thread_id: activeImageThreadId,
      uploaded_reference_images: uploadedReferenceImages,
      prompt_version: status?.prompt_version ?? null,
      saved_at: new Date().toISOString(),
    }
    const conversationAttachments = imageThreads.flatMap((thread) => [
      ...thread.selected_references,
      ...thread.messages.flatMap((message) => [
        ...(message.references ?? (message.reference ? [message.reference] : [])),
        ...(message.image ? [message.image] : []),
      ]),
    ])
    const retainedAttachments = Array.from(new Map([
      ...generatedImages,
      ...uploadedReferenceImages,
      ...conversationAttachments,
    ].map((attachment) => [attachment.path, attachment])).values())
    const formData = new FormData()
    formData.append("title", title)
    formData.append("summary", savedContent.slice(0, 500))
    formData.append("original_content", latestAssistant || imageRequirements)
    formData.append("tags", JSON.stringify([
      "AI生成",
      selectedBrand,
      selectedCarModel,
      selectedTask.label,
    ].filter(Boolean)))
    formData.append("attachments", JSON.stringify(retainedAttachments))
    formData.append("ai_conversation", JSON.stringify(conversation))

    setSaving(true)
    setChatError("")
    try {
      const saved = resumedCreationId
        ? await updateCreation(resumedCreationId, formData)
        : await createCreation(formData)
      setSavedCreation(saved)
      setResumedCreationId(saved.id)
      setResumedTitle(saved.title)
      setNoteTitle(title)
      window.history.replaceState({}, "", `/ai?resume=${saved.id}`)
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "笔记灵感保存失败")
    } finally {
      setSaving(false)
    }
  }

  const renderConversation = (expanded = false) => (
    <div className="flex min-h-0 flex-1 flex-col">
      {expanded && (
        <div className="flex min-h-14 items-center gap-2 border-b px-5 py-3 pr-12 sm:px-6">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">专注 AI 对话</h2>
            <p className="truncate text-xs text-muted-foreground">
              {selectedMaterialIds.length} 条参考素材{selectedCarModel ? ` · ${selectedCarModel}` : ""}
            </p>
          </div>
        </div>
      )}

      <div className={cn("border-b p-3", expanded && "px-5 py-3 sm:px-6")}>
        <div className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 sm:grid-cols-3 lg:flex" role="tablist" aria-label="创作任务">
            {TASKS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={task === value}
                onClick={() => setTask(value)}
                className={cn(
                  "flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors last:col-span-2 sm:last:col-span-1",
                  task === value && "bg-accent text-accent-foreground"
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
          {!expanded && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={() => setTextWorkspaceOpen(true)}
              aria-label="打开专注对话"
              title="打开专注对话"
            >
              <Maximize2 className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className={cn("flex-1 space-y-5 overflow-y-auto", expanded ? "p-5 sm:p-7" : "p-4 sm:p-5")}>
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
                "min-w-0 break-words rounded-lg px-4 py-3.5",
                message.role === "user"
                  ? "max-w-[84%] whitespace-pre-wrap bg-primary text-[15px] leading-7 text-primary-foreground"
                  : cn(
                    expanded ? "max-w-[min(980px,94%)] shadow-sm" : "max-w-[96%]",
                    "border bg-background text-foreground"
                  )
              )}>
                {message.content ? message.role === "assistant" ? (
                  <>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
                      <Sparkles className="size-3.5" />
                      AI 助手
                    </div>
                    <AiMarkdown>{message.content}</AiMarkdown>
                  </>
                ) : message.content : (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    正在生成
                  </span>
                )}
              </div>
            </div>
          ))}

          {latestAssistant && !streaming && (
            <div className={cn("space-y-2 border-t pt-3", expanded ? "max-w-[min(980px,94%)]" : "max-w-[96%]")}>
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

        <form onSubmit={handleSend} className={cn("border-t bg-card", expanded ? "p-4 sm:p-5" : "p-3 sm:p-4")}>
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={selectedTask.placeholder}
              rows={expanded ? 4 : 3}
              className={cn("flex-1 resize-none bg-background", expanded ? "min-h-28" : "min-h-[84px]")}
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
    </div>
  )

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
              setTask("concept")
              setMessages([])
              setSelectedMaterials([])
              setScopeFilter("all")
              setMaterialSearch("")
              setSelectedBrand("")
              setSelectedCarModel("")
              setMaterialsLoading(true)
              const firstImageThread = createImageThread(1)
              setImageThreads([firstImageThread])
              setActiveImageThreadId(firstImageThread.id)
              setUploadedReferenceImages([])
              setGeneratingImageThreadId(null)
              setNoteTitle("")
              setSavedCreation(null)
              setFeedbackChoice(null)
              setFeedbackComment("")
              setFeedbackSent(false)
              setResumedCreationId(null)
              setResumedTitle("")
              setChatError("")
              window.history.replaceState({}, "", "/ai")
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

        {resumedCreationId && (
          <div className="mb-5 flex items-start gap-2 border-y border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <History className="mt-0.5 size-4 shrink-0" />
            <span>正在继续“{resumedTitle}”，已恢复 {messages.length} 条文案对话和 {imageThreads.length} 个图片对话</span>
          </div>
        )}

        {chatError && (
          <div className="mb-5 flex items-start gap-2 border-y border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {chatError}
          </div>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(520px,1.25fr)_minmax(360px,0.75fr)]">
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

          <section className="flex h-[min(75vh,780px)] min-h-[540px] overflow-hidden rounded-lg border bg-card" aria-label="AI 对话">
            {renderConversation()}
          </section>

          <aside className="space-y-5 lg:col-span-2 xl:col-span-1" aria-label="生成与保存">
            <AiImageWorkspace
              selectedMaterialImages={selectedMaterialImages}
              uploadedReferenceImages={uploadedReferenceSources}
              historicalReferenceImages={historicalReferenceImages}
              generatedImageSources={generatedImageSources}
              imageThreads={imageThreads.map((thread) => ({
                id: thread.id,
                title: thread.title,
                generationCount: thread.generated_images.length,
                isGenerating: generatingImageThreadId === thread.id,
              }))}
              activeThreadId={activeImageThreadId}
              selectedReferences={selectedImageReferences}
              imageMessages={imageMessages}
              generatedImages={activeGeneratedImages}
              generatingImage={generatingImageThreadId === activeImageThreadId}
              imageGenerationBusy={Boolean(generatingImageThreadId)}
              uploadingReferences={uploadingReferences}
              imagePrompt={imagePrompt}
              imageReady={imageReady}
              latestAssistant={latestAssistant}
              onSelectThread={setActiveImageThreadId}
              onCreateThread={handleCreateImageThread}
              onToggleReferenceAttachment={toggleReferenceAttachment}
              onUploadReferenceImages={handleUploadReferenceImages}
              onImagePromptChange={handleImagePromptChange}
              onGenerateImage={handleGenerateImage}
            />

            <section className="overflow-hidden rounded-lg border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Save className="size-4 text-primary" />
                  保存到我的创作
                </h2>
              </div>
              <div className="space-y-3 p-4">
                <Input
                  value={noteTitle}
                  onChange={(event) => setNoteTitle(event.target.value)}
                  placeholder="创作标题"
                  disabled={!canSaveIdea}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  将完整对话和 {generatedImages.length} 张配图保存到我的创作
                </p>
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleSave}
                  disabled={!canSaveIdea || saving}
                >
                  {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
                  {saving ? "保存中" : resumedCreationId ? "更新我的创作" : "保存到我的创作"}
                </Button>
                {savedCreation && (
                  <div className="flex items-start gap-2 border-t pt-3 text-sm text-insight-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                    <span>
                      已保存“{savedCreation.title}”
                      <Link href="/creations" className="ml-1 font-medium text-primary hover:underline">查看</Link>
                    </span>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>

        <Dialog open={textWorkspaceOpen} onOpenChange={setTextWorkspaceOpen}>
          <DialogContent className="flex h-[94dvh] w-[calc(100vw-1rem)] max-w-[1280px] flex-col gap-0 overflow-hidden p-0 sm:h-[90dvh] sm:max-w-[1280px]">
            <DialogTitle className="sr-only">专注 AI 对话</DialogTitle>
            <DialogDescription className="sr-only">查看完整对话并继续创作</DialogDescription>
            {renderConversation(true)}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
