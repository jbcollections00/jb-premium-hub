import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

export default function PageAdGate({ children, adDirectLink }) {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');

  const [isAdFree, setIsAdFree] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasAdBlock, setHasAdBlock] = useState(false);

  useEffect(() => {
    checkUserStatus();
  }, []);

  const checkUserStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('account_type, role')
          .eq('id', user.id)
          .single();

        if (profile) {
          const accountType = (profile.account_type || '').toUpperCase();
          const role = (profile.role || '').toUpperCase();

          if (accountType === 'VIP' || accountType === 'ADMIN' || role === 'ADMIN') {
            setIsAdFree(true);
          }
        }
      }
    } catch (err) {
      console.error("Error checking user account status:", err);
    } finally {
      setLoading(false);
    }
  };

  // 🛡️ MULTI-LAYER ADBLOCK & BRAVE DETECTOR
  useEffect(() => {
    if (loading || isAdFree || isAdminPath) return;

    const runAdBlockCheck = async () => {
      // LAYER 1: Brave Browser Native API Detection
      if (navigator.brave && (await navigator.brave.isBrave())) {
        // setHasAdBlock(true); // PANSAMANTALA: Naka-disable
        return;
      }

      // LAYER 2: Fetch Network Bait Check
      try {
        await fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', {
          method: 'HEAD',
          mode: 'no-cors',
        });
      } catch (err) {
        // setHasAdBlock(true); // PANSAMANTALA: Naka-disable
        return;
      }

      // LAYER 3: DOM Honeypot Element Check (Brave / AdBlock Hiding Test)
      const bait = document.createElement('div');
      bait.className = 'adsbox ad-zone ad-placement banner-ad google-ad';
      bait.style.position = 'absolute';
      bait.style.top = '-9999px';
      bait.style.left = '-9999px';
      bait.style.height = '100px';
      bait.style.width = '100px';
      document.body.appendChild(bait);

      setTimeout(() => {
        if (
          bait.offsetHeight === 0 ||
          bait.clientHeight === 0 ||
          window.getComputedStyle(bait).display === 'none' ||
          window.getComputedStyle(bait).visibility === 'hidden'
        ) {
          // setHasAdBlock(true); // PANSAMANTALA: Naka-disable
        }
        bait.remove();
      }, 300);
    };

    runAdBlockCheck();
  }, [loading, isAdFree, isAdminPath]);

  // 🟢 DYNAMIC AD SCRIPTS INJECTION
  useEffect(() => {
    const removeAllAds = () => {
      const scriptIds = [
        'adsterra-popunder',
        'adsterra-socialbar',
        'monetag-popunder',
        'monetag-push',
      ];
      scriptIds.forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.remove();
      });
    };

    if (loading || isAdFree || isAdminPath) {
      removeAllAds();
      return;
    }

    const handleScriptError = () => {
      // setHasAdBlock(true); // PANSAMANTALA: Naka-disable
    };

    // 1. Adsterra Popunder
    if (!document.getElementById('adsterra-popunder')) {
      const script = document.createElement('script');
      script.id = 'adsterra-popunder';
      script.src = 'https://pl30918151.profitableratecpmnetwork.com/fb/53/10/fb5310e480b539e2e359b7186685fb7c.js';
      script.async = true;
      script.onerror = handleScriptError;
      document.body.appendChild(script);
    }

    // 2. Adsterra Social Bar
    if (!document.getElementById('adsterra-socialbar')) {
      const script = document.createElement('script');
      script.id = 'adsterra-socialbar';
      script.src = 'https://pl30918152.profitableratecpmnetwork.com/77/84/87/7784879ac907b760977addd43bca7b1a.js';
      script.async = true;
      script.onerror = handleScriptError;
      document.body.appendChild(script);
    }

    // 3. Monetag Popunder
    if (!document.getElementById('monetag-popunder')) {
      const script = document.createElement('script');
      script.id = 'monetag-popunder';
      script.dataset.zone = '11700867';
      script.src = 'https://al5sm.com/tag.min.js';
      script.onerror = handleScriptError;
      document.body.appendChild(script);
    }

    // 4. Monetag In-Page Push
    if (!document.getElementById('monetag-push')) {
      const script = document.createElement('script');
      script.id = 'monetag-push';
      script.dataset.zone = '11700875';
      script.src = 'https://nap5k.com/tag.min.js';
      script.onerror = handleScriptError;
      document.body.appendChild(script);
    }

    return () => {
      removeAllAds();
    };
  }, [loading, isAdFree, isAdminPath]);

  const handlePageClick = () => {
    if (isAdminPath || isAdFree) return;

    if (adDirectLink) {
      const pageAdTriggered = sessionStorage.getItem('page_ad_triggered');
      if (!pageAdTriggered) {
        window.open(adDirectLink, '_blank', 'noopener,noreferrer');
        sessionStorage.setItem('page_ad_triggered', 'true');
      }
    }
  };

  if (isAdminPath || isAdFree || loading) {
    return <>{children}</>;
  }

  return (
    <div onClick={handlePageClick} className="w-full h-full min-h-screen relative">
      {/* 🛑 ADBLOCK OVERLAY - PANSAMANTALANG NAKA-COMMENT OUT */}
      {/* 
      {hasAdBlock && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 text-center backdrop-blur-md">
          <div className="bg-gray-900 border border-red-500/30 p-6 sm:p-8 rounded-2xl max-w-md shadow-2xl">
            ...
          </div>
        </div>
      )}
      */}

      {/* STANDARD USER ONLY ADS BANNER */}
      {!isAdFree && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-center py-1.5 px-4 text-[11px] text-amber-400 font-bold flex items-center justify-center gap-2">
          <span>📢 Sponsored Page</span>
          <span className="text-[10px] opacity-70">(Upgrade to VIP to remove page ads)</span>
        </div>
      )}

      {/* Main Page Content */}
      {children}
    </div>
  );
}