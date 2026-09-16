import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import Header from './Header';
import Footer from './Footer';

export default function MainLayout() {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');

  const [isStandardUser, setIsStandardUser] = useState(true);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [adsEnabled, setAdsEnabled] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        // Fetch global ad settings
        const { data: settingsData } = await supabase
          .from('site_settings')
          .select('ads_enabled')
          .eq('id', 1)
          .maybeSingle();

        if (settingsData !== null && isMounted) {
          setAdsEnabled(settingsData.ads_enabled);
        }

        // Fetch user tier
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user?.id && isMounted) {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (!error && data) {
            const accountType = (data.account_type || '').toLowerCase();
            const role = (data.role || '').toLowerCase();

            if (accountType === 'vip' || accountType === 'admin' || role === 'admin') {
              setIsStandardUser(false);
            }
          }
        }
      } catch (err) {
        console.error('Error verifying settings or user tier:', err);
      } finally {
        if (isMounted) {
          setLoadingAuth(false);
        }
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  // 📢 ADSTERRA SCRIPT INJECTION (Only if enabled globally & for Standard Users)
  useEffect(() => {
    const showAds = !loadingAuth && isStandardUser && !isAdminPage && adsEnabled;

    if (showAds) {
      if (!document.getElementById('adsterra-popunder')) {
        const script1 = document.createElement('script');
        script1.id = 'adsterra-popunder';
        script1.src = 'https://pl30918151.effectivecpmnetwork.com/fb/53/10/fb5310e480b539e2e359b7186685fb7c.js';
        script1.async = true;
        document.head.appendChild(script1);
      }

      if (!document.getElementById('adsterra-socialbar')) {
        const script2 = document.createElement('script');
        script2.id = 'adsterra-socialbar';
        script2.src = 'https://pl30918152.effectivecpmnetwork.com/77/84/87/7784879ac907b760977addd43bca7b1a.js';
        script2.async = true;
        document.body.appendChild(script2);
      }
    }

    return () => {
      const pop = document.getElementById('adsterra-popunder');
      const soc = document.getElementById('adsterra-socialbar');
      if (pop) pop.remove();
      if (soc) soc.remove();

      const injectedNodes = document.querySelectorAll(
        '[id*="at-container"], [class*="at-element"], [id*="adsterra"], [src*="effectivecpmnetwork"], iframe[src*="effectivecpmnetwork"]'
      );
      injectedNodes.forEach((node) => node.remove());
    };
  }, [loadingAuth, isStandardUser, isAdminPage, adsEnabled]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between">
      <div>
        <Header />
        <main className="w-full">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}