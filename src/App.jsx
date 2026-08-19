import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import LandingPage from './pages/public/LandingPage';
import Login from './pages/public/Login';
import Signup from './pages/public/Signup';
import ResetPassword from './pages/public/ResetPassword';
import Home from './pages/public/Home';
import ActivateCode from './pages/public/ActivateCode';
import Profile from './pages/public/Profile';
import Messages from './pages/public/Messages';
import ProtectedRoute from './components/layout/ProtectedRoute';
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
      <Routes>
        {/* Standalone Public Pages */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/admin-login" element={<AdminLogin />} />

        {/* User Pages & Legal Pages with MainLayout (Header & Footer) */}
        <Route element={<MainLayout />}>
          <Route path="/activate" element={<ActivateCode />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/messages" element={<Messages />} />
          
          {/* Footer Legal Routes */}
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/dmca" element={<DmcaPage />} />
          <Route path="/support" element={<SupportPage />} />
          
          {/* Protected Vault Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/home" element={<Home />} />
          </Route>
        </Route>

        {/* Secret Admin Route */}
        <Route path="/admin-vault-secret" element={<AdminDashboard />} />

        {/* Catch-all Fallback */}
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </Router>
  );
}

export default App;