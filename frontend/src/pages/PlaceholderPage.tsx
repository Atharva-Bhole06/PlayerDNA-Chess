import { Panel } from '../components/Panel'

export function PlaceholderPage({ title, eyebrow, description }: { title: string; eyebrow: string; description: string }) {
  return (
    <div className="page-wrap">
      <header className="page-header">
        <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
        <span className="phase-badge"><span className="phase-dot" /> FOUNDATION</span>
      </header>
      <Panel className="placeholder-panel">
        <div className="placeholder-symbol" aria-hidden="true">✦</div>
        <h2>Workspace foundation ready</h2>
        <p>This area is ready for its next milestone.</p>
      </Panel>
    </div>
  )
}
