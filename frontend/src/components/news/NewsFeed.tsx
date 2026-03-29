import { useTranslation } from 'react-i18next'
import { NewsPost } from './NewsPost'
import type { ChannelPost } from '@/api/news'

interface Props {
  posts: ChannelPost[]
  total: number
  onLoadMore: () => void
  isLoadingMore: boolean
  hasMore: boolean
}

export function NewsFeed({ posts, total, onLoadMore, isLoadingMore, hasMore }: Props) {
  const { t } = useTranslation()

  if (posts.length === 0) {
    return (
      <div className="rounded-xl bg-[hsl(var(--muted))] p-8 text-center">
        <p className="font-medium">{t('news_empty')}</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          {t('news_empty_hint')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        {t('news_count', { count: total })}
      </p>

      {posts.map((post) => (
        <NewsPost key={post.id} post={post} />
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="w-full py-3 text-sm text-[hsl(var(--primary))] hover:underline disabled:opacity-50"
        >
          {isLoadingMore ? t('news_loading_more') : t('news_load_more')}
        </button>
      )}
    </div>
  )
}
