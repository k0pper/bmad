"use client"

import { Accordion } from "@base-ui/react/accordion"

type Section = {
  id: string
  label: string
  children: React.ReactNode
}

type Props = {
  sections: Section[]
  /** Sections open by default */
  defaultOpen?: string[]
}

export function DetailAccordion({ sections, defaultOpen = [] }: Props) {
  return (
    <Accordion.Root
      multiple
      defaultValue={defaultOpen}
      className="divide-y"
      style={{ borderColor: "var(--color-border, #e2e8f0)" }}
    >
      {sections.map((section) => (
        <Accordion.Item key={section.id} value={section.id}>
          <Accordion.Header>
            <Accordion.Trigger
              className="group flex w-full items-center justify-between py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
              style={{ color: "var(--color-text-primary)" }}
            >
              <span className="text-sm font-semibold">{section.label}</span>
              <ChevronIcon className="h-4 w-4 flex-shrink-0 transition-transform duration-200 group-data-[panel-open]:rotate-180" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel
            className="overflow-hidden transition-[height] duration-200 ease-out data-[starting-style]:h-0 data-[ending-style]:h-0"
            style={{ height: "var(--accordion-panel-height)" }}
          >
            <div className="pb-4 pt-1">
              {section.children}
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}
