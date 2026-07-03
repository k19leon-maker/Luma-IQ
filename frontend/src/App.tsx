import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout/Layout';
import PrivateRoute from './components/PrivateRoute/PrivateRoute';
import AdminRoute from './components/AdminRoute/AdminRoute';
import Onboarding from './components/Onboarding/Onboarding';
import { useAuthStore } from './store/auth.store';
import {
  articles as publicArticles,
  categories,
  experts,
  problems,
  programs,
  tests,
  webinars,
} from './data/public/content';
import { appPath } from './utils/appRoutes';

import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import PublicLayout from './pages/PublicPortal/PublicLayout';
import HomePage from './pages/PublicPortal/HomePage';
import ListPage from './pages/PublicPortal/ListPage';
import DetailPage from './pages/PublicPortal/DetailPage';
import NotFoundPage from './pages/PublicPortal/NotFoundPage';
import LegalPage from './pages/PublicPortal/LegalPage';
import ContactsPage from './pages/PublicPortal/ContactsPage';
import CookieConsent from './components/CookieConsent/CookieConsent';
import B2BLegalPage from './pages/B2BLegal/B2BLegalPage';
import GoLongread from './pages/GoLongread/GoLongread';
import {
  B2CClientCabinet,
  B2CPsychologyAssessment,
  B2CPsychologyChat,
} from './pages/B2CPsychology/B2CPsychology';

const Login = lazy(() => import('./pages/Login/Login'));
const Register = lazy(() => import('./pages/Register/Register'));
const PlatformLanding = lazy(() => import('./pages/Platform/PlatformLanding'));
const StartTestPayment = lazy(() => import('./pages/StartTestPayment/StartTestPayment'));
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

const articleItems = publicArticles.map((item) => ({
  slug: item.slug,
  title: item.title,
  description: item.excerpt,
  text: item.excerpt,
  content: item.content,
  meta: `${item.author} · ${new Date(item.publishedAt).toLocaleDateString('ru-RU')}`,
}));

const categoryItems = categories.map((item) => ({
  slug: item.slug,
  title: item.name,
  description: item.description,
  text: item.description,
}));

const problemItems = problems.map((item) => ({
  slug: item.slug,
  title: item.name,
  description: item.description,
  text: item.description,
}));

const expertItems = experts.map((item) => ({
  slug: item.slug,
  title: item.name,
  description: item.bio,
  text: item.bio,
  meta: item.specialization,
}));

const programItems = programs.map((item) => ({
  slug: item.slug,
  title: item.name,
  description: item.description,
  text: item.description,
  meta: item.duration,
}));

const webinarItems = webinars.map((item) => ({
  slug: item.slug,
  title: item.title,
  description: item.description,
  text: item.description,
}));

const testItems = tests.map((item) => ({
  slug: item.slug,
  title: item.title,
  description: item.description,
  text: item.description,
}));

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

function publicPage(element: React.ReactNode) {
  return page(<PublicLayout>{element}</PublicLayout>);
}

function ProtectedAppLayout() {
  return (
    <PrivateRoute>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </PrivateRoute>
  );
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
        {/* ── Public B2C portal ───────────────────────────────── */}
        <Route path="/" element={publicPage(<HomePage />)} />
        <Route path="/diagnostics/ai-psychologist" element={publicPage(<B2CPsychologyAssessment />)} />
        <Route path="/diagnostics/ai-psychologist/chat" element={publicPage(<B2CPsychologyChat />)} />
        <Route path="/client" element={publicPage(<B2CClientCabinet />)} />
        <Route path="/go/page/abc" element={page(<GoLongread />)} />
        <Route path="/platform" element={page(<PlatformLanding />)} />
        <Route path="/pay/start-20" element={page(<StartTestPayment />)} />
        <Route path="/legal/privacy-policy" element={page(<B2BLegalPage />)} />
        <Route path="/legal/personal-data" element={page(<B2BLegalPage />)} />
        <Route path="/legal/offer" element={page(<B2BLegalPage />)} />
        <Route path="/legal/ai-terms" element={page(<B2BLegalPage />)} />
        <Route path="/legal/cookies" element={publicPage(<LegalPage />)} />
        <Route path="/b2c/legal/privacy-policy" element={publicPage(<LegalPage />)} />
        <Route path="/b2c/legal/personal-data" element={publicPage(<LegalPage />)} />
        <Route path="/b2c/legal/offer" element={publicPage(<LegalPage />)} />
        <Route path="/b2c/legal/cookies" element={publicPage(<LegalPage />)} />
        <Route path="/contacts" element={publicPage(<ContactsPage />)} />
        <Route
          path="/articles"
          element={publicPage(<ListPage title="Статьи" description="Материалы о психологических трудностях, отношениях, тревоге, разводе и восстановлении ресурса." basePath="/articles" items={articleItems} />)}
        />
        <Route path="/articles/:slug" element={publicPage(<DetailPage items={articleItems} sectionTitle="Статьи" sectionPath="/articles" fallbackTitle="Статья не найдена" />)} />
        <Route
          path="/categories"
          element={publicPage(<ListPage title="Категории" description="Тематические направления будущего информационного портала Luma IQ." basePath="/categories" items={categoryItems} />)}
        />
        <Route path="/categories/:slug" element={publicPage(<DetailPage items={categoryItems} sectionTitle="Категории" sectionPath="/categories" fallbackTitle="Категория не найдена" />)} />
        <Route
          path="/problems"
          element={publicPage(<ListPage title="Проблемы" description="Отдельные SEO-страницы для жизненных и психологических ситуаций, с которыми пользователи приходят за помощью." basePath="/problems" items={problemItems} />)}
        />
        <Route path="/problems/:slug" element={publicPage(<DetailPage items={problemItems} sectionTitle="Проблемы" sectionPath="/problems" fallbackTitle="Проблема не найдена" />)} />
        <Route
          path="/experts"
          element={publicPage(<ListPage title="Специалисты" description="Профили специалистов Luma IQ и направления помощи." basePath="/experts" items={expertItems} />)}
        />
        <Route path="/experts/:slug" element={publicPage(<DetailPage items={expertItems} sectionTitle="Специалисты" sectionPath="/experts" fallbackTitle="Специалист не найден" />)} />
        <Route
          path="/programs"
          element={publicPage(<ListPage title="Программы" description="Психологические программы и будущие продуктовые направления Luma IQ." basePath="/programs" items={programItems} />)}
        />
        <Route path="/programs/:slug" element={publicPage(<DetailPage items={programItems} sectionTitle="Программы" sectionPath="/programs" fallbackTitle="Программа не найдена" />)} />
        <Route
          path="/webinars"
          element={publicPage(<ListPage title="Вебинары" description="Открытые и платные вебинары по отношениям, тревоге, разводу, самооценке и другим темам." basePath="/webinars" items={webinarItems} />)}
        />
        <Route path="/webinars/:slug" element={publicPage(<DetailPage items={webinarItems} sectionTitle="Вебинары" sectionPath="/webinars" fallbackTitle="Вебинар не найден" />)} />
        <Route
          path="/tests"
          element={publicPage(<ListPage title="Диагностики" description="Архитектура будущих диагностик Luma IQ. Сейчас тесты представлены как страницы-заготовки без AI-логики." basePath="/tests" items={testItems} />)}
        />
        <Route path="/tests/:slug" element={publicPage(<DetailPage items={testItems} sectionTitle="Диагностики" sectionPath="/tests" fallbackTitle="Диагностика не найдена" />)} />

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
        <Route path="/app" element={<ProtectedAppLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={page(<Dashboard />)} />
          <Route path="ai-dialog" element={page(<AIDialog />)} />

          <Route path="strategy/about" element={page(<AboutExpert />)} />
          <Route path="strategy/positioning" element={page(<Positioning />)} />
          <Route path="strategy/audience" element={page(<Strategy />)} />
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

        <Route path="*" element={publicPage(<NotFoundPage />)} />
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
