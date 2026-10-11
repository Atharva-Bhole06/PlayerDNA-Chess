import type { PropsWithChildren } from 'react'

interface PanelProps extends PropsWithChildren {
  className?: string
}

export function Panel({ children, className = '' }: PanelProps) {
  return <section className={`panel ${className}`.trim()}>{children}</section>
}
