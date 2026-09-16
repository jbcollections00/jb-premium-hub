import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import Header from './Header';
import Footer from './Footer';
import AdsterraNativeBanner from '../AdsterraNativeBanner';

const ADSTERRA_POPUNDER = 'https://pl30918151.effectivecpmnetwork.com/fb/53/10/fb5310e480b539e2e359b7186685fb7c.js';
const ADSTERRA_SOCIALBAR = 'https://pl30918152.effectivecpmnetwork.com/77/84/87/7784879ac907b760977addd43bca7b1a.js';

export default function MainLayout() {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');

  const [isStandardUser, setIsStandardUser] = useState(true);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [adsEnabled, setAdsEnabled] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchSettingsAndUser = async () => {
      try {
        const [settingsRes, sessionRes] = await Promise.all([
          supabase.from('site_settings').select('ads_enabled').eq('id', 1).maybeSingle(),
          supabase.auth.getSession()
        ]);

        if (!isMounted) return;

        if (settingsRes.data) {
          setAdsEnabled(settingsRes.data.ads_enabled);
        }

        const session = sessionRes.data?.session;

        if (session?.user?.id) {
          const { data, error } = await supabase
            .from('profiles')
            .select('account_type, role')
            .eq('id', session.user.id)
            .maybeSingle();

          if (!error && data) {
            const accountType = (data.account_type || '').toLowerCase();
            const role = (data.role || '').toLowerCase();
            setIsStandardUser(!(accountType === 'vip' || accountType === 'admin' || role === 'admin'));
          }
        } else {
          setIsStandardUser(true);
        }
      } catch (err) {
        console.error('Error verifying settings or user tier:', err);
      } finally {
        if (isMounted) setLoadingAuth(false);
      }
    };

    fetchSettingsAndUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchSettingsAndUser();
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Injection for Popunder & Socialbar
  useEffect(() => {
    const showAds = !loadingAuth && isStandardUser && !isAdminPage && adsEnabled;

    if (showAds) {
      if (!document.getElementById('adsterra-popunder')) {
        const script1 = document.createElement('script');
        script1.id = 'adsterra-popunder';
        script1.src = ADSTERRA_POPUNDER;
        script1.async = true;
        document.head.appendChild(script1);
      }

      if (!document.getElementById('adsterra-socialbar')) {
        const script2 = document.createElement('script');
        script2.id = 'adsterra-socialbar';
        script2.src = ADSTERRA_SOCIALBAR;
        script2.async = true;
        document.body.appendChild(script2);
      }
    }

    return () => {
      document.getElementById('adsterra-popunder')?.remove();
      document.getElementById('adsterra-socialbar')?.remove();

      const injectedNodes = document.querySelectorAll(
        '[id*="at-container"], [class*="at-element"], [id*="adsterra"], [src*="effectivecpmnetwork"], iframe[src*="effectivecpmnetwork"]'
      );
      injectedNodes.forEach((node) => node.remove());
    };
  }, [loadingAuth, isStandardUser, isAdminPage, adsEnabled]);

  const showAds = !loadingAuth && isStandardUser && !isAdminPage && adsEnabled;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between">
      <div>
        <Header />
        
        {/* 🖼️ Native Banner visible globally on every page */}
        {showAds && <AdsterraNativeBanner />}

        <main className="w-full">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}