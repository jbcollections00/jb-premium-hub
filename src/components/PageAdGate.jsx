import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

export default function PageAdGate({ children, adDirectLink }) {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');

  const [isAdFree, setIsAdFree] = useState(false);
  const [loading, setLoading] = useState(true);

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

  // Trigger Adsterra / Direct Link for Standard Users when clicking the page
  const handlePageClick = () => {
    // 🚫 No ads on Admin routes or for Admin/VIP users
    if (isAdminPath || isAdFree) return;

    if (adDirectLink) {
      const pageAdTriggered = sessionStorage.getItem('page_ad_triggered');
      if (!pageAdTriggered) {
        window.open(adDirectLink, '_blank', 'noopener,noreferrer');
        sessionStorage.setItem('page_ad_triggered', 'true');
      }
    }
  };

  // 🛡️ Bypass wrappers completely if Admin route, loading, or Ad-Free user
  if (isAdminPath || isAdFree || loading) {
    return <>{children}</>;
  }

  return (
    <div onClick={handlePageClick} className="w-full h-full min-h-screen">
      {/* 📢 STANDARD USER ONLY ADS BANNER */}
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