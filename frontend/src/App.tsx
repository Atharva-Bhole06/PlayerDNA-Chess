import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { AuthProvider } from './context/AuthContext'
import { LandingPage } from './pages/LandingPage'
import { PlayArenaPage } from './pages/PlayArenaPage'
import { DashboardPage } from './pages/DashboardPage'
import { HistoryPage } from './pages/HistoryPage'
import { ResearchPortalPage } from './pages/ResearchPortalPage'
import { PlayerDNAPage } from './pages/PlayerDNAPage'
import { MatchmakingPage } from './pages/MatchmakingPage'
import { LiveChessPage } from './pages/LiveChessPage'
import { AccountPage } from './pages/AccountPage'
import { AuthPage } from './pages/AuthPage'
import { RegisteredProfilePage } from './pages/RegisteredProfilePage'
import { AIArenaPage } from './pages/AIArenaPage'
import { MLModelsPage } from './pages/MLModelsPage'
import { GameReportPage } from './pages/GameReportPage'
import { ProtectedRoute } from './components/ProtectedRoute'

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<AppShell />}>
          {/* Public Landing Page (Root /) */}
          <Route index element={<LandingPage />} />
          <Route path="play" element={<PlayArenaPage />} />

          {/* Authentication Portal */}
          <Route path="login" element={<AuthPage initialMode="login" />} />
          <Route path="signup" element={<AuthPage initialMode="register" />} />

          {/* Authenticated Player Experience */}
          <Route path="dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="overview" element={<Navigate to="/dashboard" replace />} />
          <Route path="history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
          <Route path="report/:id" element={<ProtectedRoute><GameReportPage /></ProtectedRoute>} />
          <Route path="game/:id/report" element={<ProtectedRoute><GameReportPage /></ProtectedRoute>} />
          <Route path="game/:id" element={<LiveChessPage />} />
          <Route path="profile" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
          <Route path="account" element={<AccountPage />} />
          <Route path="profiles/:username" element={<RegisteredProfilePage />} />

          {/* Interactive Live Chess Gameplay (local analysis / multiplayer) */}
          <Route path="live-chess" element={<LiveChessPage />} />

          {/* Research & Intelligence Portal (Separated Cohort & ML) */}
          <Route path="research" element={<ResearchPortalPage />} />
          <Route path="research/player-dna" element={<PlayerDNAPage />} />
          <Route path="player-dna" element={<PlayerDNAPage />} />
          <Route path="matchmaking" element={<MatchmakingPage />} />
          <Route path="research/ml-models" element={<ProtectedRoute requireAdmin><MLModelsPage /></ProtectedRoute>} />
          <Route path="research/ai-arena" element={<ProtectedRoute requireAdmin><AIArenaPage /></ProtectedRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
