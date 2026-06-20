import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import TopNav from './components/layout/TopNav';
import Toaster from './components/ui/Toaster';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import HistoryPage from './pages/HistoryPage';
import FaceGalleryPage from './pages/FaceGalleryPage';
import LiveStreamPage from './pages/LiveStreamPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import NotificationsPage from './pages/NotificationsPage';
import AdminPage from './pages/AdminPage';

// Routes that don't need sidebar/topnav and don't require auth
const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('vv_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  // Basic token expiry check (JWT payload is base64 encoded)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      localStorage.removeItem('vv_token');
      localStorage.removeItem('vv_user');
      return <Navigate to="/login" replace />;
    }
  } catch {
    // If token is malformed, clear it and redirect
    localStorage.removeItem('vv_token');
    localStorage.removeItem('vv_user');
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  const userStr = localStorage.getItem('vv_user');
  if (!userStr) {
    return <Navigate to="/login" replace />;
  }
  try {
    const user = JSON.parse(userStr);
    if (user.role !== 'ADMIN') {
      return <Navigate to="/" replace />;
    }
  } catch {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  const location = useLocation();
  const isPublicPage = PUBLIC_PATHS.some(p => location.pathname.startsWith(p));

  return (
    <div className="min-h-screen flex text-white font-mono" style={{ background: 'radial-gradient(circle at center, #0c101b 0%, #030407 100%) fixed' }}>
      <Toaster />

      {isPublicPage ? (
        // Public pages: full-width, no sidebar/topnav
        <div className="w-full">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ForgotPasswordPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      ) : (
        <>
          {/* Fixed sidebar */}
          <Sidebar />

          {/* Main area offset by sidebar width (16rem / 256px) */}
          <div className="ml-64 flex-1 flex flex-col min-h-screen">
            {/* Fixed top nav */}
            <TopNav />

            {/* Page content — padded below top nav */}
            <main className="flex-1 pt-16 px-8 py-8 overflow-y-auto custom-scrollbar">
              <Routes>
                <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
                <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
                <Route path="/face-gallery" element={<ProtectedRoute><FaceGalleryPage /></ProtectedRoute>} />
                <Route path="/live-stream" element={<ProtectedRoute><LiveStreamPage /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
                <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
                {/* Catch-all → Dashboard */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </>
      )}
    </div>
  );
}
