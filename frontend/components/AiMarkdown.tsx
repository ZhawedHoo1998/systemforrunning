"use client"

import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

interface AiMarkdownProps {
  children: string
  className?: string
}

export function AiMarkdown({ children, className }: AiMarkdownProps) {
  return (
    <div className={cn("min-w-0 break-words text-[15px] leading-7", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: ({ children: heading }) => <h1 className="mb-3 mt-7 border-b pb-2 text-xl font-semibold leading-8 first:mt-0">{heading}</h1>,
          h2: ({ children: heading }) => <h2 className="mb-2 mt-6 text-lg font-semibold leading-7 first:mt-0">{heading}</h2>,
          h3: ({ children: heading }) => <h3 className="mb-2 mt-5 text-base font-semibold leading-7 first:mt-0">{heading}</h3>,
          h4: ({ children: heading }) => <h4 className="mb-1 mt-4 text-[15px] font-semibold first:mt-0">{heading}</h4>,
          p: ({ children: paragraph }) => <p className="my-3 first:mt-0 last:mb-0">{paragraph}</p>,
          strong: ({ children: content }) => <strong className="font-semibold text-foreground">{content}</strong>,
          ul: ({ children: items }) => <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-primary">{items}</ul>,
          ol: ({ children: items }) => <ol className="my-3 list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-primary">{items}</ol>,
          li: ({ children: item }) => <li className="pl-0.5">{item}</li>,
          blockquote: ({ children: quote }) => <blockquote className="my-4 border-l-2 border-primary/45 bg-accent/50 px-3 py-2 text-foreground/80">{quote}</blockquote>,
          hr: () => <hr className="my-5 border-border" />,
          a: ({ children: link, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">{link}</a>,
          code: ({ children: code }) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.88em] text-foreground">{code}</code>,
          pre: ({ children: code }) => <pre className="my-4 overflow-x-auto rounded-md bg-muted p-3 text-sm leading-6 text-foreground">{code}</pre>,
          table: ({ children: table }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-sm">{table}</table></div>,
          th: ({ children: cell }) => <th className="border bg-muted px-3 py-2 text-left font-semibold">{cell}</th>,
          td: ({ children: cell }) => <td className="border px-3 py-2 align-top">{cell}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
