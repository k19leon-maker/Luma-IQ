import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import PrivateRoute from './components/PrivateRoute/PrivateRoute';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import AuthCallback from './pages/AuthCallback/AuthCallback';

// Packaging
import Strategy from './pages/Strategy/Strategy';
import ProductMain from './pages/ProductMain/ProductMain';
import ProductMini from './pages/ProductMini/ProductMini';
import ProductFree from './pages/ProductFree/ProductFree';

// Content
import Posts from './pages/Posts/Posts';
import Reels from './pages/Reels/Reels';
import Articles from './pages/Articles/Articles';
import VideoScripts from './pages/VideoScripts/VideoScripts';
import ChatbotChains from './pages/ChatbotChains/ChatbotChains';

// Content plan
import ContentPlan from './pages/ContentPlan/ContentPlan';

// Files
import FileMaterials from './pages/Files/FileMaterials';
import FileProducts from './pages/Files/FileProducts';

// Projects
import ProjectPage from './pages/Project/ProjectPage';

// Misc
import History from './pages/History/History';
import Settings from './pages/Settings/Settings';

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Protected routes */}
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/strategy" replace />} />

                {/* Packaging */}
                <Route path="/strategy"     element={<Strategy />} />
                <Route path="/product-main" element={<ProductMain />} />
                <Route path="/product-mini" element={<ProductMini />} />
                <Route path="/product-free" element={<ProductFree />} />

                {/* Content */}
                <Route path="/posts"          element={<Posts />} />
                <Route path="/reels"          element={<Reels />} />
                <Route path="/articles"       element={<Articles />} />
                <Route path="/video-scripts"  element={<VideoScripts />} />
                <Route path="/chatbot-chains" element={<ChatbotChains />} />

                {/* Content plan */}
                <Route path="/content-plan" element={<ContentPlan />} />

                {/* Files */}
                <Route path="/files/materials" element={<FileMaterials />} />
                <Route path="/files/products"  element={<FileProducts />} />

                {/* Projects */}
                <Route path="/projects/:id" element={<ProjectPage />} />

                {/* Misc */}
                <Route path="/history"  element={<History />} />
                <Route path="/settings" element={<Settings />} />

                {/* Legacy redirects */}
                <Route path="/lead-magnet" element={<Navigate to="/product-free" replace />} />
                <Route path="/chat"        element={<Navigate to="/strategy" replace />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}
