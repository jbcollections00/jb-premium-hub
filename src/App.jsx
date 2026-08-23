import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
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

// 🟢 Dynamic Ad Injector & Blocker
function AdManager() {
  const location = useLocation();

  useEffect(() => {
    const isAdminRoute = location.pathname.includes('admin');

    if (isAdminRoute) {
      // 1. Tanggalin ang mga Adsterra Script elements
      const popunderScript = document.getElementById('adsterra-popunder');
      const socialbarScript = document.getElementById('adsterra-socialbar');

      if (popunderScript) popunderScript.remove();
      if (socialbarScript) socialbarScript.remove();

      // 2. Linisin sa DOM ang anumang ginawang ad overlay, social bar banner, o floating container
      const injectedAdNodes = document.querySelectorAll(
        '[id*="at-container"], [class*="at-element"], [id*="adsterra"], [src*="effectivecpmnetwork"], iframe[src*="effectivecpmnetwork"]'
      );
      injectedAdNodes.forEach((node) => node.remove());
    } else {
      // Load Popunder Code para sa Public Pages
      if (!document.getElementById('adsterra-popunder')) {
        const script1 = document.createElement('script');
        script1.id = 'adsterra-popunder';
        script1.src = 'https://pl30918151.effectivecpmnetwork.com/fb/53/10/fb5310e480b539e2e359b7186685fb7c.js';
        script1.async = true;
        document.head.appendChild(script1);
      }

      // Load Social Bar Code para sa Public Pages
      if (!document.getElementById('adsterra-socialbar')) {
        const script2 = document.createElement('script');
        script2.id = 'adsterra-socialbar';
        script2.src = 'https://pl30918152.effectivecpmnetwork.com/77/84/87/7784879ac907b760977addd43bca7b1a.js';
        script2.async = true;
        document.body.appendChild(script2);
      }
    }
  }, [location.pathname]);

  return null;
}

function App() {
  return (
    <Router>
      <AdManager />
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