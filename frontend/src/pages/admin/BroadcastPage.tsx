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

const COLOR_CLASSES: Record<ButtonColor, string> = {
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

// ─── Sub-components ──────────────────────────────────────────────────────────

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

// ─── Button editor for a single button ───────────────────────────────────────

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

      {/* Color picker */}
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
                ? `${COLOR_CLASSES[value]} ring-2 ring-offset-1 ring-[hsl(var(--primary))]`
                : `${COLOR_CLASSES[value]} opacity-60 hover:opacity-100`,
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

// ─── Row editor ───────────────────────────────────────────────────────────────

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
      {/* Row header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)]">
        <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide flex-1">
          Строка {rowIndex + 1}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={rowIndex === 0}
            title="Поднять строку"
            className="p-1 rounded hover:bg-[hsl(var(--muted))] disabled:opacity-30 transition-colors"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={rowIndex === totalRows - 1}
            title="Опустить строку"
            className="p-1 rounded hover:bg-[hsl(var(--muted))] disabled:opacity-30 transition-colors"
          >
            <ChevronDown size={14} />
          </button>
          <button
            type="button"
            onClick={onRemoveRow}
            title="Удалить строку"
            className="p-1 rounded hover:bg-red-50 text-[hsl(var(--muted-foreground))] hover:text-red-600 transition-colors ml-1"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Buttons in this row */}
      <div className="p-3 flex flex-col gap-2">
        {row.map((btn) => (
          <ButtonEditor
            key={btn.id}
            btn={btn}
            onUpdate={(patch) => onUpdateButton(btn.id, patch)}
            onRemove={() => onRemoveButton(btn.id)}
          />
        ))}

        <button
          type="button"
          onClick={onAddButton}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] transition-colors"
        >
          <Plus size={14} />
          Добавить кнопку в строку
        </button>
      </div>
    </div>
  )
}

// ─── Telegram keyboard preview ────────────────────────────────────────────────

function KeyboardPreview({ rows }: { rows: UIRows }) {
  const filled = rows.filter((r) => r.some((b) => b.text.trim()))
  if (filled.length === 0) return null

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-2">
      <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
        Превью клавиатуры
      </p>
      <div className="space-y-1.5">
        {filled.map((row, ri) => {
          const visibleBtns = row.filter((b) => b.text.trim())
          if (!visibleBtns.length) return null
          return (
            <div key={ri} className="flex gap-1.5">
              {visibleBtns.map((btn) => (
                <div
                  key={btn.id}
                  className={[
                    'flex-1 px-3 py-2 rounded-lg border text-center text-sm font-medium truncate',
                    COLOR_CLASSES[btn.color],
                  ].join(' ')}
                  title={btn.url || undefined}
                >
                  {btn.text || '…'}
                </div>
              ))}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
        Цвета отображаются в Telegram (Bot API 9.4+): синий — primary, зелёный — success, красный — danger
      </p>
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

  // ── Status polling ────────────────────────────────────────────────────────

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

  // ── Row/button management ─────────────────────────────────────────────────

  function addRow() {
    setRows((prev) => [...prev, [{ id: newId(), text: '', url: '', color: '' }]])
  }

  function addButtonToRow(rowIdx: number) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === rowIdx ? [...row, { id: newId(), text: '', url: '', color: '' }] : row,
      ),
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
      const next = prev.map((row, i) =>
        i === rowIdx ? row.filter((b) => b.id !== btnId) : row,
      )
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

  // ── State flags ───────────────────────────────────────────────────────────

  const isRunning = statusData?.status === 'pending' || statusData?.status === 'running'
  const isCompleted = statusData?.status === 'completed'
  const isFailed = statusData?.status === 'failed'
  const canSend = text.trim().length > 0 && !mutation.isPending && !isRunning

  function handleReset() {
    setBroadcastId(null)
    mutation.reset()
    setText('')
    setFilter('all')
    setRows([])
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Рассылка</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          Отправить HTML-сообщение с кнопками через Telegram-бот
        </p>
      </div>

      {/* ── Status block ── */}
      {broadcastId && statusData && (
        <div
          className={[
            'rounded-xl border p-5 space-y-3',
            isCompleted
              ? 'border-green-300 bg-green-50'
              : isFailed
              ? 'border-red-300 bg-red-50'
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
              className="mt-1 text-sm text-[hsl(var(--primary))] hover:underline"
            >
              Новая рассылка
            </button>
          )}
        </div>
      )}

      {/* ── Form ── */}
      {!broadcastId && (
        <>
          {/* Text */}
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 space-y-3">
            <label className="block text-sm font-semibold text-[hsl(var(--foreground))]">
              Текст сообщения
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Введите текст рассылки. Поддерживается HTML: <b>жирный</b>, <i>курсив</i>, <a href='...'>ссылка</a>"
              rows={7}
              className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)] resize-y"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{text.length} символов</p>
          </div>

          {/* Buttons builder */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                Кнопки{rows.length > 0 && ` (${rows.reduce((s, r) => s + r.length, 0)})`}
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

            {rows.length === 0 && (
              <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
                Нажмите «Добавить строку», чтобы добавить кнопки к сообщению
              </div>
            )}

            {rows.map((row, rowIdx) => (
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
            ))}

            {/* Keyboard preview */}
            {rows.length > 0 && <KeyboardPreview rows={rows} />}
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

          {/* Send / Confirm */}
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={!canSend}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={16} />
              Отправить рассылку
            </button>
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-800 font-semibold">
                <AlertCircle size={18} />
                Подтвердите отправку
              </div>
              <p className="text-sm text-amber-700">
                Сообщение{rows.length > 0 && ` с ${rows.reduce((s, r) => s + r.length, 0)} кнопк${rows.reduce((s, r) => s + r.length, 0) === 1 ? 'ой' : 'ами'}`} будет отправлено получателям:{' '}
                <b>{FILTER_OPTIONS.find((o) => o.value === filter)?.label}</b>.
                Это действие нельзя отменить.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition disabled:opacity-50"
                >
                  {mutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  Да, отправить
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="px-5 py-2 rounded-lg border border-[hsl(var(--border))] text-sm font-medium hover:bg-[hsl(var(--muted))] transition"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {mutation.isError && (
            <p className="text-sm text-red-600">
              Ошибка: {(mutation.error as Error)?.message ?? 'Неизвестная ошибка'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
