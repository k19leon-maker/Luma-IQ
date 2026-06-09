import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout/Layout';
import PrivateRoute from './components/PrivateRoute/PrivateRoute';
import AdminRoute from './components/AdminRoute/AdminRoute';
import Onboarding from './components/Onboarding/Onboarding';
import { useAuthStore } from './store/auth.store';

import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';

const Login = lazy(() => import('./pages/Login/Login'));
const Register = lazy(() => import('./pages/Register/Register'));
const AuthCallback = lazy(() => import('./pages/AuthCallback/AuthCallback'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail/VerifyEmail'));
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const Pricing = lazy(() => import('./pages/Pricing/Pricing'));
const AIDialog = lazy(() => import('./pages/AIDialog/AIDialog'));
const AboutExpert = lazy(() => import('./pages/AboutExpert/AboutExpert'));
const Positioning = lazy(() => import('./pages/Positioning/Positioning'));
const Strategy = lazy(() => import('./pages/Strategy/Strategy'));
const UTP = lazy(() => import('./pages/UTP/UTP'));
const Social = lazy(() => import('./pages/Social/Social'));
const ProductMain = lazy(() => import('./pages/ProductMain/ProductMain'));
const ProductMini = lazy(() => import('./pages/ProductMini/ProductMini'));
const LeadMagnet = lazy(() => import('./pages/LeadMagnet/LeadMagnet'));
const Posts = lazy(() => import('./pages/Posts/Posts'));
const Reels = lazy(() => import('./pages/Reels/Reels'));
const Articles = lazy(() => import('./pages/Articles/Articles'));
const VideoScripts = lazy(() => import('./pages/VideoScripts/VideoScripts'));
const ChatbotChains = lazy(() => import('./pages/ChatbotChains/ChatbotChains'));
const Threads = lazy(() => import('./pages/Threads/Threads'));
const ContentPlan = lazy(() => import('./pages/ContentPlan/ContentPlan'));
const FileMaterials = lazy(() => import('./pages/Files/FileMaterials'));
const FileProducts = lazy(() => import('./pages/Files/FileProducts'));
const ProjectPage = lazy(() => import('./pages/Project/ProjectPage'));
const Tasks = lazy(() => import('./pages/Tasks/Tasks'));
const History = lazy(() => import('./pages/History/History'));
const Settings = lazy(() => import('./pages/Settings/Settings'));
const Limits = lazy(() => import('./pages/Limits/Limits'));
const Admin = lazy(() => import('./pages/Admin/Admin'));

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

function PageLoader() {
  return (
    <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>
      Загружаю раздел...
    </div>
  );
}

function page(element: React.ReactNode) {
  return <ErrorBoundary><Suspense fallback={<PageLoader />}>{element}</Suspense></ErrorBoundary>;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const restoreSession = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  return (
    <>
      <Routes>
        {/* ── Public ───────────────────────────────────────────── */}
        <Route path="/login"                  element={page(<Login />)} />
        <Route path="/register"               element={page(<Register />)} />
        <Route path="/auth/callback"          element={page(<AuthCallback />)} />
        <Route path="/auth/verify-email"      element={page(<VerifyEmail />)} />

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
                  <Route path="/dashboard" element={page(<Dashboard />)} />
                  <Route path="/ai-dialog" element={page(<AIDialog />)} />

                  {/* Стратегия */}
                  <Route path="/strategy/about"       element={page(<AboutExpert />)} />
                  <Route path="/strategy/positioning" element={page(<Positioning />)} />
                  <Route path="/strategy/audience"     element={page(<Strategy />)} />
                  <Route path="/strategy/utp"          element={page(<UTP />)} />
                  <Route path="/strategy/social"       element={page(<Social />)} />
                  {/* Конструктор продуктов */}
                  <Route path="/products/main"        element={page(<ProductMain />)} />
                  <Route path="/products/mini"        element={page(<ProductMini />)} />
                  <Route path="/products/lead-magnet" element={page(<LeadMagnet />)} />

                  {/* Контент */}
                  <Route path="/posts"          element={page(<Posts />)} />
                  <Route path="/reels"          element={page(<Reels />)} />
                  <Route path="/articles"       element={page(<Articles />)} />
                  <Route path="/video-scripts"  element={page(<VideoScripts />)} />
                  <Route path="/chatbot-chains" element={page(<ChatbotChains />)} />
                  <Route path="/threads"        element={page(<Threads />)} />

                  {/* Контент-план */}
                  <Route path="/content-plan" element={page(<ContentPlan />)} />

                  {/* Файлы */}
                  <Route path="/files/materials" element={page(<FileMaterials />)} />
                  <Route path="/files/products"  element={page(<FileProducts />)} />

                  {/* Проекты */}
                  <Route path="/projects/:id" element={page(<ProjectPage />)} />

                  {/* Задачи / Прочее */}
                  <Route path="/tasks"    element={page(<Tasks />)} />
                  <Route path="/history"  element={page(<History />)} />
                  <Route path="/settings" element={page(<Settings />)} />
                  <Route path="/limits"   element={page(<Limits />)} />
                  <Route path="/pricing"  element={page(<Pricing />)} />
                  <Route path="/admin"    element={page(<AdminRoute><Admin /></AdminRoute>)} />

                  {/* Legacy redirects */}
                  <Route path="/strategy"     element={<Navigate to="/strategy/about"        replace />} />
                  <Route path="/strategy/unpacking" element={<Navigate to="/ai-dialog"       replace />} />
                  <Route path="/strategy/product-main" element={<Navigate to="/products/main"        replace />} />
                  <Route path="/strategy/product-mini" element={<Navigate to="/products/mini"        replace />} />
                  <Route path="/strategy/lead-magnet"  element={<Navigate to="/products/lead-magnet" replace />} />
                  <Route path="/product-main"          element={<Navigate to="/products/main"        replace />} />
                  <Route path="/product-mini"          element={<Navigate to="/products/mini"        replace />} />
                  <Route path="/product-free"          element={<Navigate to="/products/lead-magnet" replace />} />
                  <Route path="/lead-magnet"           element={<Navigate to="/products/lead-magnet" replace />} />
                  <Route path="/chat"         element={<Navigate to="/ai-dialog"             replace />} />
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
