import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { hasError: true, message }
  }

  override componentDidCatch() {
    // Error is already captured in state
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' })
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle size={28} className="text-red-500" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-[hsl(var(--foreground))]">Что-то пошло не так</p>
            {this.state.message && (
              <p className="text-xs text-[hsl(var(--muted-foreground))] max-w-xs break-words">
                {this.state.message}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={this.handleReset}>
            Попробовать снова
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
