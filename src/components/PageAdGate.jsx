import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

export default function PageAdGate({ children, adDirectLink }) {
  const [isVip, setIsVip] = useState(false);
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
          .select('account_type')
          .eq('id', user.id)
          .single();

        if (profile && profile.account_type?.toUpperCase() === 'VIP') {
          setIsVip(true);
        }
      }
    } catch (err) {
      console.error("Error checking user account type:", err);
    } finally {
      setLoading(false);
    }
  };

  // Trigger Adsterra / Direct Link para sa Standard Users kapag nag-click sa page
  const handlePageClick = () => {
    if (!isVip && adDirectLink) {
      // I-check kung na-click na ang ad sa session na ito (optional)
      const pageAdTriggered = sessionStorage.getItem('page_ad_triggered');
      if (!pageAdTriggered) {
        window.open(adDirectLink, '_blank', 'noopener,noreferrer');
        sessionStorage.setItem('page_ad_triggered', 'true');
      }
    }
  };

  if (loading) return <>{children}</>;

  return (
    <div onClick={handlePageClick} className="w-full h-full min-h-screen">
      {/* 📢 STANDARD USER ONLY ADS (Banner Ad / Popunder code) */}
      {!isVip && (
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