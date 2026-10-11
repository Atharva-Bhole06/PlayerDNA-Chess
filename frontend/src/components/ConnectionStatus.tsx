import { useCallback, useEffect, useState } from 'react'
import { getHealth } from '../api/client'
import type { HealthResponse } from '../api/types'

type HealthState = 'loading' | 'connected' | 'error'

export function ConnectionStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [state, setState] = useState<HealthState>('loading')

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setState('loading')
    try {
      const result = await getHealth(signal)
      setHealth(result)
      setState('connected')
    } catch {
      if (!signal?.aborted) {
        setHealth(null)
        setState('error')
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  const label = state === 'loading' ? 'Checking API' : state === 'error' ? 'API unavailable' : 'API connected'

  return (
    <div className="connection-status" aria-label="Service connection status">
      <div className="connection-heading">
        <span className={`status-dot status-dot--${state}`} aria-hidden="true" />
        <span>{label}</span>
        {state === 'error' && <button className="text-button" onClick={() => void refresh()}>Retry</button>}
      </div>
      <div className="connection-services" aria-live="polite">
        <ServiceState label="Database" value={health?.database_available} loading={state === 'loading'} />
        <ServiceState label="Stockfish" value={health?.stockfish_available} loading={state === 'loading'} />
      </div>
    </div>
  )
}

function ServiceState({ label, value, loading }: { label: string; value?: boolean; loading: boolean }) {
  const text = loading ? 'Checking' : value === undefined ? 'Unknown' : value ? 'Available' : 'Unavailable'
  const tone = loading || value === undefined ? 'neutral' : value ? 'good' : 'bad'
  return (
    <span className="service-state">
      <span className={`service-state__dot service-state__dot--${tone}`} aria-hidden="true" />
      <span>{label}</span>
      <span className="service-state__value">{text}</span>
    </span>
  )
}
