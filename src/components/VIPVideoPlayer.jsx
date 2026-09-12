import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

export default function VIPVideoPlayer({ mainVideoUrl, userProfile, accountType }) {
  const [checkingUser, setCheckingUser] = useState(true);
  const [isAdFreeUser, setIsAdFreeUser] = useState(false);
  const [adClicks, setAdClicks] = useState(0);

  const mainVideoRef = useRef(null);
  const hasLoggedWatchRef = useRef(false);

  const CDN_DOMAIN = "https://cdn.jb-premium-hub.vip";
  
  // 🎬 KITA COUNTER: Ilang video ang pwedeng panoorin bago bumalik ang ads (Halimbawa: 3 videos)
  const MAX_VIDEOS_ALLOWED = 3;

  const getCleanVideoUrl = (url) => {
    if (!url) return "";
    let formattedUrl = url.startsWith("http") ? url : `${CDN_DOMAIN}/${url}`;
    return formattedUrl.replace(/pub-[a-f0-9]+\.r2\.dev/g, "cdn.jb-premium-hub.vip");
  };

  const videoSrc = getCleanVideoUrl(mainVideoUrl);

  const checkAdFreeStatus = (type, role) => {
    const t = (type || '').toUpperCase();
    const r = (role || '').toUpperCase();
    return t === 'VIP' || t === 'ADMIN' || r === 'ADMIN';
  };

  useEffect(() => {
    hasLoggedWatchRef.current = false;
  }, [mainVideoUrl]);

  const handleVideoPlay = async () => {
    if (hasLoggedWatchRef.current) return;
    hasLoggedWatchRef.current = true;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase.rpc('log_user_video_watch', { p_user_id: user.id });
      }
    } catch (err) {
      console.error("Error logging video watch:", err);
    }
  };

  // 🔄 Bilang ng Napanood na Video bago mag-Reset ang Ads
  useEffect(() => {
    let isMounted = true;

    const determineStatus = async () => {
      setCheckingUser(true);
      let isAdFree = false;

      if (accountType) {
        isAdFree = checkAdFreeStatus(accountType);
      } else if (userProfile) {
        isAdFree = checkAdFreeStatus(userProfile.account_type, userProfile.role);
      } else {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            const { data: profile, error } = await supabase
              .from('profiles')
              .select('account_type, role')
              .eq('id', user.id)
              .maybeSingle();

            if (!error && profile) {
              isAdFree = checkAdFreeStatus(profile.account_type, profile.role);
            }
          }
        } catch (err) {
          console.error("Error fetching user status:", err);
        }
      }

      if (!isMounted) return;
      setIsAdFreeUser(isAdFree);
      
      if (!isAdFree) {
        const savedClicks = parseInt(sessionStorage.getItem('jb_video_clicks') || '0');
        let watchedCount = parseInt(sessionStorage.getItem('jb_watched_since_ads') || '0');

        // Kung unlocked na ang ads (3 clicks done na), dagdagan ang count kapag nagbukas ng panibagong video
        if (savedClicks >= 3) {
          watchedCount += 1;

          // Kapag lumagpas na sa MAX_VIDEOS_ALLOWED (3 videos), I-RESET ULIT ANG ADS!
          if (watchedCount > MAX_VIDEOS_ALLOWED) {
            sessionStorage.setItem('jb_video_clicks', '0');
            sessionStorage.setItem('jb_watched_since_ads', '0');
            setAdClicks(0);
          } else {
            sessionStorage.setItem('jb_watched_since_ads', watchedCount.toString());
            setAdClicks(3);
          }
        } else {
          setAdClicks(savedClicks);
        }
      }

      setCheckingUser(false);
    };

    if (mainVideoUrl) {
      determineStatus();
    }
    
    return () => {
      isMounted = false;
    };
  }, [mainVideoUrl, accountType, userProfile]);

  const handleAdShieldClick = (e) => {
    if (isAdFreeUser) return;

    if (adClicks < 3) {
      e.preventDefault();
      e.stopPropagation();

      const nextClicks = adClicks + 1;
      sessionStorage.setItem('jb_video_clicks', nextClicks.toString());

      // Sa 3rd click, simulan na ang bilang ng 1st video
      if (nextClicks >= 3) {
        sessionStorage.setItem('jb_watched_since_ads', '1');
      }

      setAdClicks(nextClicks);

      const currentUrl = window.location.href;

      // 1. Bubuksan ang eksaktong video sa bagong tab
      const newSiteTab = window.open(currentUrl, '_blank');
      if (newSiteTab) {
        newSiteTab.focus();
      }

      // 2. Ang lumang tab ay pupunta sa Adsterra Direct Link
      window.location.href = 'https://deeprootedpressure.com/vja5sy3m?key=fc8ea4a621cb34f209a9fa31d4b85bea';
    }
  };

  const handleVipDownload = (e) => {
    if (e) e.stopPropagation();
    if (!videoSrc) return;

    const link = document.createElement("a");
    link.href = videoSrc;
    link.setAttribute("download", `Vault-VIP-Video-${Date.now()}.mp4`);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (checkingUser) {
    return (
      <div className="relative w-full h-full min-h-[320px] md:min-h-[420px] flex items-center justify-center bg-black rounded-xl border border-slate-800">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600"></div>
      </div>
    );
  }

  const canPlayVideo = isAdFreeUser || adClicks >= 3;

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black rounded-xl overflow-hidden shadow-2xl group border border-slate-800/80 select-none">
      
      {/* 👑 VIP DOWNLOAD BUTTON */}
      {isAdFreeUser && (
        <div className="absolute top-4 right-4 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button
            onClick={handleVipDownload}
            className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-4 py-2 rounded-xl text-xs shadow-lg shadow-amber-500/30 flex items-center gap-2 transition-transform hover:scale-105 cursor-pointer"
          >
            <span className="text-base">💾</span>
            <span>Download Video</span>
          </button>
        </div>
      )}

      {/* 🛡️ INVISIBLE AD SHIELD */}
      {!canPlayVideo && (
        <div
          onClick={handleAdShieldClick}
          className="absolute inset-0 z-50 cursor-pointer bg-transparent"
        />
      )}

      {/* 🎥 VIDEO PLAYER */}
      <video
        ref={mainVideoRef}
        src={videoSrc}
        controls={canPlayVideo}
        playsInline
        onPlay={handleVideoPlay}
        controlsList={isAdFreeUser ? "" : "nodownload"}
        className="w-full h-full max-h-[65vh] object-contain"
        onError={(e) => console.error("Error loading video:", e.target.error, "URL Attempted:", videoSrc)}
      />
    </div>
  );
}