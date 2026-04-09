import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import PrivateRoute from './components/PrivateRoute/PrivateRoute';
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import AuthCallback from './pages/AuthCallback/AuthCallback';
import Chat from './pages/Chat/Chat';
import Products from './pages/Products/Products';
import Texts from './pages/Texts/Texts';
import Audience from './pages/Audience/Audience';
import Education from './pages/Education/Education';
import Tariff from './pages/Tariff/Tariff';
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
                <Route path="/" element={<Navigate to="/chat" replace />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/products" element={<Products />} />
                <Route path="/texts" element={<Texts />} />
                <Route path="/audience" element={<Audience />} />
                <Route path="/education" element={<Education />} />
                <Route path="/tariff" element={<Tariff />} />
                <Route path="/history" element={<History />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}
