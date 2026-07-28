"use client"

import { useState } from "react"
import { AlertCircle, CarFront, FileText, ImageIcon, Lightbulb, Video, X, ChevronRight, ChevronLeft, Upload, Plus, Trash2 } from "lucide-react"
import type { Material, MaterialScope } from "@/lib/api"
import { GENERAL_CONTENT_TYPES, isImageAttachment, isVideoAttachment, VEHICLE_CONTENT_TYPES } from "@/lib/materials"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const SOURCE_TYPES = [
  { value: "self_experience", label: "自家经验" },
  { value: "product资料", label: "产品资料" },
  { value: "customer_feedback", label: "客户反馈" },
  { value: "xiaohongshu", label: "小红书博主" },
  { value: "douyin", label: "抖音博主" },
  { value: "bilibili", label: "B站内容" },
  { value: "competitor", label: "竞品账号" },
  { value: "car_group", label: "车友群" },
  { value: "sales_feedback", label: "销售反馈" },
  { value: "wechat_article", label: "公众号文章" },
  { value: "other", label: "其他" },
]

const MAX_FILE_SIZE = 200 * 1024 * 1024
const ACCEPTED_FILES = [
  ".avif",
  ".gif",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".m4v",
  ".mov",
  ".mp4",
  ".webm",
  ".pdf",
].join(",")

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`
  return `${(size / (1024 * 1024)).toFixed(1)}MB`
}

interface AddMaterialModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (formData: FormData) => Promise<void>
  editingMaterial?: Material | null
  defaultScope?: MaterialScope
}

export function AddMaterialModal({
  open,
  onClose,
  onSubmit,
  editingMaterial,
  defaultScope,
}: AddMaterialModalProps) {
  const [step, setStep] = useState(editingMaterial ? 3 : 1)
  const [submitting, setSubmitting] = useState(false)

  const [materialScope, setMaterialScope] = useState<MaterialScope | "">(
    editingMaterial?.material_scope ?? defaultScope ?? ""
  )
  const [sourceType, setSourceType] = useState(editingMaterial?.source_type ?? "")
  const [title, setTitle] = useState(editingMaterial?.title ?? "")
  const [brand, setBrand] = useState(editingMaterial?.brand ?? "")
  const [carModel, setCarModel] = useState(editingMaterial?.car_model ?? "")
  const [author, setAuthor] = useState(editingMaterial?.author ?? "")
  const [sourceUrl, setSourceUrl] = useState(editingMaterial?.source_url ?? "")
  const [summary, setSummary] = useState(editingMaterial?.summary ?? "")
  const [originalContent, setOriginalContent] = useState(editingMaterial?.original_content ?? "")
  const [saveReason, setSaveReason] = useState(editingMaterial?.save_reason ?? "")
  const [learningPoints, setLearningPoints] = useState(editingMaterial?.learning_points ?? "")
  const [suggestTitle, setSuggestTitle] = useState(editingMaterial?.suggest_title ?? "")
  const [contentTypes, setContentTypes] = useState<string[]>(editingMaterial?.content_types ?? [])
  const [tags, setTags] = useState<string[]>(editingMaterial?.tags ?? [])
  const [tagInput, setTagInput] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [existingAttachments, setExistingAttachments] = useState(editingMaterial?.attachments ?? [])
  const [error, setError] = useState("")
  const availableContentTypes = materialScope === "general"
    ? GENERAL_CONTENT_TYPES
    : VEHICLE_CONTENT_TYPES
  const displayedContentTypes = [
    ...availableContentTypes,
    ...contentTypes.filter((type) => !availableContentTypes.includes(type)),
  ]

  const handleClose = () => {
    onClose()
  }

  const handleContentTypeToggle = (type: string) => {
    setContentTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const handleScopeChange = (scope: MaterialScope) => {
    if (materialScope && materialScope !== scope) setContentTypes([])
    setMaterialScope(scope)
    setError("")
  }

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput("")
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      const oversizedFiles = selectedFiles.filter((file) => file.size > MAX_FILE_SIZE)
      const validFiles = selectedFiles.filter((file) => file.size <= MAX_FILE_SIZE)

      setError(
        oversizedFiles.length > 0
          ? `${oversizedFiles.map((file) => file.name).join("、")} 超过 200MB，未加入上传列表`
          : ""
      )
      setFiles((currentFiles) => {
        const existingKeys = new Set(
          currentFiles.map((file) => `${file.name}-${file.size}-${file.lastModified}`)
        )
        return [
          ...currentFiles,
          ...validFiles.filter(
            (file) => !existingKeys.has(`${file.name}-${file.size}-${file.lastModified}`)
          ),
        ]
      })
      e.target.value = ""
    }
  }

  const handleRemoveFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  const handleRemoveExistingAttachment = (path: string) => {
    setExistingAttachments((attachments) => attachments.filter((attachment) => attachment.path !== path))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError("")
    try {
      const formData = new FormData()
      formData.append("title", title)
      formData.append("material_scope", materialScope)
      formData.append("source_type", sourceType)
      if (materialScope === "vehicle") {
        formData.append("brand", brand)
        formData.append("car_model", carModel)
      }
      if (author) formData.append("author", author)
      if (sourceUrl) formData.append("source_url", sourceUrl)
      formData.append("content_types", JSON.stringify(contentTypes))
      if (summary) formData.append("summary", summary)
      if (originalContent) formData.append("original_content", originalContent)
      if (saveReason) formData.append("save_reason", saveReason)
      if (learningPoints) formData.append("learning_points", learningPoints)
      if (suggestTitle) formData.append("suggest_title", suggestTitle)
      formData.append("tags", JSON.stringify(tags))
      formData.append("attachments", JSON.stringify(existingAttachments))
      files.forEach((f) => formData.append("files", f))

      await onSubmit(formData)
      handleClose()
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error ? caughtError.message : "保存失败，请重试")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-6">
      <div className="fixed inset-0 bg-black/45 backdrop-blur-[1px]" onClick={handleClose} />
      <div
        className="relative flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={editingMaterial ? "编辑素材" : "添加素材"}
      >
        <div className="border-b px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-primary">{editingMaterial ? "编辑素材" : "新建素材"}</p>
              <h2 className="mt-0.5 text-base font-semibold">{editingMaterial ? editingMaterial.title : "添加创作素材"}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose} aria-label="关闭" title="关闭">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2" aria-label={`第 ${step} 步，共 4 步`}>
            {["使用范围", "选择来源", "填写内容", "分类归档"].map((label, index) => {
              const stepNumber = index + 1
              return (
                <div key={label} className="min-w-0">
                  <div className={cn("h-1 rounded-full bg-muted", stepNumber <= step && "bg-primary")} />
                  <span className={cn("mt-1 block truncate text-[11px] text-muted-foreground", stepNumber === step && "font-medium text-foreground")}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">这条素材用于哪里？</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleScopeChange("vehicle")}
                  className={cn(
                    "min-h-32 rounded-md border p-4 text-left transition-colors",
                    materialScope === "vehicle"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-input hover:bg-muted/40"
                  )}
                >
                  <CarFront className={cn("mb-4 size-6", materialScope === "vehicle" ? "text-primary" : "text-muted-foreground")} />
                  <span className="block text-sm font-semibold">车型相关素材</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">按品牌和车型归档用户痛点、产品卖点、车型知识等资料</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleScopeChange("general")}
                  className={cn(
                    "min-h-32 rounded-md border p-4 text-left transition-colors",
                    materialScope === "general"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-input hover:bg-muted/40"
                  )}
                >
                  <Lightbulb className={cn("mb-4 size-6", materialScope === "general" ? "text-primary" : "text-muted-foreground")} />
                  <span className="block text-sm font-semibold">通用创作灵感</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">收录爆款参考、标题灵感、视频灵感和活动素材</span>
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">这条素材来自哪里？</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SOURCE_TYPES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setSourceType(s.value)}
                    className={cn(
                      "min-h-11 rounded-md border p-3 text-left text-sm transition-colors",
                      sourceType === s.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-input hover:bg-muted/40"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">素材内容</h3>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="title">素材标题 *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="输入素材标题"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="suggestTitle">建议标题</Label>
                  <Input
                    id="suggestTitle"
                    value={suggestTitle}
                    onChange={(event) => setSuggestTitle(event.target.value)}
                    placeholder="可直接改写使用的标题灵感"
                    className="mt-1"
                  />
                </div>
                {materialScope === "vehicle" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="brand">品牌 *</Label>
                      <Input
                        id="brand"
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        placeholder="如：宝马"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="carModel">车型 *</Label>
                      <Input
                        id="carModel"
                        value={carModel}
                        onChange={(e) => setCarModel(e.target.value)}
                        placeholder="如：宝马3系"
                        className="mt-1"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <Label htmlFor="author">作者/博主</Label>
                  <Input
                    id="author"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="输入作者名称"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="sourceUrl">参考链接</Label>
                  <Input
                    id="sourceUrl"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="summary">内容概述</Label>
                  <Textarea
                    id="summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="简要描述内容..."
                    className="mt-1"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="originalContent">原始内容</Label>
                  <Textarea
                    id="originalContent"
                    value={originalContent}
                    onChange={(e) => setOriginalContent(e.target.value)}
                    placeholder="粘贴原始内容..."
                    className="mt-1"
                    rows={4}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">分类与创作价值</h3>

              <div>
                <Label className="mb-2 block">内容类型（可多选）</Label>
                <div className="flex flex-wrap gap-2">
                  {displayedContentTypes.map((type) => (
                    <Badge
                      key={type}
                      variant={contentTypes.includes(type) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => handleContentTypeToggle(type)}
                    >
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2 block">标签</Label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                    placeholder="输入标签后按回车"
                  />
                  <Button type="button" variant="outline" onClick={handleAddTag}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => handleRemoveTag(tag)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="saveReason">为什么保存</Label>
                <Textarea
                  id="saveReason"
                  value={saveReason}
                  onChange={(e) => setSaveReason(e.target.value)}
                  placeholder="例如：标题冲突强、评论区互动高..."
                  className="mt-1"
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="learningPoints">值得学习</Label>
                <Textarea
                  id="learningPoints"
                  value={learningPoints}
                  onChange={(e) => setLearningPoints(e.target.value)}
                  placeholder="例如：封面设计、前三秒开头..."
                  className="mt-1"
                  rows={2}
                />
              </div>

              <div>
                <Label className="mb-2 block">附件</Label>
                <div className="rounded-md border border-dashed p-4">
                  <input
                    type="file"
                    id="files"
                    multiple
                    accept={ACCEPTED_FILES}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="files"
                    className="flex flex-col items-center gap-2 cursor-pointer text-sm text-muted-foreground"
                  >
                    <Upload className="h-8 w-8" />
                    <span>点击上传图片、视频或 PDF</span>
                  </label>
                  {files.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {files.map((file, index) => (
                        <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-2 text-sm">
                          {file.type.startsWith("video/") ? (
                            <Video className="size-4 shrink-0 text-primary" />
                          ) : file.type.startsWith("image/") ? (
                            <ImageIcon className="size-4 shrink-0 text-insight-foreground" />
                          ) : (
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0"
                            onClick={() => handleRemoveFile(index)}
                            aria-label={`移除 ${file.name}`}
                            title="移除附件"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {existingAttachments.length > 0 && (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      {existingAttachments.map((attachment) => (
                        <div key={attachment.path} className="flex items-center justify-between gap-3 text-sm">
                          {isVideoAttachment(attachment) ? (
                            <Video className="size-4 shrink-0 text-primary" />
                          ) : isImageAttachment(attachment) ? (
                            <ImageIcon className="size-4 shrink-0 text-insight-foreground" />
                          ) : (
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-muted-foreground">{attachment.name}</p>
                            {attachment.size !== undefined && (
                              <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0 text-muted-foreground"
                            onClick={() => handleRemoveExistingAttachment(attachment.path)}
                            aria-label={`移除 ${attachment.name}`}
                            title="移除附件"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-between border-t bg-muted/50 p-4 sm:px-6">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              上一步
            </Button>
          ) : (
            <div />
          )}
          {step < 4 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={
                (step === 1 && !materialScope) ||
                (step === 2 && !sourceType) ||
                (step === 3 && (!title.trim() || (materialScope === "vehicle" && (!brand.trim() || !carModel.trim()))))
              }
              className="gap-2"
            >
              下一步
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !sourceType || !materialScope}
            >
              {submitting ? "保存中..." : "保存素材"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
