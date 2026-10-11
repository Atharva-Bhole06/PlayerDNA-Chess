import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { OverviewPage } from './pages/OverviewPage'
import { PlayerDNAPage } from './pages/PlayerDNAPage'
import { MatchmakingPage } from './pages/MatchmakingPage'
import { LiveChessPage } from './pages/LiveChessPage'
import { AccountPage } from './pages/AccountPage'
import { RegisteredProfilePage } from './pages/RegisteredProfilePage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="player-dna" element={<PlayerDNAPage />} />
        <Route path="matchmaking" element={<MatchmakingPage />} />
        <Route path="live-chess" element={<LiveChessPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="profiles/:username" element={<RegisteredProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
