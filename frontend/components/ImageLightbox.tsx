"use client"

import Image from "next/image"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

export interface PreviewImage {
  src: string
  alt: string
  name?: string
}

interface ImageLightboxProps {
  image: PreviewImage | null
  onOpenChange: (open: boolean) => void
}

export function ImageLightbox({ image, onOpenChange }: ImageLightboxProps) {
  return (
    <Dialog open={Boolean(image)} onOpenChange={onOpenChange}>
      <DialogContent className="h-[94dvh] w-[calc(100vw-1rem)] max-w-[1600px] gap-0 overflow-hidden border-0 bg-black p-0 text-white sm:max-w-[1600px]">
        <DialogTitle className="sr-only">{image?.name || image?.alt || "图片预览"}</DialogTitle>
        <DialogDescription className="sr-only">大图预览</DialogDescription>
        {image && (
          <div className="relative size-full bg-black">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="100vw"
              className="object-contain"
              unoptimized
              priority
            />
            {image.name && (
              <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-center text-sm text-white">
                {image.name}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
