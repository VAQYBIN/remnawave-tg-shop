import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AppShell } from '@/components/layout/AppShell'
import { NewsFeed } from '@/components/news/NewsFeed'
import { getNews, getNewsStreamUrl, type ChannelPost } from '@/api/news'
import { Newspaper } from 'lucide-react'

const PAGE_LIMIT = 5

export function NewsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [allPosts, setAllPosts] = useState<ChannelPost[]>([])
  const [total, setTotal] = useState(0)

  const { data, isLoading, error } = useQuery({
    queryKey: ['news', page],
    queryFn: () => getNews(page, PAGE_LIMIT),
    staleTime: 30_000,
  })

  // Sync local state from query data — runs both on fresh fetch AND on cache hit
  // (when component remounts, queryFn may not be called but `data` is still available)
  useEffect(() => {
    if (!data) return
    if (page === 1) {
      setAllPosts(data.posts)
      setTotal(data.total)
    } else {
      setAllPosts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id))
        const newPosts = data.posts.filter((p) => !existingIds.has(p.id))
        return [...prev, ...newPosts]
      })
      setTotal(data.total)
    }
  }, [data, page])

  // SSE — real-time updates. Managed here so we have access to queryClient.
  useEffect(() => {
    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      es = new EventSource(getNewsStreamUrl())

      es.onmessage = (event) => {
        try {
          const post: ChannelPost = JSON.parse(event.data)
          setAllPosts((prev) => {
            if (prev.some((p) => p.id === post.id)) return prev
            return [post, ...prev]
          })
          setTotal((n) => n + 1)
        } catch {
          // ignore parse errors
        }
      }

      es.onerror = () => {
        // SSE connection dropped — close current instance and refetch from API
        // so any posts published during the gap are not missed.
        es?.close()
        queryClient.invalidateQueries({ queryKey: ['news', 1] })

        // Reconnect after a short delay (browser also auto-reconnects,
        // but we control the timing to avoid duplicate connections)
        reconnectTimer = setTimeout(() => {
          connect()
        }, 3_000)
      }
    }

    connect()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [queryClient])

  const hasMore = allPosts.length < total

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('news_title')}</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">
            {t('news_subtitle')}
          </p>
        </div>

        {/* Skeleton — only on initial load before any posts arrive */}
        {isLoading && page === 1 && allPosts.length === 0 && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-[hsl(var(--muted))] animate-pulse rounded-xl" />
            ))}
          </div>
        )}

        {error && allPosts.length === 0 && (
          <div className="rounded-xl bg-[hsl(var(--muted))] p-8 text-center">
            <Newspaper size={40} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
            <p className="font-medium">{t('error_generic')}</p>
          </div>
        )}

        {/* NewsFeed stays mounted as long as we have posts — prevents scroll reset on load-more */}
        {!(isLoading && page === 1 && allPosts.length === 0) && !error && (
          <NewsFeed
            posts={allPosts}
            total={total}
            onLoadMore={() => setPage((p) => p + 1)}
            isLoadingMore={isLoading && page > 1}
            hasMore={hasMore}
          />
        )}
      </div>
    </AppShell>
  )
}
