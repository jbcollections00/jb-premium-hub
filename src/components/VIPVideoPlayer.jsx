import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

const SMARTLINK_AD_URL = "https://deeprootedpressure.com/vja5sy3m?key=fc8ea4a621cb34f209a9fa31d4b85bea";

export default function VIPVideoPlayer({
  mainVideoUrl,
  userProfile,
  accountType,
  isAdFree: isAdFreeProp,
  onPlay
}) {
  const [isAdFreeUser, setIsAdFreeUser] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const mainVideoRef = useRef(null);
  const hasLoggedWatchRef = useRef(false);

  const CDN_DOMAIN = "https://cdn.jb-premium-hub.vip";

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

  const effectiveIsAdFree = isAdFreeProp || isAdFreeUser;

  useEffect(() => {
    hasLoggedWatchRef.current = false;
    setIsPlaying(false);
  }, [mainVideoUrl]);

  useEffect(() => {
    let isMounted = true;

    const determineStatus = async () => {
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

      if (isMounted) {
        setIsAdFreeUser(isAdFree);
      }
    };

    if (mainVideoUrl) {
      determineStatus();
    }

    return () => {
      isMounted = false;
    };
  }, [mainVideoUrl, accountType, userProfile]);

  const getStepFromUrl = () => {
    if (typeof window === "undefined") return 1;
    const params = new URLSearchParams(window.location.search);
    const step = parseInt(params.get("step"), 10);
    return isNaN(step) ? 1 : step;
  };

  const handlePlayOverlayClick = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // 1. VIP / Admin -> Direct Play (No Ads)
    if (effectiveIsAdFree) {
      startVideoPlay();
      return;
    }

    // 2. Standard User 3-Step Ad Logic
    const currentStep = getStepFromUrl();

    if (currentStep < 3) {
      // Ihanda ang URL para sa bagong tab na may updated step
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("step", String(currentStep + 1));

      // 1. Unang i-open ang bagong tab para sa Video Page (Step + 1)
      const newTab = window.open(nextUrl.toString(), "_blank");
      if (newTab) {
        newTab.focus();
      }

      // 2. Pagkatapos ay ire-direct ang lumang tab papunta sa Smartlink Ad
      window.location.href = SMARTLINK_AD_URL;
    } else {
      // Step >= 3: Diretso nang mag-play ang video
      startVideoPlay();
    }
  };

  const startVideoPlay = () => {
    setIsPlaying(true);
    if (mainVideoRef.current) {
      mainVideoRef.current.play().catch((err) => console.error("Play error:", err));
    }
  };

  const handleVideoPlay = async () => {
    setIsPlaying(true);

    // Tawagin ang onPlay handler para mag-increment ang view count sa Home.jsx
    if (typeof onPlay === "function") {
      onPlay();
    }

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

  const handleVipDownload = (e) => {
    if (e) e.stopPropagation();
    if (!videoSrc) return;

    const link = document.createElement("a");
    link.href = videoSrc;
    link.setAttribute("download", `Vault-Video-${Date.now()}.mp4`);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black rounded-xl overflow-hidden shadow-2xl group border border-slate-800/80 select-none">
      
      {/* 📥 DOWNLOAD BUTTON (VIP/ADMIN ONLY) */}
      {effectiveIsAdFree && (
        <div className="absolute top-4 right-4 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button
            onClick={handleVipDownload}
            className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-4 py-2 rounded-xl text-xs shadow-lg shadow-amber-500/30 flex items-center gap-2 transition-transform hover:scale-105 cursor-pointer"
          >
            <span className="text-base">📥</span>
            <span>Download Video</span>
          </button>
        </div>
      )}

      {/* 🎬 DIRECT VIDEO PLAYER */}
      <video
        ref={mainVideoRef}
        src={videoSrc}
        controls={isPlaying}
        playsInline
        onPlay={handleVideoPlay}
        className="w-full h-full max-h-[65vh] object-contain"
        onError={(e) => console.error("Error loading video:", e.target.error, "URL Attempted:", videoSrc)}
      />

      {/* 🔴 CUSTOM PLAY OVERLAY FOR ADS & INITIAL PLAY */}
      {!isPlaying && (
        <div
          onClick={handlePlayOverlayClick}
          className="absolute inset-0 bg-black/60 hover:bg-black/40 transition-all flex flex-col items-center justify-center cursor-pointer z-20 group"
        >
          <div className="w-20 h-20 bg-red-600 group-hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform duration-300 border border-red-400/30">
            <svg
              className="w-10 h-10 fill-current ml-1"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <span className="mt-4 text-xs font-bold text-white tracking-widest uppercase bg-slate-900/90 border border-slate-700/80 px-4 py-2 rounded-xl shadow-lg">
            Click to Play Video
          </span>
        </div>
      )}
    </div>
  );
}