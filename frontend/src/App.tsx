import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout/Layout';
import PrivateRoute from './components/PrivateRoute/PrivateRoute';
import AdminRoute from './components/AdminRoute/AdminRoute';
import { useAuthStore } from './store/auth.store';
import { appPath } from './utils/appRoutes';

import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import CookieConsent from './components/CookieConsent/CookieConsent';
import B2BLegalPage from './pages/B2BLegal/B2BLegalPage';
import GoLongread from './pages/GoLongread/GoLongread';

const Login = lazy(() => import('./pages/Login/Login'));
const Register = lazy(() => import('./pages/Register/Register'));
const PlatformLanding = lazy(() => import('./pages/Platform/PlatformLanding'));
const AuthCallback = lazy(() => import('./pages/AuthCallback/AuthCallback'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail/VerifyEmail'));
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const Pricing = lazy(() => import('./pages/Pricing/Pricing'));
const AIDialog = lazy(() => import('./pages/AIDialog/AIDialog'));
const AboutExpert = lazy(() => import('./pages/AboutExpert/AboutExpert'));
const Positioning = lazy(() => import('./pages/Positioning/Positioning'));
const Strategy = lazy(() => import('./pages/Strategy/Strategy'));
const CastDev = lazy(() => import('./pages/CastDev/CastDev'));
const Cases = lazy(() => import('./pages/Cases/Cases'));
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
const TgChannel = lazy(() => import('./pages/TgChannel/TgChannel'));
const ContentPlan = lazy(() => import('./pages/ContentPlan/ContentPlan'));
const FileMaterials = lazy(() => import('./pages/Files/FileMaterials'));
const FileProducts = lazy(() => import('./pages/Files/FileProducts'));
const ProjectPage = lazy(() => import('./pages/Project/ProjectPage'));
const Tasks = lazy(() => import('./pages/Tasks/Tasks'));
const B2BOnboarding = lazy(() => import('./pages/B2BOnboarding/B2BOnboarding'));
const History = lazy(() => import('./pages/History/History'));
const Settings = lazy(() => import('./pages/Settings/Settings'));
const Limits = lazy(() => import('./pages/Limits/Limits'));
const Admin = lazy(() => import('./pages/Admin/Admin'));

// ── Layout wrapper ────────────────────────────────────────────────────────────

function AppLayout({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>;
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

function ProtectedAppLayout() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const status = user?.onboardingStatus;
  const needsOnboarding = user && status !== 'completed' && status !== 'skipped';

  if (needsOnboarding && location.pathname !== '/app/onboarding') {
    return <Navigate to="/app/onboarding" replace />;
  }

  return (
    <PrivateRoute>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </PrivateRoute>
  );
}

function ProtectedOnboardingPage() {
  const user = useAuthStore((s) => s.user);
  if (user?.onboardingStatus === 'completed') {
    return <Navigate to={user.recommendedRoute || '/app/tasks'} replace />;
  }
  return <PrivateRoute>{page(<B2BOnboarding />)}</PrivateRoute>;
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
        {/* ── Public B2B landing ──────────────────────────────── */}
        <Route path="/" element={page(<PlatformLanding />)} />
        <Route path="/platform" element={<Navigate to="/" replace />} />
        <Route path="/go/page/abc" element={page(<GoLongread />)} />
        <Route path="/legal/privacy-policy" element={page(<B2BLegalPage />)} />
        <Route path="/legal/personal-data" element={page(<B2BLegalPage />)} />
        <Route path="/legal/offer" element={page(<B2BLegalPage />)} />
        <Route path="/legal/ai-terms" element={page(<B2BLegalPage />)} />
        <Route path="/legal/cookies" element={page(<B2BLegalPage />)} />

        {/* ── Auth ─────────────────────────────────────────────── */}
        <Route path="/auth"                   element={page(<Login />)} />
        <Route path="/login"                  element={<Navigate to="/auth" replace />} />
        <Route path="/app/auth"               element={page(<Login />)} />
        <Route path="/app/login"              element={<Navigate to="/app/auth" replace />} />
        <Route path="/register"               element={page(<Register />)} />
        <Route path="/auth/callback"          element={page(<AuthCallback />)} />
        <Route path="/auth/verify-email"      element={page(<VerifyEmail />)} />

        {/* ── Admin ────────────────────────────────────────────── */}
        <Route
          path="/admin"
          element={
            <PrivateRoute>
              <AppLayout>{page(<AdminRoute><Admin /></AdminRoute>)}</AppLayout>
            </PrivateRoute>
          }
        />

        {/* ── Protected app — inside Layout ─────────────────────── */}
        <Route path="/app/onboarding" element={<ProtectedOnboardingPage />} />
        <Route path="/app" element={<ProtectedAppLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={page(<Dashboard />)} />
          <Route path="ai-dialog" element={page(<AIDialog />)} />

          <Route path="strategy/about" element={page(<AboutExpert />)} />
          <Route path="strategy/positioning" element={page(<Positioning />)} />
          <Route path="strategy/audience" element={page(<Strategy />)} />
          <Route path="strategy/castdev" element={page(<CastDev />)} />
          <Route path="strategy/cases" element={page(<Cases />)} />
          <Route path="strategy/cases/:caseId" element={page(<Cases />)} />
          <Route path="strategy/utp" element={page(<UTP />)} />
          <Route path="strategy/social" element={page(<Social />)} />

          <Route path="products/main" element={page(<ProductMain />)} />
          <Route path="products/mini" element={page(<ProductMini />)} />
          <Route path="products/lead-magnet" element={page(<LeadMagnet />)} />

          <Route path="posts" element={page(<Posts />)} />
          <Route path="reels" element={page(<Reels />)} />
          <Route path="articles" element={page(<Articles />)} />
          <Route path="video-scripts" element={page(<VideoScripts />)} />
          <Route path="chatbot-chains" element={page(<ChatbotChains />)} />
          <Route path="threads" element={page(<Threads />)} />
          <Route path="tg-channel" element={page(<TgChannel />)} />

          <Route path="content-plan" element={page(<ContentPlan />)} />
          <Route path="files/materials" element={page(<FileMaterials />)} />
          <Route path="files/products" element={page(<FileProducts />)} />
          <Route path="projects/:id" element={page(<ProjectPage />)} />
          <Route path="tasks" element={page(<Tasks />)} />
          <Route path="history" element={page(<History />)} />
          <Route path="settings" element={page(<Settings />)} />
          <Route path="limits" element={page(<Limits />)} />
          <Route path="pricing" element={page(<Pricing />)} />
          <Route path="admin" element={<Navigate to="/admin" replace />} />

          <Route path="strategy" element={<Navigate to="/app/strategy/about" replace />} />
          <Route path="strategy/unpacking" element={<Navigate to="/app/ai-dialog" replace />} />
          <Route path="strategy/product-main" element={<Navigate to="/app/products/main" replace />} />
          <Route path="strategy/product-mini" element={<Navigate to="/app/products/mini" replace />} />
          <Route path="strategy/lead-magnet" element={<Navigate to="/app/products/lead-magnet" replace />} />
          <Route path="product-main" element={<Navigate to="/app/products/main" replace />} />
          <Route path="product-mini" element={<Navigate to="/app/products/mini" replace />} />
          <Route path="product-free" element={<Navigate to="/app/products/lead-magnet" replace />} />
          <Route path="lead-magnet" element={<Navigate to="/app/products/lead-magnet" replace />} />
          <Route path="chat" element={<Navigate to="/app/ai-dialog" replace />} />
        </Route>

        {/* ── Legacy SaaS redirects ────────────────────────────── */}
        <Route path="/dashboard" element={<Navigate to={appPath('/dashboard')} replace />} />
        <Route path="/ai-dialog" element={<Navigate to={appPath('/ai-dialog')} replace />} />
        <Route path="/strategy/*" element={<Navigate to={appPath(window.location.pathname)} replace />} />
        <Route path="/products/*" element={<Navigate to={appPath(window.location.pathname)} replace />} />
        <Route path="/posts" element={<Navigate to={appPath('/posts')} replace />} />
        <Route path="/reels" element={<Navigate to={appPath('/reels')} replace />} />
        <Route path="/video-scripts" element={<Navigate to={appPath('/video-scripts')} replace />} />
        <Route path="/chatbot-chains" element={<Navigate to={appPath('/chatbot-chains')} replace />} />
        <Route path="/threads" element={<Navigate to={appPath('/threads')} replace />} />
        <Route path="/tg-channel" element={<Navigate to={appPath('/tg-channel')} replace />} />
        <Route path="/content-plan" element={<Navigate to={appPath('/content-plan')} replace />} />
        <Route path="/files/*" element={<Navigate to={appPath(window.location.pathname)} replace />} />
        <Route path="/projects/*" element={<Navigate to={appPath(window.location.pathname)} replace />} />
        <Route path="/tasks" element={<Navigate to={appPath('/tasks')} replace />} />
        <Route path="/history" element={<Navigate to={appPath('/history')} replace />} />
        <Route path="/settings" element={<Navigate to={appPath('/settings')} replace />} />
        <Route path="/limits" element={<Navigate to={appPath('/limits')} replace />} />
        <Route path="/pricing" element={<Navigate to={appPath('/pricing')} replace />} />
        <Route path="/chat" element={<Navigate to={appPath('/ai-dialog')} replace />} />
        <Route path="/product-main" element={<Navigate to={appPath('/products/main')} replace />} />
        <Route path="/product-mini" element={<Navigate to={appPath('/products/mini')} replace />} />
        <Route path="/product-free" element={<Navigate to={appPath('/products/lead-magnet')} replace />} />
        <Route path="/lead-magnet" element={<Navigate to={appPath('/products/lead-magnet')} replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <CookieConsent />
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
