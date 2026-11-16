import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';

import MainLayout from './components/layout/MainLayout';
import EventPopup from './components/EventPopup';
import ProtectedRoute from './components/layout/ProtectedRoute';

// Phase 320: Split pages into route-specific JavaScript chunks.
// Keep original auth routes, membership guards, redirect destinations,
// event popup, and page implementations unchanged.
const Login = lazy(() => import('./pages/public/Login'));
const Signup = lazy(() => import('./pages/public/Signup'));
const ResetPassword = lazy(() => import('./pages/public/ResetPassword'));
const Home = lazy(() => import('./pages/public/Home'));
const ActivateCode = lazy(() => import('./pages/public/ActivateCode'));
const Profile = lazy(() => import('./pages/public/Profile'));
const Messages = lazy(() => import('./pages/public/Messages'));
const BuyVip = lazy(() => import('./pages/public/BuyVip'));
const Subscribe = lazy(() => import('./pages/public/Subscribe'));
const Contest = lazy(() => import('./pages/public/Contest'));
const LeaderboardPage = lazy(() => import('./pages/public/LeaderboardPage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));

const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const DmcaPage = lazy(() => import('./pages/legal/DmcaPage'));
const SupportPage = lazy(() => import('./pages/legal/SupportPage'));

function RouteLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[40vh] items-center justify-center bg-[#090f1c] px-4 text-sm text-slate-300"
    >
      Loading page…
    </div>
  );
}

// STEP 307B routing preserved. No changes to account authorization,
// payments, Supabase RPCs, video playback, or private media.
// JB CHAT is deliberately excluded from this website.
export default function App() {
  return (
    <Router>
      <EventPopup />

      <Suspense fallback={<RouteLoading />}>
        <Routes>
          {/* Keep the existing ProtectedRoute authorization for root redirects. */}
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/admin-login" element={<AdminLogin />} />

          <Route element={<MainLayout />}>
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/dmca" element={<DmcaPage />} />
            <Route path="/support" element={<SupportPage />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/home" element={<Home />} />
              <Route path="/for-you" element={<Navigate to="/home" replace />} />
              <Route path="/activate" element={<ActivateCode />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/buy-vip" element={<BuyVip />} />
              <Route path="/subscribe" element={<Subscribe />} />
              <Route path="/contest" element={<Contest />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute adminOnly={true} />}>
            <Route path="/admin-vault-secret" element={<AdminDashboard />} />
          </Route>

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
