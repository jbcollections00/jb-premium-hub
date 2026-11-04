import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import MainLayout from './components/layout/MainLayout';
import EventPopup from './components/EventPopup';

import LandingPage from './pages/public/LandingPage';
import Login from './pages/public/Login';
import Signup from './pages/public/Signup';
import ResetPassword from './pages/public/ResetPassword';
import Home from './pages/public/Home';
import ActivateCode from './pages/public/ActivateCode';
import Profile from './pages/public/Profile';
import Messages from './pages/public/Messages';
import BuyVip from './pages/public/BuyVip';
import Contest from './pages/public/Contest';
import LeaderboardPage from './pages/public/LeaderboardPage';

import ChatMessages from './pages/ChatMessages';

import ProtectedRoute from './components/layout/ProtectedRoute';
import SubscriptionRoute from './components/layout/SubscriptionRoute';
import SubscriptionPlans from './pages/public/SubscriptionPlans';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminLogin from './pages/admin/AdminLogin';

// Legal & Support Pages
import TermsPage from './pages/legal/TermsPage';
import PrivacyPage from './pages/legal/PrivacyPage';
import DmcaPage from './pages/legal/DmcaPage';
import SupportPage from './pages/legal/SupportPage';

function App() {
  return (
    <Router>
      <EventPopup />

      <Routes>
        {/* Standalone Public Pages */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/admin-login" element={<AdminLogin />} />

        {/* User Pages & Legal Pages Wrapped in MainLayout */}
        <Route element={<MainLayout />}>
          {/* Public Legal Routes */}
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/dmca" element={<DmcaPage />} />
          <Route path="/support" element={<SupportPage />} />

          {/* Accessible to signed-in users, including Free accounts */}
          <Route element={<ProtectedRoute />}>
            <Route path="/profile" element={<Profile />} />
            <Route path="/subscribe" element={<SubscriptionPlans />} />
            <Route path="/buy-vip" element={<SubscriptionPlans />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/for-you" element={<Navigate to="/profile" replace />} />

            {/* Paid member pages: verified live billing grant required. */}
            <Route element={<SubscriptionRoute />}>
              <Route path="/home" element={<Home />} />
              <Route path="/activate" element={<ActivateCode />} />
              <Route path="/chat" element={<ChatMessages />} />
              <Route path="/contest" element={<Contest />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
            </Route>
          </Route>
        </Route>

        {/* Protected Secret Admin Route */}
        <Route element={<ProtectedRoute adminOnly={true} />}>
          <Route path="/admin-vault-secret" element={<AdminDashboard />} />
        </Route>

        {/* Catch-all Fallback */}
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </Router>
  );
}

export default App;