import type { ReactNode } from 'react'
import {
  IconAI,
  IconCoach,
  IconSwords,
  IconTrophy,
} from './Icons'

export type PlayMode = 'unrated' | 'competitive' | 'ai' | 'coach'

export interface PlayModeSelectorProps {
  activeMode: PlayMode
  onSelectMode: (mode: PlayMode) => void
  className?: string
}

interface ModeItem {
  id: PlayMode
  label: string
  sublabel: string
  icon: ReactNode
  badge?: string
  accentClass: string
}

export function PlayModeSelector({ activeMode, onSelectMode, className = '' }: PlayModeSelectorProps) {
  const modes: ModeItem[] = [
    {
      id: 'unrated',
      label: 'Play',
      sublabel: 'Casual · Human vs Human',
      icon: <IconSwords size={26} />,
      accentClass: 'mode-lime',
    },
    {
      id: 'competitive',
      label: 'Competitive',
      sublabel: 'Rated Elo · 10+10 Matchmaking',
      icon: <IconTrophy size={26} />,
      accentClass: 'mode-lime',
    },
    {
      id: 'ai',
      label: 'Play AI',
      sublabel: 'Stockfish · 10+10',
      icon: <IconAI size={26} />,
      accentClass: 'mode-cyan',
    },
    {
      id: 'coach',
      label: 'Coach',
      sublabel: 'Play & Learn with Engine Tips',
      icon: <IconCoach size={26} />,
      badge: 'ASSISTED',
      accentClass: 'mode-orange',
    },
  ]

  return (
    <nav className={`mode-selector-bar ${className}`} aria-label="Play mode selector">
      {modes.map(mode => {
        const isActive = activeMode === mode.id
        return (
          <button
            key={mode.id}
            type="button"
            className={`mode-selector-tab ${mode.accentClass} ${isActive ? 'is-active' : ''}`}
            onClick={() => onSelectMode(mode.id)}
            aria-pressed={isActive}
          >
            <div className="mode-tab-icon" aria-hidden="true">
              {mode.icon}
            </div>
            <div className="mode-tab-info">
              <span className="mode-tab-label">
                {mode.label}
                {mode.badge && <span className="mode-tab-badge">{mode.badge}</span>}
              </span>
              <span className="mode-tab-sublabel">{mode.sublabel}</span>
            </div>
          </button>
        )
      })}
    </nav>
  )
}
