import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import PrivateRoute from './components/PrivateRoute/PrivateRoute';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import AuthCallback from './pages/AuthCallback/AuthCallback';
import Strategy from './pages/Strategy/Strategy';
import ProductMain from './pages/ProductMain/ProductMain';
import ProductMini from './pages/ProductMini/ProductMini';
import LeadMagnet from './pages/LeadMagnet/LeadMagnet';
import Reels from './pages/Reels/Reels';
import Posts from './pages/Posts/Posts';
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
                <Route path="/strategy" element={<Strategy />} />
                <Route path="/product-main" element={<ProductMain />} />
                <Route path="/product-mini" element={<ProductMini />} />
                <Route path="/lead-magnet" element={<LeadMagnet />} />
                <Route path="/reels" element={<Reels />} />
                <Route path="/posts" element={<Posts />} />
                <Route path="/history" element={<History />} />
                <Route path="/settings" element={<Settings />} />
                {/* Redirect old /chat route */}
                <Route path="/chat" element={<Navigate to="/strategy" replace />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}
