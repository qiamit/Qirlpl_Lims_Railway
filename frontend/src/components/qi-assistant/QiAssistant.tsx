import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, FileUp, Loader2, Send, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IsCodeSearchPicker } from './IsCodeSearchPicker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabaseClient'
import { AI_SETTINGS_SINGLETON_ID } from '@/features/settings/ai-settings/types'
import {
  sendQiAssistantMessage,
  validateAssistantPdfFile,
  type QiAssistantActionResult,
  type QiChatMessage,
} from './qiAssistantApi'
import {
  filterSkillsForTrigger,
  parseSkillTrigger,
  type AiSkillPick,
  type SkillTriggerMatch,
} from './skillTrigger'
import { cn } from '@/lib/utils'

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function assistantDialogTitle(activeRecordTable?: string, isCodeId?: string, page?: string): string {
  if (page === 'samples/receiving') return 'Sample Receiving Assistant'
  if (page === 'nabl-scope') return 'NABL Scope Assistant'
  if (activeRecordTable === 'test_parameters') return 'Test Parameter Assistant'
  if (activeRecordTable === 'is_codes' || isCodeId) return 'IS Code Assistant'
  return 'QI Assistant'
}

export type QiAssistantIsCodeOption = { id: string; label: string; displayCode?: string }

export function QiAssistant({
  page,
  pageTitle,
  contextSummary,
  suggestedQuestions = [],
  isCodeId,
  isCodeOptions,
  activeRecordId,
  activeRecordTable,
  welcomeMessage,
  triggerVariant = 'default',
  onDataChanged,
  enablePdfImport = false,
  pdfAttachHint = 'IS standard PDF',
}: {
  page: string
  pageTitle: string
  contextSummary: string
  suggestedQuestions?: string[]
  isCodeId?: string
  /** Header assistant: user picks IS code to load PDFs for test-parameter import */
  isCodeOptions?: QiAssistantIsCodeOption[]
  activeRecordId?: string
  activeRecordTable?: string
  welcomeMessage?: string
  triggerVariant?: 'default' | 'icon'
  onDataChanged?: () => void
  enablePdfImport?: boolean
  /** Label for PDF attach button, e.g. "test request PDF" */
  pdfAttachHint?: string
}) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<QiChatMessage[]>([])
  const [agentCrudEnabled, setAgentCrudEnabled] = useState(true)
  const [skills, setSkills] = useState<AiSkillPick[]>([])
  const [selectedSkill, setSelectedSkill] = useState<AiSkillPick | null>(null)
  const [selectedIsCodeId, setSelectedIsCodeId] = useState('')
  const [attachedPdf, setAttachedPdf] = useState<File | null>(null)
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)
  const [skillHighlight, setSkillHighlight] = useState(0)
  const [caretPos, setCaretPos] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const skillTrigger = useMemo(
    () => (skillPickerOpen ? parseSkillTrigger(input, caretPos) : null),
    [skillPickerOpen, input, caretPos],
  )

  const filteredSkills = useMemo(() => {
    if (!skillTrigger) return skills
    return filterSkillsForTrigger(skills, skillTrigger.filter)
  }, [skills, skillTrigger])

  const defaults = [
    'How do I add a new client?',
    'What does balance type Dr and Cr mean?',
    'Summarize the clients shown in the list',
  ]

  const prompts = suggestedQuestions.length > 0 ? suggestedQuestions : defaults

  const showIsCodePicker = Boolean(isCodeOptions?.length) && !isCodeId
  const effectiveIsCodeId = isCodeId ?? (selectedIsCodeId || undefined)
  const selectedIsCodeLabel = isCodeOptions?.find((o) => o.id === selectedIsCodeId)?.label

  useEffect(() => {
    if (!open) return
    void Promise.all([
      supabase
        .from('ai_settings')
        .select('agent_crud_enabled')
        .eq('id', AI_SETTINGS_SINGLETON_ID)
        .maybeSingle(),
      supabase
        .from('ai_skills')
        .select('id, name, description, trigger_keywords, sort_order')
        .eq('is_enabled', true)
        .order('sort_order', { ascending: true }),
    ]).then(([settingsRes, skillsRes]) => {
      if (settingsRes.data && typeof settingsRes.data.agent_crud_enabled === 'boolean') {
        setAgentCrudEnabled(settingsRes.data.agent_crud_enabled)
      }
      setSkills((skillsRes.data ?? []) as AiSkillPick[])
    })
  }, [open])

  useEffect(() => {
    if (!open) {
      setSelectedSkill(null)
      setSelectedIsCodeId('')
      setAttachedPdf(null)
      setSkillPickerOpen(false)
      setInput('')
      return
    }
    if (messages.length > 0) return
    const pdfNote = enablePdfImport
      ? ' Use the **PDF** button to attach a file, then type your command and press **Send** (nothing runs until you send).'
      : ''
    const crudNote = agentCrudEnabled
      ? ' I can **create, update, and delete** records in this module when you ask.'
      : ''
    const isCodeNote = showIsCodePicker
      ? ' Pick an **IS Code** below so I can read its uploaded PDFs.'
      : ''
    const skillNote = ' Tap **!** or type **!** in the box to pick a **Skill** for your next message.'
    const intro =
      welcomeMessage ??
      `Hello! I'm **QI Assistant** on **${pageTitle}**. Ask me about this screen or the data shown here.${crudNote}${pdfNote}${isCodeNote}${skillNote}`
    setMessages([{ id: newId(), role: 'assistant', content: intro }])
  }, [open, messages.length, pageTitle, welcomeMessage, agentCrudEnabled, enablePdfImport, showIsCodePicker])

  const openSkillPicker = () => {
    const next = input.includes('!') ? input : `${input}${input && !input.endsWith(' ') ? ' ' : ''}!`
    setInput(next)
    const pos = next.length
    setCaretPos(pos)
    setSkillPickerOpen(true)
    setSkillHighlight(0)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const appendAssistantResult = (reply: string, actionsExecuted?: QiAssistantActionResult[]) => {
    let content = reply
    if (actionsExecuted?.length) {
      const lines = actionsExecuted.map(
        (a) => `${a.ok ? '✓' : '✗'} ${a.operation} **${a.table}**${a.id ? ` \`${a.id}\`` : ''}: ${a.message}`,
      )
      content = `${reply}\n\n**Database changes:**\n${lines.join('\n')}`
      if (actionsExecuted.some((a) => a.ok)) onDataChanged?.()
    }
    setMessages((prev) => [...prev, { id: newId(), role: 'assistant', content }])
  }

  const syncSkillPicker = (text: string, pos: number) => {
    setCaretPos(pos)
    const trigger = parseSkillTrigger(text, pos)
    setSkillPickerOpen(Boolean(trigger))
    if (trigger) setSkillHighlight(0)
  }

  const applySkillSelection = (skill: AiSkillPick, trigger: SkillTriggerMatch | null) => {
    setSelectedSkill(skill)
    setSkillPickerOpen(false)
    if (trigger) {
      const before = input.slice(0, trigger.start)
      const after = input.slice(trigger.end)
      const next = `${before}${after}`.replace(/^\s+/, '')
      setInput(next)
    }
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const handlePdfAttach = (file: File) => {
    try {
      validateAssistantPdfFile(file)
      setAttachedPdf(file)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid PDF')
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return

      if (
        showIsCodePicker &&
        !effectiveIsCodeId &&
        /\b(import|extract|add|create|populate|pull)\b/i.test(trimmed) &&
        /\b(test|parameter|clause|pdf|standard)\b/i.test(trimmed)
      ) {
        setError('Select an IS Code from the dropdown first so I can read its PDFs.')
        return
      }

      setError(null)
      setInput('')
      setSkillPickerOpen(false)

      const skillTag = selectedSkill ? `[Skill: ${selectedSkill.name}] ` : ''
      const pdfTag = attachedPdf ? `📎 Attached: ${attachedPdf.name}\n\n` : ''
      const userMsg: QiChatMessage = {
        id: newId(),
        role: 'user',
        content: `${skillTag}${pdfTag}${trimmed}`,
      }
      const skillId = selectedSkill?.id
      const pdfFile = attachedPdf
      setSelectedSkill(null)
      setAttachedPdf(null)

      setMessages((prev) => [...prev, userMsg])
      setLoading(true)

      try {
        const history = [...messages, userMsg]
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }))

        const { reply, actionsExecuted } = await sendQiAssistantMessage({
          page,
          message: trimmed,
          context: contextSummary,
          isCodeId: effectiveIsCodeId,
          activeRecordId,
          activeRecordTable,
          activeSkillId: skillId,
          attachedPdf: pdfFile ?? undefined,
          history,
        })

        appendAssistantResult(reply, actionsExecuted)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to get a response'
        setError(msg)
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: 'assistant', content: `Sorry, I could not answer that. ${msg}` },
        ])
      } finally {
        setLoading(false)
      }
    },
    [activeRecordId, activeRecordTable, attachedPdf, contextSummary, effectiveIsCodeId, loading, messages, page, selectedSkill],
  )

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (skillPickerOpen && filteredSkills.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSkillHighlight((i) => (i + 1) % filteredSkills.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSkillHighlight((i) => (i - 1 + filteredSkills.length) % filteredSkills.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const skill = filteredSkills[skillHighlight]
        if (skill) applySkillSelection(skill, skillTrigger)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSkillPickerOpen(false)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const skill = filteredSkills[skillHighlight]
        if (skill) applySkillSelection(skill, skillTrigger)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(input)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerVariant === 'icon' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Ask AI Assistant about ${pageTitle}`}
          >
            <Sparkles size={14} className="text-primary" />
          </Button>
        ) : (
          <Button type="button" variant="outline" className="gap-2" aria-label="Open QI Assistant">
            <Sparkles size={16} className="text-primary" />
            QI Assistant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot size={20} className="text-primary" />
            {assistantDialogTitle(activeRecordTable, effectiveIsCodeId, page)}
          </DialogTitle>
          <DialogDescription>
            {page === 'samples/receiving' && enablePdfImport
              ? `${pageTitle} — attach Test Request PDF, then ask to register the sample`
              : showIsCodePicker
              ? `${pageTitle} — select IS Code, ! for skills, then ask to import test parameters from PDF`
              : activeRecordTable === 'test_parameters'
                ? `${pageTitle} — type ! to activate a skill; Q&A and edits`
                : effectiveIsCodeId
                  ? `${pageTitle} — type ! to activate a skill; PDF Q&A and edits`
                  : `${pageTitle} — type ! for skills; Q&A and data changes`}
          </DialogDescription>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4 min-h-[280px] max-h-[50vh]">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'rounded-lg px-3 py-2 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'ml-8 bg-primary text-primary-foreground'
                  : 'mr-4 bg-muted text-foreground',
              )}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
          {loading && (
            <div className="mr-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              {effectiveIsCodeId && page !== 'samples/receiving'
                ? 'Reading IS PDFs and thinking…'
                : attachedPdf
                  ? 'Reading test request and thinking…'
                  : 'Working…'}
            </div>
          )}
        </div>

        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
            {prompts.map((q) => (
              <button
                key={q}
                type="button"
                className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => void sendMessage(q)}
                disabled={loading}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {error && <p className="px-5 text-xs text-destructive">{error}</p>}

        <div className="relative border-t border-border">
          {skillPickerOpen && (
            <div
              className="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-md"
              role="listbox"
              aria-label="Select AI skill"
            >
              {filteredSkills.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No skills match. Add skills in Lab Settings → AI Settings → Skills.
                </p>
              ) : (
                filteredSkills.map((skill, idx) => (
                  <button
                    key={skill.id}
                    type="button"
                    role="option"
                    aria-selected={idx === skillHighlight}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors',
                      idx === skillHighlight ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/80',
                    )}
                    onMouseEnter={() => setSkillHighlight(idx)}
                    onClick={() => applySkillSelection(skill, skillTrigger)}
                  >
                    <span className="font-medium">{skill.name}</span>
                    {skill.description && (
                      <span className="text-xs text-muted-foreground line-clamp-1">{skill.description}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {(selectedSkill || attachedPdf || (showIsCodePicker && selectedIsCodeId)) && (
            <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
              {showIsCodePicker && selectedIsCodeId && selectedIsCodeLabel && (
                <Badge variant="outline" className="gap-1 pr-1 font-normal max-w-full">
                  <span className="truncate">IS: {selectedIsCodeLabel}</span>
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-muted shrink-0"
                    aria-label="Clear selected IS code"
                    onClick={() => {
                      setSelectedIsCodeId('')
                    }}
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
              {selectedSkill && (
                <Badge variant="secondary" className="gap-1 pr-1 font-normal">
                  Skill: {selectedSkill.name}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-muted"
                    aria-label="Clear selected skill"
                    onClick={() => setSelectedSkill(null)}
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
              {attachedPdf && (
                <Badge variant="outline" className="gap-1 pr-1 font-normal">
                  PDF: {attachedPdf.name}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-muted"
                    aria-label="Remove attached PDF"
                    onClick={() => setAttachedPdf(null)}
                  >
                    <X size={12} />
                  </button>
                </Badge>
              )}
              <span className="text-xs text-muted-foreground w-full sm:w-auto">
                {attachedPdf ? 'Type a command below, then Send' : 'Active for next message'}
              </span>
            </div>
          )}

          {showIsCodePicker && (
            <div className="px-4 pt-3">
              <IsCodeSearchPicker
                options={isCodeOptions ?? []}
                valueId={selectedIsCodeId}
                onChange={setSelectedIsCodeId}
              />
            </div>
          )}

          <div className="flex gap-2 p-4">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0 self-end font-semibold"
              aria-label="Pick AI skill"
              disabled={loading}
              title="Pick skill (!)"
              onClick={openSkillPicker}
            >
              !
            </Button>
            {enablePdfImport && (
              <>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  aria-hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handlePdfAttach(f)
                    if (e.target) e.target.value = ''
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 self-end"
                  aria-label={`Upload ${pdfAttachHint} to process with AI`}
                  disabled={loading}
                  title={`Attach ${pdfAttachHint} — then type a command and Send`}
                  onClick={() => pdfInputRef.current?.click()}
                >
                  <FileUp size={18} />
                </Button>
              </>
            )}
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                syncSkillPicker(e.target.value, e.target.selectionStart ?? e.target.value.length)
              }}
              onClick={(e) => syncSkillPicker(input, e.currentTarget.selectionStart ?? input.length)}
              onKeyUp={(e) => syncSkillPicker(input, e.currentTarget.selectionStart ?? input.length)}
              placeholder={
                attachedPdf
                  ? page === 'samples/receiving'
                    ? 'e.g. Register this test request as a new sample…'
                    : 'Type command for attached PDF, then Send…'
                  : showIsCodePicker
                    ? 'Select IS Code, pick ! skill, ask to import test parameters…'
                    : page === 'samples/receiving'
                      ? 'Attach Test Request PDF, then ask to add sample…'
                      : 'Ask QI Assistant… (type ! for skills)'
              }
              className="min-h-[44px] max-h-28 resize-none"
              rows={1}
              onKeyDown={handleInputKeyDown}
              disabled={loading}
              aria-label="Message to QI Assistant"
              aria-expanded={skillPickerOpen}
              aria-autocomplete="list"
            />
            <Button
              type="button"
              size="icon"
              className="shrink-0 self-end"
              aria-label="Send message"
              disabled={loading || !input.trim()}
              onClick={() => void sendMessage(input)}
            >
              <Send size={18} />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
