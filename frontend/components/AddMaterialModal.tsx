"use client"

import { useState, useEffect } from "react"
import { X, ChevronRight, ChevronLeft, Upload, Plus, Trash2 } from "lucide-react"
import { Material } from "@/lib/api"
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

const CONTENT_TYPES = [
  "用户使用痛点",
  "专业知识分享",
  "香味分享",
  "车型知识",
  "产品卖点",
  "用户案例",
  "爆款参考",
  "竞品种草",
  "标题灵感",
  "视频灵感",
  "活动素材",
]

interface AddMaterialModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (formData: FormData) => Promise<void>
  editingMaterial?: Material | null
}

export function AddMaterialModal({
  open,
  onClose,
  onSubmit,
  editingMaterial,
}: AddMaterialModalProps) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const [sourceType, setSourceType] = useState("")
  const [title, setTitle] = useState("")
  const [brand, setBrand] = useState("")
  const [carModel, setCarModel] = useState("")
  const [author, setAuthor] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [summary, setSummary] = useState("")
  const [originalContent, setOriginalContent] = useState("")
  const [saveReason, setSaveReason] = useState("")
  const [learningPoints, setLearningPoints] = useState("")
  const [contentTypes, setContentTypes] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [files, setFiles] = useState<File[]>([])

  useEffect(() => {
    if (editingMaterial) {
      setSourceType(editingMaterial.source_type)
      setTitle(editingMaterial.title)
      setBrand(editingMaterial.brand || "")
      setCarModel(editingMaterial.car_model || "")
      setAuthor(editingMaterial.author || "")
      setSourceUrl(editingMaterial.source_url || "")
      setSummary(editingMaterial.summary || "")
      setOriginalContent(editingMaterial.original_content || "")
      setSaveReason(editingMaterial.save_reason || "")
      setLearningPoints(editingMaterial.learning_points || "")
      setContentTypes(editingMaterial.content_types)
      setTags(editingMaterial.tags)
      setStep(2)
    } else {
      resetForm()
    }
  }, [editingMaterial, open])

  const resetForm = () => {
    setStep(1)
    setSourceType("")
    setTitle("")
    setBrand("")
    setCarModel("")
    setAuthor("")
    setSourceUrl("")
    setSummary("")
    setOriginalContent("")
    setSaveReason("")
    setLearningPoints("")
    setContentTypes([])
    setTags([])
    setTagInput("")
    setFiles([])
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleContentTypeToggle = (type: string) => {
    setContentTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
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
      setFiles([...files, ...Array.from(e.target.files)])
    }
  }

  const handleRemoveFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append("title", title)
      formData.append("source_type", sourceType)
      if (brand) formData.append("brand", brand)
      if (carModel) formData.append("car_model", carModel)
      if (author) formData.append("author", author)
      if (sourceUrl) formData.append("source_url", sourceUrl)
      formData.append("content_types", JSON.stringify(contentTypes))
      if (summary) formData.append("summary", summary)
      if (originalContent) formData.append("original_content", originalContent)
      if (saveReason) formData.append("save_reason", saveReason)
      if (learningPoints) formData.append("learning_points", learningPoints)
      formData.append("tags", JSON.stringify(tags))
      formData.append("attachments", JSON.stringify([]))
      files.forEach((f) => formData.append("files", f))

      await onSubmit(formData)
      handleClose()
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Step {step} of 3</span>
            <div className="flex gap-1">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={cn(
                    "w-2 h-2 rounded-full",
                    s === step ? "bg-primary" : s < step ? "bg-primary/50" : "bg-gray-200"
                  )}
                />
              ))}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">选择来源类型</h2>
              <div className="grid grid-cols-2 gap-2">
                {SOURCE_TYPES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setSourceType(s.value)}
                    className={cn(
                      "p-3 text-left rounded-lg border text-sm transition-colors",
                      sourceType === s.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">填写内容</h2>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="brand">品牌</Label>
                    <Input
                      id="brand"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder="如：宝马"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="carModel">车型</Label>
                    <Input
                      id="carModel"
                      value={carModel}
                      onChange={(e) => setCarModel(e.target.value)}
                      placeholder="如：宝马3系"
                      className="mt-1"
                    />
                  </div>
                </div>
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

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">设置分类</h2>

              <div>
                <Label className="mb-2 block">内容类型（可多选）</Label>
                <div className="flex flex-wrap gap-2">
                  {CONTENT_TYPES.map((type) => (
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
                <div className="border rounded-lg p-4">
                  <input
                    type="file"
                    id="files"
                    multiple
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
                      {files.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="truncate">{f.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleRemoveFile(i)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between p-4 border-t bg-gray-50">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              上一步
            </Button>
          ) : (
            <div />
          )}
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !sourceType} className="gap-2">
              下一步
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting || !title || !sourceType}>
              {submitting ? "保存中..." : "保存素材"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
