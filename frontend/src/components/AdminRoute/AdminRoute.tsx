import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <>{children}</>;
}
