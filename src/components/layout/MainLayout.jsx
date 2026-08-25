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

  useEffect(() => {
    let isMounted = true;

    const checkUserTier = async () => {
      try {
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
        console.error('Error verifying user tier:', err);
      } finally {
        if (isMounted) {
          setLoadingAuth(false);
        }
      }
    };

    checkUserTier();

    return () => {
      isMounted = false;
    };
  }, []);

  // 📢 ADSTERRA INJECTION (Standard Users Only)
  useEffect(() => {
    if (!loadingAuth && isStandardUser && !isAdminPage) {
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
  }, [loadingAuth, isStandardUser, isAdminPage]);

  const showAds = !loadingAuth && isStandardUser && !isAdminPage;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between">
      <div>
        <Header />
        
        {/* TOP BANNER AD */}
        {showAds && (
          <div className="bg-gray-900 border-b border-gray-800 py-3 flex justify-center items-center">
            <div className="text-gray-500 text-xs font-bold tracking-widest border border-dashed border-gray-700 px-10 py-2">
              [ ADVERTISEMENT BANNER ]
            </div>
          </div>
        )}

        <main className="flex">
          {/* LEFT SIDEBAR AD */}
          {showAds && (
            <aside className="w-16 md:w-48 hidden sm:flex flex-col items-center justify-center border-r border-gray-800 bg-gray-900/50 p-4">
              <div className="text-gray-600 text-xs rotate-90 whitespace-nowrap md:rotate-0 md:whitespace-normal">
                [ SIDE AD ]
              </div>
            </aside>
          )}

          {/* MAIN CONTENT */}
          <div className="flex-1 w-full">
            <Outlet />
          </div>

          {/* RIGHT SIDEBAR AD */}
          {showAds && (
            <aside className="w-16 md:w-48 hidden sm:flex flex-col items-center justify-center border-l border-gray-800 bg-gray-900/50 p-4">
              <div className="text-gray-600 text-xs rotate-90 whitespace-nowrap md:rotate-0 md:whitespace-normal">
                [ SIDE AD ]
              </div>
            </aside>
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}