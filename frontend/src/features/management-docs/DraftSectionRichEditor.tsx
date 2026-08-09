import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Minus,
  Plus,
  Redo2,
  Rows3,
  Settings2,
  Sparkles,
  Strikethrough,
  TableIcon,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import {
  extractSectionHtmlFromAiReply,
  normalizeSectionHtml,
} from './documentContentFormat'
import {
  fetchManagementDocCatalog,
  formatCatalogForPrompt,
} from './documentReferenceCheck'

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value.trim())
}

function toEditorHtml(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (looksLikeHtml(trimmed)) return value
  return trimmed
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** TipTap tables need <tbody> and block content inside each cell. */
function normalizeTablesForTiptap(html: string): string {
  if (typeof document === 'undefined' || !html.includes('<table')) return html
  const root = document.createElement('div')
  root.innerHTML = html

  root.querySelectorAll('table').forEach((table) => {
    // Ensure tbody
    if (!table.querySelector('tbody')) {
      const tbody = document.createElement('tbody')
      Array.from(table.children).forEach((child) => {
        if (child.tagName === 'TR') tbody.appendChild(child)
      })
      // Move thead rows too if present without tbody structure TipTap likes
      const thead = table.querySelector('thead')
      if (thead) {
        Array.from(thead.querySelectorAll('tr')).forEach((tr) => tbody.appendChild(tr))
        thead.remove()
      }
      table.appendChild(tbody)
    }

    table.querySelectorAll('th, td').forEach((cell) => {
      const hasBlock = cell.querySelector('p, ul, ol, h1, h2, h3, h4')
      if (!hasBlock) {
        const text = cell.textContent ?? ''
        cell.innerHTML = ''
        const p = document.createElement('p')
        p.textContent = text
        cell.appendChild(p)
      }
    })
  })

  return root.innerHTML
}

function applyAiHtmlToEditor(html: string): string {
  return normalizeTablesForTiptap(normalizeSectionHtml(extractSectionHtmlFromAiReply(html)))
}

const cellSizeAttrs = {
  width: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('width') || el.style.width || null,
    renderHTML: (attrs: { width?: string | null }) => {
      if (!attrs.width) return {}
      return { style: `width: ${attrs.width}` }
    },
  },
  height: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.style.height || el.getAttribute('height') || null,
    renderHTML: (attrs: { height?: string | null }) => {
      if (!attrs.height) return {}
      return { style: `height: ${attrs.height}` }
    },
  },
}

const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...cellSizeAttrs,
    }
  },
})

const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...cellSizeAttrs,
    }
  },
})

type ToolbarBtnProps = {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  label: string
  children: ReactNode
}

function ToolbarBtn({ onClick, active, disabled, label, children }: ToolbarBtnProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      className={cn('h-8 w-8 p-0', active && 'bg-teal-50 text-teal-800')}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function useHoverMenuOpen() {
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const openMenu = () => {
    clearCloseTimer()
    setOpen(true)
  }

  const scheduleClose = () => {
    clearCloseTimer()
    closeTimerRef.current = setTimeout(() => setOpen(false), 180)
  }

  useEffect(() => () => clearCloseTimer(), [])

  return { open, setOpen, openMenu, scheduleClose }
}

function ToolbarHoverMenu({
  label,
  title,
  active,
  icon,
  children,
  contentClassName,
}: {
  label: string
  title?: string
  active?: boolean
  icon: ReactNode
  children: ReactNode
  contentClassName?: string
}) {
  const { open, setOpen, openMenu, scheduleClose } = useHoverMenuOpen()

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={active || open ? 'secondary' : 'ghost'}
          className={cn('h-8 w-8 p-0', (active || open) && 'bg-teal-50 text-teal-800')}
          aria-label={label}
          title={title ?? label}
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
          onClick={(e) => {
            e.preventDefault()
            setOpen((v) => !v)
          }}
        >
          {icon}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className={cn('z-[80] min-w-[11rem] p-1', contentClassName)}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TableMenuItem({
  onSelect,
  disabled,
  children,
}: {
  onSelect: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      className="gap-2 text-[13px]"
      onSelect={(e) => {
        e.preventDefault()
        if (!disabled) onSelect()
      }}
    >
      {children}
    </DropdownMenuItem>
  )
}

function HeadingToolbarMenu({ editor }: { editor: Editor }) {
  const active =
    editor.isActive('heading', { level: 2 }) || editor.isActive('heading', { level: 3 })
  return (
    <ToolbarHoverMenu
      label="Headings"
      title="Headings"
      active={active}
      icon={<Heading2 size={14} />}
    >
      <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-500">
        Headings
      </DropdownMenuLabel>
      <TableMenuItem
        onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={14} />
        Heading 2
        {editor.isActive('heading', { level: 2 }) ? (
          <span className="ml-auto text-[10px] text-teal-700">On</span>
        ) : null}
      </TableMenuItem>
      <TableMenuItem
        onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 size={14} />
        Heading 3
        {editor.isActive('heading', { level: 3 }) ? (
          <span className="ml-auto text-[10px] text-teal-700">On</span>
        ) : null}
      </TableMenuItem>
      <TableMenuItem onSelect={() => editor.chain().focus().setParagraph().run()}>
        Paragraph
      </TableMenuItem>
    </ToolbarHoverMenu>
  )
}

function FormatToolbarMenu({ editor }: { editor: Editor }) {
  const active =
    editor.isActive('bold') ||
    editor.isActive('italic') ||
    editor.isActive('underline') ||
    editor.isActive('strike') ||
    editor.isActive('highlight')
  return (
    <ToolbarHoverMenu
      label="Text format"
      title="Bold, italic, underline…"
      active={active}
      icon={<Bold size={14} />}
    >
      <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-500">
        Format
      </DropdownMenuLabel>
      <TableMenuItem onSelect={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={14} />
        Bold
        {editor.isActive('bold') ? (
          <span className="ml-auto text-[10px] text-teal-700">On</span>
        ) : null}
      </TableMenuItem>
      <TableMenuItem onSelect={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={14} />
        Italic
        {editor.isActive('italic') ? (
          <span className="ml-auto text-[10px] text-teal-700">On</span>
        ) : null}
      </TableMenuItem>
      <TableMenuItem onSelect={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon size={14} />
        Underline
        {editor.isActive('underline') ? (
          <span className="ml-auto text-[10px] text-teal-700">On</span>
        ) : null}
      </TableMenuItem>
      <TableMenuItem onSelect={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough size={14} />
        Strikethrough
        {editor.isActive('strike') ? (
          <span className="ml-auto text-[10px] text-teal-700">On</span>
        ) : null}
      </TableMenuItem>
      <TableMenuItem onSelect={() => editor.chain().focus().toggleHighlight().run()}>
        <Highlighter size={14} />
        Highlight
        {editor.isActive('highlight') ? (
          <span className="ml-auto text-[10px] text-teal-700">On</span>
        ) : null}
      </TableMenuItem>
    </ToolbarHoverMenu>
  )
}

function AlignToolbarMenu({ editor }: { editor: Editor }) {
  const active =
    editor.isActive({ textAlign: 'left' }) ||
    editor.isActive({ textAlign: 'center' }) ||
    editor.isActive({ textAlign: 'right' }) ||
    editor.isActive({ textAlign: 'justify' })

  let icon = <AlignLeft size={14} />
  if (editor.isActive({ textAlign: 'center' })) icon = <AlignCenter size={14} />
  else if (editor.isActive({ textAlign: 'right' })) icon = <AlignRight size={14} />
  else if (editor.isActive({ textAlign: 'justify' })) icon = <AlignJustify size={14} />

  return (
    <ToolbarHoverMenu label="Alignment" title="Text alignment" active={active} icon={icon}>
      <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-500">
        Alignment
      </DropdownMenuLabel>
      <TableMenuItem onSelect={() => editor.chain().focus().setTextAlign('left').run()}>
        <AlignLeft size={14} />
        Align left
      </TableMenuItem>
      <TableMenuItem onSelect={() => editor.chain().focus().setTextAlign('center').run()}>
        <AlignCenter size={14} />
        Align center
      </TableMenuItem>
      <TableMenuItem onSelect={() => editor.chain().focus().setTextAlign('right').run()}>
        <AlignRight size={14} />
        Align right
      </TableMenuItem>
      <TableMenuItem onSelect={() => editor.chain().focus().setTextAlign('justify').run()}>
        <AlignJustify size={14} />
        Justify
      </TableMenuItem>
    </ToolbarHoverMenu>
  )
}

function ListToolbarMenu({ editor }: { editor: Editor }) {
  const active = editor.isActive('bulletList') || editor.isActive('orderedList')
  return (
    <ToolbarHoverMenu
      label="Lists"
      title="Lists & horizontal rule"
      active={active}
      icon={<List size={14} />}
    >
      <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-500">
        Lists
      </DropdownMenuLabel>
      <TableMenuItem onSelect={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={14} />
        Bullet list
        {editor.isActive('bulletList') ? (
          <span className="ml-auto text-[10px] text-teal-700">On</span>
        ) : null}
      </TableMenuItem>
      <TableMenuItem onSelect={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={14} />
        Numbered list
        {editor.isActive('orderedList') ? (
          <span className="ml-auto text-[10px] text-teal-700">On</span>
        ) : null}
      </TableMenuItem>
      <DropdownMenuSeparator />
      <TableMenuItem onSelect={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus size={14} />
        Horizontal rule
      </TableMenuItem>
    </ToolbarHoverMenu>
  )
}

function TableToolbarMenu({
  editor,
  inTable,
  tableRows,
  tableCols,
  colWidth,
  rowHeight,
  onTableRowsChange,
  onTableColsChange,
  onColWidthChange,
  onRowHeightChange,
  onOpenSettings,
  onContentChange,
}: {
  editor: Editor
  inTable: boolean
  tableRows: string
  tableCols: string
  colWidth: string
  rowHeight: string
  onTableRowsChange: (v: string) => void
  onTableColsChange: (v: string) => void
  onColWidthChange: (v: string) => void
  onRowHeightChange: (v: string) => void
  onOpenSettings: () => void
  onContentChange: () => void
}) {
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const openMenu = () => {
    clearCloseTimer()
    setOpen(true)
  }

  const scheduleClose = () => {
    clearCloseTimer()
    closeTimerRef.current = setTimeout(() => setOpen(false), 180)
  }

  useEffect(() => {
    return () => clearCloseTimer()
  }, [])

  const insertTable = () => {
    const rows = Math.min(10, Math.max(1, Number(tableRows) || 3))
    const cols = Math.min(10, Math.max(1, Number(tableCols) || 3))
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
    onContentChange()
  }

  const run = (fn: () => void) => {
    fn()
    onContentChange()
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={inTable || open ? 'secondary' : 'ghost'}
          className={cn('h-8 w-8 p-0', (inTable || open) && 'bg-teal-50 text-teal-800')}
          aria-label="Table formatting"
          title="Table formatting"
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
          onClick={(e) => {
            e.preventDefault()
            setOpen((v) => !v)
          }}
        >
          <TableIcon size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="z-[80] w-[280px] p-0"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-border bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Table formatting
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            {inTable ? 'Editing current table' : 'Insert a table, then use row/column tools'}
          </p>
        </div>

        <div className="p-1">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-500">
            Insert
          </DropdownMenuLabel>
          <div className="mb-1 grid grid-cols-[1fr_1fr_auto] items-end gap-1.5 px-2 pb-1">
            <div className="space-y-0.5">
              <Label className="text-[10px] text-slate-500">Rows</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={tableRows}
                onChange={(e) => onTableRowsChange(e.target.value)}
                className="h-7 text-xs"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-slate-500">Cols</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={tableCols}
                onChange={(e) => onTableColsChange(e.target.value)}
                className="h-7 text-xs"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.preventDefault()
                insertTable()
              }}
            >
              Insert
            </Button>
          </div>
          <TableMenuItem onSelect={insertTable}>
            <Plus size={14} />
            Insert new table
          </TableMenuItem>
          <TableMenuItem
            disabled={!inTable}
            onSelect={() => {
              onOpenSettings()
              setOpen(false)
            }}
          >
            <Settings2 size={14} />
            Table settings…
          </TableMenuItem>
        </div>

        <DropdownMenuSeparator />

        <div className="p-1">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-500">
            Rows
          </DropdownMenuLabel>
          <TableMenuItem
            disabled={!inTable}
            onSelect={() => run(() => editor.chain().focus().addRowBefore().run())}
          >
            <Rows3 size={14} />
            Add row above
          </TableMenuItem>
          <TableMenuItem
            disabled={!inTable}
            onSelect={() => run(() => editor.chain().focus().addRowAfter().run())}
          >
            <Rows3 size={14} />
            Add row below
          </TableMenuItem>
          <TableMenuItem
            disabled={!inTable}
            onSelect={() => run(() => editor.chain().focus().deleteRow().run())}
          >
            <Trash2 size={14} />
            Delete row
          </TableMenuItem>
        </div>

        <DropdownMenuSeparator />

        <div className="p-1">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-500">
            Columns
          </DropdownMenuLabel>
          <TableMenuItem
            disabled={!inTable}
            onSelect={() => run(() => editor.chain().focus().addColumnBefore().run())}
          >
            <Columns3 size={14} />
            Add column before
          </TableMenuItem>
          <TableMenuItem
            disabled={!inTable}
            onSelect={() => run(() => editor.chain().focus().addColumnAfter().run())}
          >
            <Columns3 size={14} />
            Add column after
          </TableMenuItem>
          <TableMenuItem
            disabled={!inTable}
            onSelect={() => run(() => editor.chain().focus().deleteColumn().run())}
          >
            <Trash2 size={14} />
            Delete column
          </TableMenuItem>
        </div>

        <DropdownMenuSeparator />

        <div className="p-1">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-500">
            Cell size
          </DropdownMenuLabel>
          <div className="mb-1 grid grid-cols-[1fr_1fr_auto] items-end gap-1.5 px-2 pb-1">
            <div className="space-y-0.5">
              <Label className="text-[10px] text-slate-500">Width</Label>
              <Input
                value={colWidth}
                onChange={(e) => onColWidthChange(e.target.value)}
                placeholder="120"
                className="h-7 text-xs"
                disabled={!inTable}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-slate-500">Height</Label>
              <Input
                value={rowHeight}
                onChange={(e) => onRowHeightChange(e.target.value)}
                placeholder="36"
                className="h-7 text-xs"
                disabled={!inTable}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 px-2 text-xs"
              disabled={!inTable}
              onClick={(e) => {
                e.preventDefault()
                applyCellSize(editor, colWidth, rowHeight)
                onContentChange()
              }}
            >
              Apply
            </Button>
          </div>
          <TableMenuItem
            disabled={!inTable}
            onSelect={() => run(() => editor.chain().focus().mergeCells().run())}
          >
            Merge cells
          </TableMenuItem>
          <TableMenuItem
            disabled={!inTable}
            onSelect={() => run(() => editor.chain().focus().splitCell().run())}
          >
            Split cell
          </TableMenuItem>
          <TableMenuItem
            disabled={!inTable}
            onSelect={() => run(() => editor.chain().focus().toggleHeaderRow().run())}
          >
            Toggle header row
          </TableMenuItem>
          <TableMenuItem
            disabled={!inTable}
            onSelect={() => run(() => editor.chain().focus().deleteTable().run())}
          >
            <Trash2 size={14} />
            Delete table
          </TableMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

type AiOptions = {
  language: string
  tone: string
  professionalism: string
  action: string
  topic: string
}

const defaultAiOptions = (): AiOptions => ({
  language: 'english',
  tone: 'formal',
  professionalism: 'professional',
  action: 'write',
  topic: '',
})

function buildAiMessage(
  opts: AiOptions,
  existingHtml: string,
  flags: { hasTable: boolean; inTable: boolean },
  catalogText: string,
): string {
  const langMap: Record<string, string> = {
    english: 'English',
    hindi: 'Hindi (Devanagari)',
    hinglish: 'Hinglish (Hindi in Latin script mixed with English)',
  }
  const toneMap: Record<string, string> = {
    formal: 'formal',
    neutral: 'neutral',
    concise: 'concise',
    assertive: 'clear and assertive',
  }
  const styleMap: Record<string, string> = {
    professional: 'professional business / lab documentation style',
    technical: 'technical ISO 17025 laboratory style',
    simple: 'simple and easy to understand',
  }
  const actionMap: Record<string, string> = {
    write: 'Write new section body HTML from scratch (may include tables when useful).',
    improve: 'Improve the current section HTML; preserve existing tables and update cell text if needed.',
    expand: 'Expand the current section HTML with more detail; keep and extend tables when present.',
    shorten: 'Shorten the current section HTML while keeping meaning and table structure.',
    create_table:
      'Create a proper HTML <table> for the topic (with header row using <th> and data rows using <td>). You may include a short intro <p> before the table.',
    update_table:
      'Update the EXISTING HTML table(s) in the current content per the topic/focus. Keep column structure unless the user asks to change it. Return the full section HTML including the revised table(s).',
  }

  const tableRules = [
    'HTML TABLES (required when creating/updating tables):',
    '- Use real HTML: <table><tbody><tr><th>...</th></tr><tr><td>...</td></tr></tbody></table>',
    '- Put text inside cells as <p>Cell text</p> (TipTap requirement).',
    '- First row should use <th> for headers when appropriate.',
    '- Do NOT use markdown tables (| col |). Do NOT describe the table in prose instead of HTML.',
    '- Do NOT wrap the reply in ``` fences or add chat text like "Here is the table".',
  ]

  const docRegisterRules = [
    'DOCUMENT REGISTER (SOURCE OF TRUTH — Level 1 / 2 / 3 / 4 Management Documents in this LIMS app):',
    catalogText.slice(0, 20000),
    'STRICT DOCUMENT REFERENCE RULES:',
    '- When naming documents, forms, SOPs, policies, WI, record IDs, or titles in text OR table cells, use ONLY Doc No + Title from the register above.',
    '- NEVER invent document numbers, form numbers, or titles that are not in the register.',
    '- If a cell currently has a made-up / unknown Doc No, replace it with the closest matching register entry, or leave a clear placeholder like "TBD (not in register)" — do not invent a fake number.',
    '- Prefer Active documents; do not present Obsolete docs as current controlled copies unless the existing content already cites them.',
    '- Match Doc No and Title together (do not pair a real Doc No with a wrong title).',
  ]

  return [
    'You draft ISO 17025 / Quality Manual section BODY as HTML for a TipTap rich editor.',
    `Language: ${langMap[opts.language] ?? opts.language}.`,
    `Tone: ${toneMap[opts.tone] ?? opts.tone}.`,
    `Style: ${styleMap[opts.professionalism] ?? opts.professionalism}.`,
    `Task: ${actionMap[opts.action] ?? opts.action}`,
    opts.topic.trim() ? `Topic / focus / table instructions: ${opts.topic.trim()}` : '',
    flags.hasTable
      ? 'Current content ALREADY contains at least one HTML table — preserve it unless the task is to replace/update it.'
      : '',
    flags.inTable
      ? 'User cursor is inside a table cell — prefer updating that table rather than removing it.'
      : '',
    ...docRegisterRules,
    ...tableRules,
    'Return ONLY HTML for the section body. Start with <p> or <table>. No markdown. No preamble.',
    existingHtml && opts.action !== 'write' && opts.action !== 'create_table'
      ? `Current section HTML:\n${existingHtml.slice(0, 14000)}`
      : existingHtml && (opts.action === 'create_table' || opts.action === 'write')
        ? `Existing section HTML (merge carefully; keep non-table content when sensible):\n${existingHtml.slice(0, 8000)}`
        : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function applyCellSize(editor: Editor, width: string, height: string) {
  const chain = editor.chain().focus()
  if (width.trim()) {
    const w = width.trim().match(/^\d+$/) ? `${width.trim()}px` : width.trim()
    chain.setCellAttribute('width', w)
  } else {
    chain.setCellAttribute('width', null)
  }
  if (height.trim()) {
    const h = height.trim().match(/^\d+$/) ? `${height.trim()}px` : height.trim()
    chain.setCellAttribute('height', h)
  } else {
    chain.setCellAttribute('height', null)
  }
  chain.run()
}

/** Floating toolbar when cursor is inside a table cell */
function TableCellBubbleMenu({
  editor,
  onOpenSettings,
  onContentChange,
}: {
  editor: Editor
  onOpenSettings: () => void
  onContentChange: () => void
}) {
  const run = (fn: () => void) => {
    fn()
    onContentChange()
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableCellBubbleMenu"
      className="z-[90] flex max-w-[min(96vw,520px)] flex-wrap items-center gap-0.5 rounded-lg border border-border bg-white p-1 shadow-lg"
      data-table-bubble-menu=""
      shouldShow={({ editor: ed, view }) => {
        if (!ed.isEditable || !ed.isActive('table')) return false
        const menuEl = document.querySelector('[data-table-bubble-menu]')
        const focusInMenu = Boolean(menuEl?.contains(document.activeElement))
        return view.hasFocus() || focusInMenu
      }}
      options={{
        placement: 'top',
        offset: 8,
        strategy: 'fixed',
        flip: true,
        shift: true,
      }}
    >
      <ToolbarBtn
        label="Bold"
        active={editor.isActive('bold')}
        onClick={() => run(() => editor.chain().focus().toggleBold().run())}
      >
        <Bold size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Italic"
        active={editor.isActive('italic')}
        onClick={() => run(() => editor.chain().focus().toggleItalic().run())}
      >
        <Italic size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Underline"
        active={editor.isActive('underline')}
        onClick={() => run(() => editor.chain().focus().toggleUnderline().run())}
      >
        <UnderlineIcon size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Highlight"
        active={editor.isActive('highlight')}
        onClick={() => run(() => editor.chain().focus().toggleHighlight().run())}
      >
        <Highlighter size={14} />
      </ToolbarBtn>
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <ToolbarBtn
        label="Align left"
        active={editor.isActive({ textAlign: 'left' })}
        onClick={() => run(() => editor.chain().focus().setTextAlign('left').run())}
      >
        <AlignLeft size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Align center"
        active={editor.isActive({ textAlign: 'center' })}
        onClick={() => run(() => editor.chain().focus().setTextAlign('center').run())}
      >
        <AlignCenter size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Align right"
        active={editor.isActive({ textAlign: 'right' })}
        onClick={() => run(() => editor.chain().focus().setTextAlign('right').run())}
      >
        <AlignRight size={14} />
      </ToolbarBtn>
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <ToolbarBtn
        label="Add row below"
        onClick={() => run(() => editor.chain().focus().addRowAfter().run())}
      >
        <Rows3 size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Add column after"
        onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}
      >
        <Columns3 size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Delete row"
        onClick={() => run(() => editor.chain().focus().deleteRow().run())}
      >
        <Trash2 size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Merge cells"
        onClick={() => run(() => editor.chain().focus().mergeCells().run())}
      >
        <TableIcon size={14} />
      </ToolbarBtn>
      <ToolbarBtn label="Table settings" onClick={onOpenSettings}>
        <Settings2 size={14} />
      </ToolbarBtn>
    </BubbleMenu>
  )
}

export function DraftSectionRichEditor({
  id,
  label,
  value,
  onChange,
  placeholder = 'Write section content…',
  minHeightClass = 'min-h-[220px]',
  aiContext,
  fillHeight = false,
}: {
  id: string
  label: string
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeightClass?: string
  aiContext?: string
  fillHeight?: boolean
}) {
  const [aiOpen, setAiOpen] = useState(false)
  const [aiOptions, setAiOptions] = useState<AiOptions>(defaultAiOptions)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const [tableSettingsOpen, setTableSettingsOpen] = useState(false)
  const [colWidth, setColWidth] = useState('120')
  const [rowHeight, setRowHeight] = useState('36')
  const [tableRows, setTableRows] = useState('3')
  const [tableCols, setTableCols] = useState('3')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      Table.configure({
        resizable: false,
        allowTableNodeSelection: true,
        HTMLAttributes: { class: 'lims-doc-table' },
      }),
      TableRow,
      CustomTableHeader,
      CustomTableCell,
    ],
    content: toEditorHtml(value),
    editorProps: {
      attributes: {
        id,
        class: cn(
          'prose prose-sm max-w-none focus:outline-none px-3 py-2',
          '[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_th]:border [&_td]:border-border [&_th]:border-border',
          '[&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-stone-800',
          '[&_td_p]:m-0 [&_th_p]:m-0 [&_td]:align-top [&_th]:align-middle',
          '[&_.is-editor-empty:first-child::before]:text-muted-foreground',
          fillHeight ? 'min-h-[12rem]' : minHeightClass,
        ),
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    const next = toEditorHtml(value)
    if (next === current) return
    if (!value.trim() && editor.isEmpty) return
    const normalizedCurrent = current === '<p></p>' ? '' : current
    const normalizedNext = !next.trim() || next === '<p></p>' ? '' : next
    if (normalizedCurrent === normalizedNext) return
    editor.commands.setContent(next || '', { emitUpdate: false })
  }, [editor, value])

  const runAi = useCallback(async () => {
    if (!editor) return
    setAiLoading(true)
    setAiError(null)
    try {
      const existingHtml = editor.getHTML()
      const hasTable = /<table[\s>]/i.test(existingHtml)
      const cursorInTable = editor.isActive('table')

      const catalog = await fetchManagementDocCatalog()
      const catalogText = formatCatalogForPrompt(catalog)
      if (catalog.length === 0) {
        setAiError(
          'No Level 1–4 documents found in the app register. Add Management Documents first, then retry AI.',
        )
        return
      }

      const { reply } = await sendQiAssistantMessage({
        page: 'management-docs/draft-section',
        message: buildAiMessage(
          aiOptions,
          existingHtml,
          { hasTable, inTable: cursorInTable },
          catalogText,
        ),
        context: [
          aiContext,
          `Management Documents register loaded: ${catalog.length} docs (Level 1–4).`,
          'Use ONLY Doc No / Title from that register. Never invent documents.',
          'Reply with TipTap-compatible HTML only.',
          'Tables must use <table><tbody><tr><th|td><p>…</p></th|td></tr></tbody></table>.',
          'Never return markdown tables.',
        ]
          .filter(Boolean)
          .join('\n'),
        history: [],
      })
      const html = applyAiHtmlToEditor(reply)
      if (!html.trim()) {
        throw new Error('AI returned empty content. Try again with a clearer topic.')
      }
      const replaceAll =
        editor.isEmpty ||
        aiOptions.action === 'write' ||
        aiOptions.action === 'improve' ||
        aiOptions.action === 'shorten' ||
        aiOptions.action === 'create_table' ||
        aiOptions.action === 'update_table' ||
        hasTable
      if (replaceAll) {
        editor.commands.setContent(html)
      } else {
        editor.commands.insertContent(html)
      }
      onChange(editor.getHTML())
      setAiOpen(false)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI assist failed.')
    } finally {
      setAiLoading(false)
    }
  }, [aiContext, aiOptions, editor, onChange])

  if (!editor) {
    return (
      <div className={cn('space-y-1.5', fillHeight && 'flex min-h-0 flex-1 flex-col')}>
        <Label htmlFor={id}>{label}</Label>
        <div
          className={cn(
            'rounded-md border border-input bg-muted/30',
            fillHeight ? 'min-h-0 flex-1' : minHeightClass,
          )}
        />
      </div>
    )
  }

  const inTable = editor.isActive('table')

  return (
    <div
      className={cn(
        'space-y-1.5',
        fillHeight && 'flex h-full min-h-0 flex-1 flex-col overflow-hidden',
      )}
    >
      <Label htmlFor={id} className="shrink-0">
        {label}
      </Label>
      <div
        className={cn(
          'overflow-hidden rounded-md border border-input bg-white shadow-sm',
          fillHeight && 'flex min-h-0 flex-1 flex-col',
        )}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-1.5 py-1">
          <HeadingToolbarMenu editor={editor} />
          <FormatToolbarMenu editor={editor} />
          <AlignToolbarMenu editor={editor} />
          <ListToolbarMenu editor={editor} />
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <TableToolbarMenu
            editor={editor}
            inTable={inTable}
            tableRows={tableRows}
            tableCols={tableCols}
            colWidth={colWidth}
            rowHeight={rowHeight}
            onTableRowsChange={setTableRows}
            onTableColsChange={setTableCols}
            onColWidthChange={setColWidth}
            onRowHeightChange={setRowHeight}
            onOpenSettings={() => setTableSettingsOpen(true)}
            onContentChange={() => onChange(editor.getHTML())}
          />
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <ToolbarBtn label="Undo" onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 size={14} />
          </ToolbarBtn>
          <ToolbarBtn label="Redo" onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 size={14} />
          </ToolbarBtn>
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-teal-300 text-teal-800 hover:bg-teal-50"
              aria-label="AI assist"
              onClick={() => {
                setAiError(null)
                const opts = defaultAiOptions()
                if (editor.isActive('table') || /<table[\s>]/i.test(editor.getHTML())) {
                  opts.action = 'update_table'
                }
                setAiOptions(opts)
                setAiOpen(true)
              }}
            >
              <Sparkles size={14} />
              AI
            </Button>
          </div>
        </div>

        <div
          className={cn(
            fillHeight
              ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain'
              : undefined,
          )}
        >
          <TableCellBubbleMenu
            editor={editor}
            onOpenSettings={() => setTableSettingsOpen(true)}
            onContentChange={() => onChange(editor.getHTML())}
          />
          <EditorContent editor={editor} />
        </div>
        <style>{`
          .tiptap p.is-editor-empty:first-child::before {
            color: hsl(var(--muted-foreground));
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
          }
          .tiptap { outline: none; }
          .tiptap.ProseMirror .selectedCell::after {
            background: rgba(13, 148, 136, 0.12);
            border: 1px solid rgba(13, 148, 136, 0.45);
            content: '';
            inset: 0;
            pointer-events: none;
            position: absolute;
            z-index: 2;
          }
          .tiptap.ProseMirror td,
          .tiptap.ProseMirror th {
            position: relative;
          }
        `}</style>
      </div>

      {/* Table settings window */}
      <Dialog open={tableSettingsOpen} onOpenChange={setTableSettingsOpen}>
        <DialogContent layer="stacked" className="w-[min(420px,94vw)] max-w-none gap-0 overflow-hidden p-0">
          <div className="relative bg-slate-900 px-5 py-4 text-white">
            <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="pr-8 text-left">
              <DialogTitle className="text-lg font-semibold text-white">Table Settings</DialogTitle>
              <p className="text-sm text-slate-300">Column width, row height &amp; structure</p>
            </DialogHeader>
          </div>
          <div className="space-y-4 bg-[#fafbfc] px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-col-w`}>Column / cell width</Label>
                <Input
                  id={`${id}-col-w`}
                  value={colWidth}
                  onChange={(e) => setColWidth(e.target.value)}
                  placeholder="e.g. 120 or 25%"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-row-h`}>Row / cell height</Label>
                <Input
                  id={`${id}-row-h`}
                  value={rowHeight}
                  onChange={(e) => setRowHeight(e.target.value)}
                  placeholder="e.g. 36"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-t-rows`}>New table rows</Label>
                <Input
                  id={`${id}-t-rows`}
                  type="number"
                  min={1}
                  max={10}
                  value={tableRows}
                  onChange={(e) => setTableRows(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-t-cols`}>New table columns</Label>
                <Input
                  id={`${id}-t-cols`}
                  type="number"
                  min={1}
                  max={10}
                  value={tableCols}
                  onChange={(e) => setTableCols(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Select a cell first, then Apply size. Width/height accept px (120) or percent (25%).
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-white px-5 py-3">
            <Button type="button" size="sm" variant="outline" onClick={() => setTableSettingsOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!inTable}
              onClick={() => {
                applyCellSize(editor, colWidth, rowHeight)
                onChange(editor.getHTML())
              }}
            >
              Apply to cell
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const rows = Math.min(10, Math.max(1, Number(tableRows) || 3))
                const cols = Math.min(10, Math.max(1, Number(tableCols) || 3))
                editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
                setTableSettingsOpen(false)
              }}
            >
              Insert new table
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI options window — no chat */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent layer="stacked" className="w-[min(520px,96vw)] max-w-none gap-0 overflow-hidden p-0">
          <div className="relative bg-slate-900 px-5 py-4 text-white">
            <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="pr-8 text-left">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                QI Assist
              </p>
              <DialogTitle className="text-lg font-semibold text-white">AI Writing Options</DialogTitle>
              <p className="text-sm text-slate-300">
                Text &amp; tables — returns HTML the editor can insert
              </p>
            </DialogHeader>
          </div>
          <div className="space-y-4 bg-[#fafbfc] px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                id={`${id}-ai-lang`}
                label="Language"
                value={aiOptions.language}
                onChange={(language) => setAiOptions((o) => ({ ...o, language }))}
                options={[
                  { value: 'english', label: 'English' },
                  { value: 'hindi', label: 'Hindi' },
                  { value: 'hinglish', label: 'Hinglish' },
                ]}
              />
              <SelectField
                id={`${id}-ai-tone`}
                label="Tone"
                value={aiOptions.tone}
                onChange={(tone) => setAiOptions((o) => ({ ...o, tone }))}
                options={[
                  { value: 'formal', label: 'Formal' },
                  { value: 'neutral', label: 'Neutral' },
                  { value: 'concise', label: 'Concise' },
                  { value: 'assertive', label: 'Assertive' },
                ]}
              />
              <SelectField
                id={`${id}-ai-pro`}
                label="Professional style"
                value={aiOptions.professionalism}
                onChange={(professionalism) => setAiOptions((o) => ({ ...o, professionalism }))}
                options={[
                  { value: 'professional', label: 'Professional' },
                  { value: 'technical', label: 'Technical (ISO / Lab)' },
                  { value: 'simple', label: 'Simple' },
                ]}
              />
              <SelectField
                id={`${id}-ai-action`}
                label="Action"
                value={aiOptions.action}
                onChange={(action) => setAiOptions((o) => ({ ...o, action }))}
                options={[
                  { value: 'write', label: 'Write new' },
                  { value: 'improve', label: 'Improve existing' },
                  { value: 'expand', label: 'Expand' },
                  { value: 'shorten', label: 'Shorten' },
                  { value: 'create_table', label: 'Create table' },
                  { value: 'update_table', label: 'Update existing table' },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-ai-topic`}>Topic / focus (optional)</Label>
              <Input
                id={`${id}-ai-topic`}
                value={aiOptions.topic}
                onChange={(e) => setAiOptions((o) => ({ ...o, topic: e.target.value }))}
                placeholder={
                  aiOptions.action === 'create_table' || aiOptions.action === 'update_table'
                    ? 'e.g. Records table: Name, ID, Retention, Responsibility'
                    : 'e.g. Impartiality clause for testing lab'
                }
              />
            </div>
            {(aiOptions.action === 'create_table' || aiOptions.action === 'update_table') && (
              <p className="rounded-md border border-teal-200 bg-teal-50/80 px-3 py-2 text-[12px] text-teal-900">
                Table actions use the app&apos;s <strong>Level 1–4 Management Documents</strong>{' '}
                register for Doc No / Title. Invented documents are not allowed.
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              On Generate, AI loads all Level 1 / 2 / 3 / 4 documents from the system and uses only
              those as references in text and tables.
            </p>
            {aiError ? <p className="text-sm text-destructive">{aiError}</p> : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-white px-5 py-3">
            <Button type="button" size="sm" variant="outline" onClick={() => setAiOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={aiLoading} onClick={() => void runAi()}>
              {aiLoading ? 'Generating…' : 'Generate'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Plain-text preview for table cells */
export function stripHtmlPreview(html: string, maxLen = 120): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return '—'
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text
}
