import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

export default function VIPVideoPlayer({ mainVideoUrl, adDirectLink, userProfile, accountType }) {
  const [isPlayingAd, setIsPlayingAd] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5);
  const [canSkip, setCanSkip] = useState(false);
  const [checkingUser, setCheckingUser] = useState(true);

  const mainVideoRef = useRef(null);

  // ☁️ CLOUDFLARE R2 SETUP
  const CLOUDFLARE_DOMAIN = "https://pub-8edb47f7180d41ab0a76011487e787b0.r2.dev";
  const videoSrc = mainVideoUrl?.startsWith("http") 
    ? mainVideoUrl 
    : `${CLOUDFLARE_DOMAIN}/${mainVideoUrl}`;

  // 1️⃣ Check User VIP Status & Apply Modulo 6 Ad Logic
  useEffect(() => {
    let isMounted = true;

    const determineAdBehavior = async () => {
      setCheckingUser(true);
      let isVip = false;

      // Check via props first if provided
      if (accountType) {
        isVip = accountType.toUpperCase() === 'VIP';
      } else if (userProfile) {
        isVip = (userProfile.account_type || '').toUpperCase() === 'VIP';
      } else {
        // Fallback: Fetch logged-in user profile from Supabase
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('account_type')
              .eq('id', user.id)
              .single();
            if (profile) {
              isVip = (profile.account_type || '').toUpperCase() === 'VIP';
            }
          }
        } catch (err) {
          console.error("Error fetching user status for video player:", err);
        }
      }

      if (!isMounted) return;

      if (!isVip) {
        // 👤 STANDARD USER: Always show ads on every video
        setIsPlayingAd(true);
        setTimeLeft(5);
        setCanSkip(false);
      } else {
        // 👑 VIP USER: 5 Videos Direct Play (No Ad), 6th Video Shows Ad
        const currentCount = parseInt(localStorage.getItem('vip_video_watch_count') || '0', 10);
        const newCount = currentCount + 1;
        localStorage.setItem('vip_video_watch_count', newCount.toString());

        if (newCount % 6 === 0) {
          // 6th, 12th, 18th video -> Show Ad
          setIsPlayingAd(true);
          setTimeLeft(5);
          setCanSkip(false);
        } else {
          // 1st to 5th video -> Direct Play (No Ad)
          setIsPlayingAd(false);
        }
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

  // 💰 Open Adsterra Direct Link in a new tab
  const openAdsterra = (e) => {
    if (e) e.stopPropagation();
    if (adDirectLink) {
      window.open(adDirectLink, '_blank', 'noopener,noreferrer');
    }
  };

  // ⏩ Skip Ad Handler: Triggers Adsterra ad & starts main video
  const handleSkipAd = (e) => {
    e.stopPropagation();
    if (!canSkip) return;

    openAdsterra();
    setIsPlayingAd(false);
  };

  // 🎯 Screen Click Handler: Triggers Adsterra ad & plays video if countdown finished
  const handleOverlayClick = () => {
    openAdsterra();
    if (canSkip) {
      setIsPlayingAd(false);
    }
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
      
      {isPlayingAd ? (
        /* ==================== 📢 ADSTERRA MONETIZED OVERLAY ==================== */
        <div 
          className="relative w-full h-full min-h-[320px] md:min-h-[420px] flex flex-col justify-between p-4 md:p-6 bg-slate-950/90 cursor-pointer backdrop-blur-sm"
          onClick={handleOverlayClick}
        >
          {/* Top Bar: Ad Badge & Countdown Status */}
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

          {/* Center Call-to-Action */}
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

          {/* Bottom Bar Controls */}
          <div className="flex items-center justify-between z-20 gap-2">
            {/* Visit Advertiser Button */}
            <button
              type="button"
              onClick={openAdsterra}
              className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-600/50 backdrop-blur-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>🔗 Visit Advertiser</span>
            </button>

            {/* Skip Ad / Countdown Button */}
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
        /* ==================== 🎥 MAIN VIP VIDEO PLAYER ==================== */
        <video
          ref={mainVideoRef}
          src={videoSrc}
          controls
          autoPlay
          playsInline
          controlsList="nodownload"
          className="w-full h-full max-h-[65vh] object-contain"
          onError={(e) => console.error("Error loading video:", e.target.error, "URL Attempted:", videoSrc)}
        />
      )}
    </div>
  );
}