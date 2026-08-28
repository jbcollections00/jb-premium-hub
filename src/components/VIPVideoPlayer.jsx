import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

export default function VIPVideoPlayer({ mainVideoUrl, adDirectLink, userProfile, accountType }) {
  const [isPlayingAd, setIsPlayingAd] = useState(false);
  const [timeLeft, setTimeLeft] = useState(3);
  const [canSkip, setCanSkip] = useState(false);
  const [checkingUser, setCheckingUser] = useState(true);
  const [isAdFreeUser, setIsAdFreeUser] = useState(false);

  const mainVideoRef = useRef(null);

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

  // 1️⃣ Check User VIP / Admin Status & Apply Ad Logic
  useEffect(() => {
    let isMounted = true;

    const determineAdBehavior = async () => {
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
          console.error("Error fetching user status for video player:", err);
        }
      }

      if (!isMounted) return;

      setIsAdFreeUser(isAdFree);

      // 📢 Triggers pre-roll ad on EVERY video play for standard users
      if (!isAdFree) {
        setIsPlayingAd(true);
        setTimeLeft(3);
        setCanSkip(false);
      } else {
        setIsPlayingAd(false);
      }

      setCheckingUser(false);
    };

    if (mainVideoUrl) {
      determineAdBehavior();
    }
    
    return () => {
      isMounted = false;
    };
  }, [mainVideoUrl, accountType, userProfile]);

  // 2️⃣ 5-Second Countdown Timer for Skip Ad button
  useEffect(() => {
    if (!isPlayingAd || checkingUser) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setCanSkip(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlayingAd, checkingUser]);

  const openAdsterra = (e) => {
    if (e) e.stopPropagation();
    if (adDirectLink && !isAdFreeUser) {
      window.open(adDirectLink, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSkipAd = (e) => {
    e.stopPropagation();
    if (!canSkip) return;

    openAdsterra();
    setIsPlayingAd(false);
  };

  const handleOverlayClick = () => {
    openAdsterra();
    if (canSkip) {
      setIsPlayingAd(false);
    }
  };

  // 💾 INSTANT DIRECT DOWNLOAD HANDLER
  const handleVipDownload = (e) => {
    if (e) e.stopPropagation();
    if (!videoSrc) return;

    openAdsterra();

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

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black rounded-xl overflow-hidden shadow-2xl group border border-slate-800/80 select-none">
      
      {/* 👑 VIP / ADMIN DOWNLOAD BUTTON */}
      {isAdFreeUser && !isPlayingAd && (
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

      {isPlayingAd ? (
        <div 
          className="relative w-full h-full min-h-[320px] md:min-h-[420px] flex flex-col justify-between p-4 md:p-6 bg-slate-950/90 cursor-pointer backdrop-blur-sm"
          onClick={handleOverlayClick}
        >
          <div className="flex items-center justify-between z-20">
            <div className="flex items-center gap-1.5 bg-yellow-500 text-black px-2.5 py-1 rounded-md font-extrabold text-[11px] tracking-wider uppercase shadow-md">
              <span>📢 Ad</span>
              <span className="text-[9px] opacity-80">• Sponsored Stream</span>
            </div>

            <div className="bg-black/80 text-slate-300 px-3 py-1 rounded-lg text-xs font-medium border border-slate-700/50 backdrop-blur-md">
              {canSkip ? (
                <span className="text-emerald-400 font-bold">✓ Stream Ready!</span>
              ) : (
                <span>Unlocking in <b className="text-yellow-400">{timeLeft}s</b></span>
              )}
            </div>
          </div>

          <div className="my-auto text-center flex flex-col items-center justify-center gap-3 z-10">
            <div className="w-16 h-16 bg-red-600/20 text-red-500 rounded-full flex items-center justify-center border border-red-500/30 animate-pulse shadow-lg">
              <svg className="w-8 h-8 fill-current ml-1" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <h3 className="text-white text-base md:text-lg font-bold">
              Click anywhere to start video & support high-speed server
            </h3>
            <p className="text-slate-400 text-xs">
              (Opens sponsor offer in new tab)
            </p>
          </div>

          <div className="flex items-center justify-between z-20 gap-2">
            <button
              type="button"
              onClick={openAdsterra}
              className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-600/50 backdrop-blur-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>🔗 Visit Advertiser</span>
            </button>

            {canSkip ? (
              <button
                type="button"
                onClick={handleSkipAd}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl border border-blue-400/30 text-xs md:text-sm shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-1.5 hover:scale-105 active:scale-95"
              >
                <span>Skip Ad & Play</span>
                <span className="text-base">➔</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="bg-slate-800/80 text-slate-500 px-4 py-2 rounded-xl text-xs font-medium border border-slate-700/50 cursor-not-allowed"
              >
                Wait {timeLeft}s to skip...
              </button>
            )}
          </div>
        </div>
      ) : (
        <video
          ref={mainVideoRef}
          src={videoSrc}
          controls
          autoPlay
          playsInline
          controlsList={isAdFreeUser ? "" : "nodownload"}
          className="w-full h-full max-h-[65vh] object-contain"
          onError={(e) => console.error("Error loading video:", e.target.error, "URL Attempted:", videoSrc)}
        />
      )}
    </div>
  );
}