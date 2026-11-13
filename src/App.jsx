import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';

import MainLayout from './components/layout/MainLayout';
import EventPopup from './components/EventPopup';
import ProtectedRoute from './components/layout/ProtectedRoute';

import Login from './pages/public/Login';
import Signup from './pages/public/Signup';
import ResetPassword from './pages/public/ResetPassword';
import Home from './pages/public/Home';
import ActivateCode from './pages/public/ActivateCode';
import Profile from './pages/public/Profile';
import Messages from './pages/public/Messages';
import BuyVip from './pages/public/BuyVip';
import Subscribe from './pages/public/Subscribe';
import Contest from './pages/public/Contest';
import LeaderboardPage from './pages/public/LeaderboardPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminLogin from './pages/admin/AdminLogin';

import TermsPage from './pages/legal/TermsPage';
import PrivacyPage from './pages/legal/PrivacyPage';
import DmcaPage from './pages/legal/DmcaPage';
import SupportPage from './pages/legal/SupportPage';

// STEP 307B: Routing cleanup only.
// No change to auth, payment processing, entitlement RPCs, or private-media gates.
// Root and old /for-you bookmarks use existing ProtectedRoute authorization.
// JB CHAT is intentionally excluded from this website release.
export default function App() {
  return (
    <Router>
      <EventPopup />

      <Routes>
        {/* No adult-only landing page. Let ProtectedRoute handle logged-out users. */}
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/admin-login" element={<AdminLogin />} />

        <Route element={<MainLayout />}>
          {/* Public legal and support pages */}
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/dmca" element={<DmcaPage />} />
          <Route path="/support" element={<SupportPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/home" element={<Home />} />
            {/* Backward compatibility: old For You links are redirected to Home. */}
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

        {/* Admin route keeps its original guard. */}
        <Route element={<ProtectedRoute adminOnly={true} />}>
          <Route path="/admin-vault-secret" element={<AdminDashboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Router>
  );
}
