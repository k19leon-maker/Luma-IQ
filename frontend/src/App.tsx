import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout/Layout';
import PrivateRoute from './components/PrivateRoute/PrivateRoute';
import Onboarding from './components/Onboarding/Onboarding';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import AuthCallback from './pages/AuthCallback/AuthCallback';
import Dashboard from './pages/Dashboard/Dashboard';

// Strategy
import Unpacking   from './pages/Unpacking/Unpacking';
import Strategy    from './pages/Strategy/Strategy';
import UTP         from './pages/UTP/UTP';
import Social      from './pages/Social/Social';
import ProductMain from './pages/ProductMain/ProductMain';
import ProductMini from './pages/ProductMini/ProductMini';
import LeadMagnet  from './pages/LeadMagnet/LeadMagnet';

// Content
import Posts         from './pages/Posts/Posts';
import Reels         from './pages/Reels/Reels';
import Articles      from './pages/Articles/Articles';
import VideoScripts  from './pages/VideoScripts/VideoScripts';
import ChatbotChains from './pages/ChatbotChains/ChatbotChains';

// Content plan / Files / Projects / Tasks / Misc
import ContentPlan   from './pages/ContentPlan/ContentPlan';
import FileMaterials from './pages/Files/FileMaterials';
import FileProducts  from './pages/Files/FileProducts';
import ProjectPage   from './pages/Project/ProjectPage';
import Tasks         from './pages/Tasks/Tasks';
import History       from './pages/History/History';
import Settings      from './pages/Settings/Settings';

import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';

// ── Layout wrapper with Onboarding ────────────────────────────────────────────

function AppLayout({ children }: { children: React.ReactNode }) {
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('onboarding_done'),
  );
  return (
    <>
      {showOnboarding && (
        <Onboarding onDone={() => setShowOnboarding(false)} />
      )}
      <Layout>{children}</Layout>
    </>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <>
      <Routes>
        {/* ── Public ───────────────────────────────────────────── */}
        <Route path="/login"         element={<Login />} />
        <Route path="/register"      element={<Register />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* ── Root → dashboard ─────────────────────────────────── */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* ── Protected — inside Layout ─────────────────────────── */}
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <AppLayout>
                <Routes>
                  {/* Дашборд */}
                  <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />

                  {/* Стратегия */}
                  <Route path="/strategy/unpacking"    element={<ErrorBoundary><Unpacking /></ErrorBoundary>} />
                  <Route path="/strategy/audience"     element={<ErrorBoundary><Strategy /></ErrorBoundary>} />
                  <Route path="/strategy/utp"          element={<ErrorBoundary><UTP /></ErrorBoundary>} />
                  <Route path="/strategy/social"       element={<ErrorBoundary><Social /></ErrorBoundary>} />
                  <Route path="/strategy/product-main" element={<ErrorBoundary><ProductMain /></ErrorBoundary>} />
                  <Route path="/strategy/product-mini" element={<ErrorBoundary><ProductMini /></ErrorBoundary>} />
                  <Route path="/strategy/lead-magnet"  element={<ErrorBoundary><LeadMagnet /></ErrorBoundary>} />

                  {/* Контент */}
                  <Route path="/posts"          element={<ErrorBoundary><Posts /></ErrorBoundary>} />
                  <Route path="/reels"          element={<ErrorBoundary><Reels /></ErrorBoundary>} />
                  <Route path="/articles"       element={<ErrorBoundary><Articles /></ErrorBoundary>} />
                  <Route path="/video-scripts"  element={<ErrorBoundary><VideoScripts /></ErrorBoundary>} />
                  <Route path="/chatbot-chains" element={<ErrorBoundary><ChatbotChains /></ErrorBoundary>} />

                  {/* Контент-план */}
                  <Route path="/content-plan" element={<ErrorBoundary><ContentPlan /></ErrorBoundary>} />

                  {/* Файлы */}
                  <Route path="/files/materials" element={<ErrorBoundary><FileMaterials /></ErrorBoundary>} />
                  <Route path="/files/products"  element={<ErrorBoundary><FileProducts /></ErrorBoundary>} />

                  {/* Проекты */}
                  <Route path="/projects/:id" element={<ErrorBoundary><ProjectPage /></ErrorBoundary>} />

                  {/* Задачи / Прочее */}
                  <Route path="/tasks"    element={<ErrorBoundary><Tasks /></ErrorBoundary>} />
                  <Route path="/history"  element={<ErrorBoundary><History /></ErrorBoundary>} />
                  <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />

                  {/* Legacy redirects */}
                  <Route path="/strategy"     element={<Navigate to="/strategy/unpacking"    replace />} />
                  <Route path="/product-main" element={<Navigate to="/strategy/product-main" replace />} />
                  <Route path="/product-mini" element={<Navigate to="/strategy/product-mini" replace />} />
                  <Route path="/product-free" element={<Navigate to="/strategy/lead-magnet"  replace />} />
                  <Route path="/lead-magnet"  element={<Navigate to="/strategy/lead-magnet"  replace />} />
                  <Route path="/chat"         element={<Navigate to="/strategy/unpacking"    replace />} />
                </Routes>
              </AppLayout>
            </PrivateRoute>
          }
        />
      </Routes>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: '#fff', color: '#1a1a1a', border: '1px solid #E5E3DC', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' },
          success: { iconTheme: { primary: '#D4A847', secondary: '#fff' } },
          error:   { iconTheme: { primary: '#f25c5c', secondary: '#fff' } },
        }}
      />
    </>
  );
}
