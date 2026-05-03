import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Send,
  Users,
  Activity,
  UserX,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  Link,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { startBroadcast, getBroadcastStatus } from '@/api/admin/broadcast'
import type { BroadcastFilter, BroadcastStatusResponse, ButtonColor, ButtonItem } from '@/api/admin/broadcast'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UIButton {
  id: string
  text: string
  url: string
  color: ButtonColor
}

type UIRows = UIButton[][]

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _nextId = 0
function newId() { return String(++_nextId) }

function rowsToPayload(rows: UIRows): ButtonItem[] {
  const out: ButtonItem[] = []
  rows.forEach((row, rowIdx) => {
    row.forEach((btn) => {
      out.push({ text: btn.text, url: btn.url, color: btn.color, row: rowIdx })
    })
  })
  return out
}

function totalButtons(rows: UIRows) {
  return rows.reduce((s, r) => s + r.length, 0)
}

function pluralBtn(n: number) {
  if (n === 1) return 'кнопкой'
  if (n >= 2 && n <= 4) return 'кнопками'
  return 'кнопками'
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FILTER_OPTIONS: {
  value: BroadcastFilter
  label: string
  icon: typeof Users
  description: string
}[] = [
  { value: 'all', label: 'Все пользователи', icon: Users, description: 'Все незабаненные пользователи' },
  { value: 'active', label: 'С активной подпиской', icon: Activity, description: 'Только у кого активна подписка' },
  { value: 'inactive', label: 'Без активной подписки', icon: UserX, description: 'Кто никогда не покупал или подписка истекла' },
]

const COLOR_OPTIONS: { value: ButtonColor; label: string }[] = [
  { value: '', label: 'Без цвета' },
  { value: 'primary', label: 'Синий' },
  { value: 'success', label: 'Зелёный' },
  { value: 'danger', label: 'Красный' },
]

// For the button editor color chips
const COLOR_CHIP: Record<ButtonColor, string> = {
  '': 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] border-[hsl(var(--border))]',
  primary: 'bg-blue-100 text-blue-800 border-blue-300',
  success: 'bg-green-100 text-green-800 border-green-300',
  danger: 'bg-red-100 text-red-800 border-red-300',
}

const COLOR_DOT: Record<ButtonColor, string> = {
  '': 'bg-[hsl(var(--muted-foreground))]',
  primary: 'bg-blue-500',
  success: 'bg-green-500',
  danger: 'bg-red-500',
}

// Telegram-accurate button colours (Bot API 9.4)
const TG_BTN: Record<ButtonColor, { bg: string; color: string }> = {
  '': { bg: '#F4F4F5', color: '#3A3A3A' },
  primary: { bg: '#3390EC', color: '#FFFFFF' },
  success: { bg: '#4CAF50', color: '#FFFFFF' },
  danger: { bg: '#EF4040', color: '#FFFFFF' },
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="w-full bg-[hsl(var(--muted))] rounded-full h-2">
      <div
        className="bg-[hsl(var(--primary))] h-2 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─── ButtonEditor ─────────────────────────────────────────────────────────────

function ButtonEditor({
  btn,
  onUpdate,
  onRemove,
}: {
  btn: UIButton
  onUpdate: (patch: Partial<UIButton>) => void
  onRemove: () => void
}) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Текст кнопки"
          value={btn.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          className="flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]"
        />
        <button
          type="button"
          onClick={onRemove}
          title="Удалить кнопку"
          className="flex items-center justify-center w-8 h-8 rounded-md text-[hsl(var(--muted-foreground))] hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Link size={13} className="text-[hsl(var(--muted-foreground))] shrink-0" />
        <input
          type="url"
          placeholder="https://..."
          value={btn.url}
          onChange={(e) => onUpdate({ url: e.target.value })}
          className="flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]"
        />
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {COLOR_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onUpdate({ color: value })}
            title={label}
            className={[
              'flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium transition-all',
              btn.color === value
                ? `${COLOR_CHIP[value]} ring-2 ring-offset-1 ring-[hsl(var(--primary))]`
                : `${COLOR_CHIP[value]} opacity-60 hover:opacity-100`,
            ].join(' ')}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${COLOR_DOT[value]}`} />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── RowEditor ────────────────────────────────────────────────────────────────

function RowEditor({
  rowIndex,
  row,
  totalRows,
  onMoveUp,
  onMoveDown,
  onAddButton,
  onUpdateButton,
  onRemoveButton,
  onRemoveRow,
}: {
  rowIndex: number
  row: UIButton[]
  totalRows: number
  onMoveUp: () => void
  onMoveDown: () => void
  onAddButton: () => void
  onUpdateButton: (btnId: string, patch: Partial<UIButton>) => void
  onRemoveButton: (btnId: string) => void
  onRemoveRow: () => void
}) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)]">
        <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide flex-1">
          Строка {rowIndex + 1}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onMoveUp} disabled={rowIndex === 0}
            title="Поднять строку"
            className="p-1 rounded hover:bg-[hsl(var(--muted))] disabled:opacity-30 transition-colors">
            <ChevronUp size={14} />
          </button>
          <button type="button" onClick={onMoveDown} disabled={rowIndex === totalRows - 1}
            title="Опустить строку"
            className="p-1 rounded hover:bg-[hsl(var(--muted))] disabled:opacity-30 transition-colors">
            <ChevronDown size={14} />
          </button>
          <button type="button" onClick={onRemoveRow} title="Удалить строку"
            className="p-1 rounded hover:bg-red-50 text-[hsl(var(--muted-foreground))] hover:text-red-600 transition-colors ml-1">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2">
        {row.map((btn) => (
          <ButtonEditor
            key={btn.id}
            btn={btn}
            onUpdate={(patch) => onUpdateButton(btn.id, patch)}
            onRemove={() => onRemoveButton(btn.id)}
          />
        ))}
        <button type="button" onClick={onAddButton}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] transition-colors">
          <Plus size={14} />
          Добавить кнопку в строку
        </button>
      </div>
    </div>
  )
}

// ─── MessagePreview ──────────────────────────────────────────────────────────

function MessagePreview({ text, rows }: { text: string; rows: UIRows }) {
  // Convert newlines to <br> for HTML preview
  const html = text.replace(/\n/g, '<br>')
  const hasText = text.trim().length > 0
  const hasButtons = rows.some((r) => r.some((b) => b.text.trim()))
  const isEmpty = !hasText && !hasButtons

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)]">
        <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
          Превью сообщения
        </p>
      </div>

      {/* Telegram chat simulation */}
      <div className="p-3 min-h-48" style={{ background: 'linear-gradient(135deg, #7b9eb5 0%, #6a8fa8 100%)' }}>
        {isEmpty ? (
          <p className="text-white/60 text-sm text-center mt-8">Начните вводить текст…</p>
        ) : (
          /* Bot message bubble — incoming style (left-aligned, white) */
          <div className="max-w-[92%] rounded-2xl rounded-tl-none bg-white shadow-md overflow-hidden">
            {/* Text */}
            {hasText && (
              <div
                className="px-3 pt-3 pb-2 text-sm text-gray-900 leading-relaxed break-words
                  [&_b]:font-bold [&_strong]:font-bold
                  [&_i]:italic [&_em]:italic
                  [&_u]:underline [&_ins]:underline
                  [&_s]:line-through [&_strike]:line-through [&_del]:line-through
                  [&_code]:bg-gray-100 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8em]
                  [&_pre]:bg-gray-100 [&_pre]:rounded-lg [&_pre]:p-2.5 [&_pre]:my-1 [&_pre]:font-mono [&_pre]:text-xs [&_pre]:overflow-x-auto
                  [&_a]:text-[#3390EC] [&_a]:underline
                  [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:my-1 [&_blockquote]:text-gray-600"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}

            {/* Inline keyboard */}
            {hasButtons && (
              <div className="p-1.5 space-y-1">
                {rows.map((row, ri) => {
                  const visible = row.filter((b) => b.text.trim())
                  if (!visible.length) return null
                  return (
                    <div key={ri} className="flex gap-1">
                      {visible.map((btn) => {
                        const style = TG_BTN[btn.color]
                        return (
                          <div
                            key={btn.id}
                            className="flex-1 py-2 px-2 rounded-lg text-sm font-medium text-center truncate"
                            style={{ backgroundColor: style.bg, color: style.color }}
                            title={btn.url || undefined}
                          >
                            {btn.text}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
          Цвета кнопок отображаются в Telegram (Bot API 9.4+)
        </p>
      </div>
    </div>
  )
}

// ─── SendBlock ────────────────────────────────────────────────────────────────

function SendBlock({
  confirming,
  canSend,
  isPending,
  btnCount,
  filterLabel,
  onSend,
  onConfirm,
  onCancel,
  error,
}: {
  confirming: boolean
  canSend: boolean
  isPending: boolean
  btnCount: number
  filterLabel: string
  onSend: () => void
  onConfirm: () => void
  onCancel: () => void
  error: string | null
}) {
  if (!confirming) {
    return (
      <div className="space-y-2">
        <button
          onClick={onSend}
          disabled={!canSend}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={16} />
          Отправить рассылку
        </button>
        {error && (
          <p className="text-xs text-red-600 text-center">
            Ошибка: {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
        <AlertCircle size={16} />
        Подтвердите отправку
      </div>
      <p className="text-xs text-amber-700 leading-relaxed">
        Сообщение{btnCount > 0 && ` с ${btnCount} ${pluralBtn(btnCount)}`} будет
        отправлено получателям: <b>{filterLabel}</b>. Это действие нельзя отменить.
      </p>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={isPending}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition disabled:opacity-50"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Да, отправить
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-[hsl(var(--border))] text-sm font-medium hover:bg-[hsl(var(--muted))] transition"
        >
          Отмена
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function BroadcastPage() {
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<BroadcastFilter>('all')
  const [rows, setRows] = useState<UIRows>([])
  const [broadcastId, setBroadcastId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  // ── Status polling ─────────────────────────────────────────────────────────

  const { data: statusData } = useQuery<BroadcastStatusResponse>({
    queryKey: ['admin', 'broadcast-status', broadcastId],
    queryFn: () => getBroadcastStatus(broadcastId!),
    enabled: !!broadcastId,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'completed' || s === 'failed' ? false : 2000
    },
  })

  const mutation = useMutation({
    mutationFn: () => startBroadcast(text, filter, rowsToPayload(rows)),
    onSuccess: (data) => {
      setBroadcastId(data.broadcast_id)
      setConfirming(false)
    },
  })

  // ── Row/button management ──────────────────────────────────────────────────

  function addRow() {
    setRows((prev) => [...prev, [{ id: newId(), text: '', url: '', color: '' }]])
  }

  function addButtonToRow(rowIdx: number) {
    setRows((prev) =>
      prev.map((row, i) => (i === rowIdx ? [...row, { id: newId(), text: '', url: '', color: '' }] : row)),
    )
  }

  function updateButton(rowIdx: number, btnId: string, patch: Partial<UIButton>) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === rowIdx ? row.map((b) => (b.id === btnId ? { ...b, ...patch } : b)) : row,
      ),
    )
  }

  function removeButton(rowIdx: number, btnId: string) {
    setRows((prev) => {
      const next = prev.map((row, i) => (i === rowIdx ? row.filter((b) => b.id !== btnId) : row))
      return next.filter((row) => row.length > 0)
    })
  }

  function removeRow(rowIdx: number) {
    setRows((prev) => prev.filter((_, i) => i !== rowIdx))
  }

  function moveRow(rowIdx: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev]
      const target = rowIdx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[rowIdx], next[target]] = [next[target], next[rowIdx]]
      return next
    })
  }

  // ── State ──────────────────────────────────────────────────────────────────

  const isRunning = statusData?.status === 'pending' || statusData?.status === 'running'
  const isCompleted = statusData?.status === 'completed'
  const isFailed = statusData?.status === 'failed'
  const canSend = text.trim().length > 0 && !mutation.isPending && !isRunning
  const btnCount = totalButtons(rows)
  const filterLabel = FILTER_OPTIONS.find((o) => o.value === filter)?.label ?? ''

  function handleReset() {
    setBroadcastId(null)
    mutation.reset()
    setText('')
    setFilter('all')
    setRows([])
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Рассылка</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          Отправить HTML-сообщение с кнопками через Telegram-бот
        </p>
      </div>

      {/* ── Status block (full width) ── */}
      {broadcastId && statusData && (
        <div
          className={[
            'max-w-xl rounded-xl border p-5 space-y-3',
            isCompleted ? 'border-green-300 bg-green-50'
              : isFailed ? 'border-red-300 bg-red-50'
              : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]',
          ].join(' ')}
        >
          <div className="flex items-center gap-2 font-semibold">
            {isCompleted && <CheckCircle2 size={18} className="text-green-600" />}
            {isFailed && <AlertCircle size={18} className="text-red-600" />}
            {isRunning && <Loader2 size={18} className="animate-spin text-[hsl(var(--primary))]" />}
            <span>
              {isCompleted && 'Рассылка завершена'}
              {isFailed && 'Ошибка рассылки'}
              {statusData.status === 'pending' && 'Ожидание…'}
              {statusData.status === 'running' && 'Отправка…'}
            </span>
          </div>
          {statusData.total > 0 && (
            <>
              <ProgressBar value={statusData.sent + statusData.failed} max={statusData.total} />
              <div className="flex gap-6 text-sm">
                <span>Всего: <b>{statusData.total}</b></span>
                <span className="text-green-700">Отправлено: <b>{statusData.sent}</b></span>
                {statusData.failed > 0 && (
                  <span className="text-red-700">Ошибок: <b>{statusData.failed}</b></span>
                )}
              </div>
            </>
          )}
          {statusData.error && <p className="text-sm text-red-700">{statusData.error}</p>}
          {(isCompleted || isFailed) && (
            <button
              onClick={handleReset}
              className="text-sm text-[hsl(var(--primary))] hover:underline"
            >
              Новая рассылка
            </button>
          )}
        </div>
      )}

      {/* ── Two-column form ── */}
      {!broadcastId && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">

          {/* Left: form */}
          <div className="space-y-5">

            {/* Text */}
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 space-y-3">
              <label className="block text-sm font-semibold text-[hsl(var(--foreground))]">
                Текст сообщения
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Поддерживается HTML: <b>жирный</b>, <i>курсив</i>, <u>подчёркнутый</u>, <a href='...'>ссылка</a>, <code>код</code>"
                rows={8}
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)] resize-y"
              />
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{text.length} символов</p>
            </div>

            {/* Button builder */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  Кнопки{btnCount > 0 && ` (${btnCount})`}
                </p>
                <button
                  type="button"
                  onClick={addRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(var(--border))] text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
                >
                  <Plus size={14} />
                  Добавить строку
                </button>
              </div>

              {rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
                  Нажмите «Добавить строку», чтобы добавить кнопки к сообщению
                </div>
              ) : (
                rows.map((row, rowIdx) => (
                  <RowEditor
                    key={rowIdx}
                    rowIndex={rowIdx}
                    row={row}
                    totalRows={rows.length}
                    onMoveUp={() => moveRow(rowIdx, -1)}
                    onMoveDown={() => moveRow(rowIdx, 1)}
                    onAddButton={() => addButtonToRow(rowIdx)}
                    onUpdateButton={(btnId, patch) => updateButton(rowIdx, btnId, patch)}
                    onRemoveButton={(btnId) => removeButton(rowIdx, btnId)}
                    onRemoveRow={() => removeRow(rowIdx)}
                  />
                ))
              )}
            </div>

            {/* Filter */}
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 space-y-3">
              <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Получатели</p>
              <div className="space-y-2">
                {FILTER_OPTIONS.map(({ value, label, icon: Icon, description }) => (
                  <label
                    key={value}
                    className={[
                      'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                      filter === value
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)]'
                        : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="filter"
                      value={value}
                      checked={filter === value}
                      onChange={() => setFilter(value)}
                      className="accent-[hsl(var(--primary))]"
                    />
                    <Icon size={16} className="text-[hsl(var(--muted-foreground))] shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

          </div>{/* /Left */}

          {/* Right: preview + send */}
          <div className="xl:sticky xl:top-6 space-y-4">
            <MessagePreview text={text} rows={rows} />
            <SendBlock
              confirming={confirming}
              canSend={canSend}
              isPending={mutation.isPending}
              btnCount={btnCount}
              filterLabel={filterLabel}
              onSend={() => setConfirming(true)}
              onConfirm={() => mutation.mutate()}
              onCancel={() => setConfirming(false)}
              error={mutation.isError ? ((mutation.error as Error)?.message ?? 'Неизвестная ошибка') : null}
            />
          </div>

        </div>
      )}
    </div>
  )
}
