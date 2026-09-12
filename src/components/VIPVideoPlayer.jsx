import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

export default function VIPVideoPlayer({ mainVideoUrl, userProfile, accountType }) {
  const [checkingUser, setCheckingUser] = useState(true);
  const [isAdFreeUser, setIsAdFreeUser] = useState(false);
  const [adClicks, setAdClicks] = useState(0);

  const mainVideoRef = useRef(null);
  const hasLoggedWatchRef = useRef(false);

  const CDN_DOMAIN = "https://cdn.jb-premium-hub.vip";
  
  const getCleanVideoUrl = (url) => {
    if (!url) return "";
    let formattedUrl = url.startsWith("http") ? url : `${CDN_DOMAIN}/${url}`;
    return formattedUrl.replace(/pub-[a-f0-9]+\.r2\.dev/g, "cdn.jb-premium-hub.vip");
  };

  const videoSrc = getCleanVideoUrl(mainVideoUrl);

  // Helper check for Admin or VIP status
  const checkAdFreeStatus = (type, role) => {
    const t = (type || '').toUpperCase();
    const r = (role || '').toUpperCase();
    return t === 'VIP' || t === 'ADMIN' || r === 'ADMIN';
  };

  useEffect(() => {
    hasLoggedWatchRef.current = false;
  }, [mainVideoUrl]);

  // Log Video Watch for Referral Contest
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

  // 1️⃣ Check User VIP / Admin Status & Load Click Memory
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
      
      // Load saved ad clicks from this browser session
      const savedClicks = parseInt(sessionStorage.getItem('jb_video_clicks') || '0');
      setAdClicks(savedClicks);
      setCheckingUser(false);
    };

    if (mainVideoUrl) {
      determineStatus();
    }
    
    return () => {
      isMounted = false;
    };
  }, [mainVideoUrl, accountType, userProfile]);

  // 2️⃣ The 3-Click Tab-Under Logic
  const handleAdShieldClick = (e) => {
    if (isAdFreeUser) return;

    if (adClicks < 3) {
      e.preventDefault();
      e.stopPropagation();

      const nextClicks = adClicks + 1;
      
      // Save new click count so the new tab remembers it
      sessionStorage.setItem('jb_video_clicks', nextClicks.toString());
      setAdClicks(nextClicks);

      // 1. Open the CURRENT site in a NEW tab
      window.open(window.location.href, '_blank');

      // 2. Redirect the CURRENT tab to your Adsterra Direct Link
      window.location.href = 'https://deeprootedpressure.com/vja5sy3m?key=fc8ea4a621cb34f209a9fa31d4b85bea';
    }
  };

  // 💾 INSTANT DIRECT DOWNLOAD HANDLER (VIP ONLY)
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

  // Define if the user has full access to the video yet
  const canPlayVideo = isAdFreeUser || adClicks >= 3;

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black rounded-xl overflow-hidden shadow-2xl group border border-slate-800/80 select-none">
      
      {/* 👑 VIP / ADMIN DOWNLOAD BUTTON */}
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
          className="absolute inset-0 z-50 cursor-pointer flex flex-col items-center justify-center bg-black/40 hover:bg-black/20 transition-all"
          title="Click to play video"
        >
          {/* Optional visual cue so they know to click */}
          <div className="w-16 h-16 bg-red-600/80 text-white rounded-full flex items-center justify-center shadow-2xl animate-pulse">
            <svg className="w-8 h-8 fill-current ml-1" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <p className="text-white mt-3 font-bold text-sm tracking-wide text-shadow-md">
            Tap to Play ({3 - adClicks} clicks remaining)
          </p>
        </div>
      )}

      {/* 🎥 ACTUAL VIDEO PLAYER */}
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