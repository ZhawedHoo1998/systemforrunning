import type { Attachment, Material, MaterialScope } from "@/lib/api"

export const MATERIAL_SCOPE_LABELS: Record<MaterialScope, string> = {
  vehicle: "车型相关",
  general: "通用灵感",
}

export const VEHICLE_CONTENT_TYPES = [
  "用户使用痛点",
  "专业知识分享",
  "香味分享",
  "车型知识",
  "产品卖点",
  "用户案例",
  "竞品种草",
]

export const GENERAL_CONTENT_TYPES = [
  "爆款参考",
  "标题灵感",
  "视频灵感",
  "活动素材",
]

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  self_experience: "自家经验",
  product资料: "产品资料",
  customer_feedback: "客户反馈",
  xiaohongshu: "小红书博主",
  douyin: "抖音博主",
  bilibili: "B站内容",
  competitor: "竞品账号",
  car_group: "车友群",
  sales_feedback: "销售反馈",
  wechat_article: "公众号文章",
  other: "其他",
}

export function filterMaterials(materials: Material[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN")
  if (!normalizedQuery) return materials

  return materials.filter((material) =>
    [
      material.title,
      material.summary,
      material.original_content,
      material.brand,
      material.car_model,
      material.author,
      MATERIAL_SCOPE_LABELS[material.material_scope],
      SOURCE_TYPE_LABELS[material.source_type],
      ...material.content_types,
      ...material.tags,
    ].some((value) => value?.toLocaleLowerCase("zh-CN").includes(normalizedQuery))
  )
}

export function formatMaterialDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

export function getPreviewImage(material: Material) {
  return material.attachments?.find(isImageAttachment)
}

export function isImageAttachment(attachment: Attachment) {
  if (attachment.type?.startsWith("image/")) return true

  const pathWithoutQuery = attachment.path.split("?", 1)[0]
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(pathWithoutQuery)
}

export function isVideoAttachment(attachment: Attachment) {
  if (attachment.type?.startsWith("video/")) return true

  const pathWithoutQuery = attachment.path.split("?", 1)[0]
  return /\.(m4v|mov|mp4|webm)$/i.test(pathWithoutQuery)
}
