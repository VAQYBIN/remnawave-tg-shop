import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useBrandingContext } from '@/hooks/BrandingProvider'
import { getLegalContent } from '@/api/admin/branding'

type LegalType = 'privacy' | 'terms' | 'personal-data' | 'refund'

function getLegalUrl(type: LegalType, branding: ReturnType<typeof useBrandingContext>['branding']): string | null {
  if (!branding) return null
  switch (type) {
    case 'privacy': return branding.privacy_policy_url
    case 'terms': return branding.terms_of_service_url
    case 'personal-data': return branding.personal_data_url
    case 'refund': return branding.refund_policy_url
    default: return null
  }
}

export function LegalPage() {
  const { type } = useParams<{ type: LegalType }>()
  const { t } = useTranslation()
  const { branding } = useBrandingContext()

  const docUrl = getLegalUrl((type as LegalType) ?? 'terms', branding)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['legal', docUrl],
    queryFn: () => getLegalContent(docUrl!),
    enabled: !!docUrl,
    staleTime: 5 * 60 * 1000,
  })

  const titles: Record<string, string> = {
    privacy: t('legal_privacy_title'),
    terms: t('legal_terms_title'),
    'personal-data': t('legal_personal_data_title'),
    refund: t('legal_refund_title'),
  }
  const title = titles[type ?? ''] ?? t('legal_document')

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] mb-6 transition-colors"
        >
          <ArrowLeft size={15} />
          {t('legal_back')}
        </Link>

        <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-6 md:p-8">
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-6">{title}</h1>

          {!docUrl && (
            <p className="text-[hsl(var(--muted-foreground))] text-sm">{t('legal_not_configured')}</p>
          )}

          {docUrl && isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-4 bg-[hsl(var(--muted))] rounded animate-pulse" style={{ width: `${60 + (i % 4) * 10}%` }} />
              ))}
            </div>
          )}

          {docUrl && isError && (
            <p className="text-red-600 text-sm">{t('legal_load_error')}</p>
          )}

          {data?.content && (
            <div className="prose prose-sm max-w-none text-[hsl(var(--foreground))] legal-markdown">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-xl font-bold mt-6 mb-3">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-semibold mt-5 mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-semibold mt-4 mb-2">{children}</h3>,
                  h4: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-1">{children}</h4>,
                  p: ({ children }) => <p className="mb-3 leading-relaxed text-sm">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-sm">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-[hsl(var(--border))] pl-4 italic text-[hsl(var(--muted-foreground))] my-3 text-sm">
                      {children}
                    </blockquote>
                  ),
                  code: ({ children, className }) =>
                    className ? (
                      <code className="block bg-[hsl(var(--muted))] rounded p-3 text-xs font-mono overflow-x-auto my-3 whitespace-pre">
                        {children}
                      </code>
                    ) : (
                      <code className="bg-[hsl(var(--muted))] rounded px-1 py-0.5 text-xs font-mono">{children}</code>
                    ),
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[hsl(var(--primary))] hover:underline">
                      {children}
                    </a>
                  ),
                  hr: () => <hr className="border-[hsl(var(--border))] my-4" />,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                }}
              >
                {data.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
