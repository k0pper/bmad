"use client"

import { Dropdown } from "@/components/ui/Dropdown"

export type CvVersionForSelector = {
  id: string
  name: string
  uploadedAt: Date
}

type Props = {
  versions: CvVersionForSelector[]
  value: string
  onSelect: (value: string) => void
}

function relativeDate(date: Date): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000)
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function CVVersionSelector({ versions, value, onSelect }: Props) {
  const selected = versions.find((v) => v.id === value) ?? versions[0]
  const items = versions.map((v) => ({
    value: v.id,
    label: v.name,
    rightHint: relativeDate(v.uploadedAt),
  }))

  return (
    <Dropdown<string>
      triggerLabel={selected ? selected.name : "Select CV"}
      ariaLabel="Select CV version"
      items={items}
      value={value}
      onSelect={onSelect}
      align="start"
      size="md"
      minWidthPx={260}
      className="w-full justify-between"
    />
  )
}
