import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

export default function VIPVideoPlayer({
  mainVideoUrl,
  userProfile,
  accountType,
  vipUntil,
  isAdFree: isAdFreeProp,
  onPlay,
  onDurationUpdate,
  mediaId,
  currentDuration,
  showWatermark = true,
  watermarkPosition = "top-right",
}) {
  const [isAdFreeUser, setIsAdFreeUser] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const mainVideoRef = useRef(null);
  const hasLoggedWatchRef = useRef(false);
  const hasSavedDurationRef = useRef(false);

  const CDN_DOMAIN = "https://cdn.jb-premium-hub.vip";

  const getCleanVideoUrl = (url) => {
    if (!url) return "";
    let formattedUrl = url.startsWith("http") ? url : `${CDN_DOMAIN}/${url}`;
    return formattedUrl.replace(/pub-[a-f0-9]+\.r2\.dev/g, "cdn.jb-premium-hub.vip");
  };

  const videoSrc = getCleanVideoUrl(mainVideoUrl);

  const watermarkPositionClasses = {
    "top-right": "top-3 right-3",
    "top-left": "top-3 left-3",
    "bottom-right": "bottom-3 right-3",
    "bottom-left": "bottom-3 left-3",
  };

  const watermarkClass =
    watermarkPositionClasses[watermarkPosition] || watermarkPositionClasses["top-right"];

  const checkAdFreeStatus = (type, role, expiresAt) => {
    const t = (type || '').toUpperCase();
    const r = (role || '').toUpperCase();

    if (t === 'ADMIN' || r === 'ADMIN') {
      return true;
    }

    if (t !== 'VIP' || !expiresAt) {
      return false;
    }

    return new Date(expiresAt) > new Date();
  };

  const effectiveIsAdFree = isAdFreeProp || isAdFreeUser;

  useEffect(() => {
    hasLoggedWatchRef.current = false;
    hasSavedDurationRef.current = false;
    setIsPlaying(false);
  }, [mainVideoUrl, mediaId]);

  useEffect(() => {
    let isMounted = true;

    const determineStatus = async () => {
      let isAdFree = false;

      if (userProfile) {
        isAdFree = checkAdFreeStatus(
          userProfile.account_type,
          userProfile.role,
          userProfile.vip_until
        );
      } else if (accountType) {
        isAdFree = checkAdFreeStatus(accountType, null, vipUntil);
      } else {
        try {
          const { data: { user } } = await supabase.auth.getUser();

          if (user?.id) {
            const { data: profile, error } = await supabase
              .from('profiles')
              .select('account_type, role, vip_until')
              .eq('id', user.id)
              .maybeSingle();

            if (!error && profile) {
              isAdFree = checkAdFreeStatus(
                profile.account_type,
                profile.role,
                profile.vip_until
              );
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
  }, [mainVideoUrl, accountType, vipUntil, userProfile]);

  const handlePlayOverlayClick = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    startVideoPlay();
  };

  const startVideoPlay = () => {
    setIsPlaying(true);

    if (mainVideoRef.current) {
      mainVideoRef.current
        .play()
        .catch((err) => console.error("Play error:", err));
    }
  };

  const handleLoadedMetadata = async (e) => {
    const durationInSeconds = Math.round(e.target.duration);
    const storedDuration = Number(currentDuration || 0);

    if (
      !mediaId ||
      hasSavedDurationRef.current ||
      !Number.isFinite(durationInSeconds) ||
      durationInSeconds <= 0 ||
      durationInSeconds > 86400 ||
      storedDuration > 0
    ) {
      return;
    }

    try {
      const { data, error } = await supabase.rpc(
        'set_media_duration_if_missing',
        {
          p_media_id: mediaId,
          p_duration: durationInSeconds,
        }
      );

      if (error) throw error;

      // Avoid repeating the RPC during the same media session.
      hasSavedDurationRef.current = true;

      if (data === true && typeof onDurationUpdate === "function") {
        onDurationUpdate(mediaId, durationInSeconds);
      }
    } catch (err) {
      hasSavedDurationRef.current = false;
      console.error("Auto-update video duration error:", err);
    }
  };

  const handleVideoPlay = async () => {
    setIsPlaying(true);

    // Notify Home.jsx so it can record/increment the view count.
    if (typeof onPlay === "function") {
      onPlay();
    }

    // Prevent duplicate watch logs during the same player session.
    // Mark as logged only after the RPC succeeds so a failed request can retry.
    if (hasLoggedWatchRef.current) return;

    try {
      const { error } = await supabase.rpc('log_user_video_watch');

      if (error) throw error;

      hasLoggedWatchRef.current = true;
    } catch (err) {
      hasLoggedWatchRef.current = false;
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

      {/* 🎬 ACTUAL VIDEO FRAME
          This wrapper shrink-wraps the rendered video, so overlays stay
          inside the real landscape/portrait video area instead of black bars. */}
      <div className="relative inline-block max-w-full max-h-[65vh]">

        <video
          ref={mainVideoRef}
          src={videoSrc}
          controls={isPlaying}
          playsInline
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handleVideoPlay}
          className="block max-w-full max-h-[65vh] w-auto h-auto object-contain"
          onError={(e) =>
            console.error(
              "Error loading video:",
              e.target.error,
              "URL Attempted:",
              videoSrc
            )
          }
        />

        {/* 🏷️ JB LOGO WATERMARK - always anchored to the actual video frame */}
        {showWatermark && (
          <img
            src="/jb-logo.png"
            alt=""
            aria-hidden="true"
            draggable={false}
            className={`absolute ${watermarkClass} z-30 w-12 sm:w-14 md:w-16 h-auto opacity-55 pointer-events-none select-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)]`}
          />
        )}

        {/* 📥 DOWNLOAD BUTTON (VIP/ADMIN ONLY) */}
        {effectiveIsAdFree && (
          <div className="absolute top-3 left-3 z-40 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <button
              onClick={handleVipDownload}
              className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-3 py-2 rounded-xl text-xs shadow-lg shadow-amber-500/30 flex items-center gap-2 transition-transform hover:scale-105 cursor-pointer"
            >
              <span className="text-base">📥</span>
              <span className="hidden sm:inline">Download Video</span>
            </button>
          </div>
        )}

        {/* ▶️ CUSTOM INITIAL PLAY OVERLAY
            Also bound to the actual video frame for portrait + landscape. */}
        {!isPlaying && (
          <div
            onClick={handlePlayOverlayClick}
            className="absolute inset-0 bg-black/60 hover:bg-black/40 transition-all flex flex-col items-center justify-center cursor-pointer z-20 group"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-600 group-hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform duration-300 border border-red-400/30">
              <svg
                className="w-8 h-8 sm:w-10 sm:h-10 fill-current ml-1"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>

            <span className="mt-4 text-[10px] sm:text-xs font-bold text-white tracking-widest uppercase bg-slate-900/90 border border-slate-700/80 px-3 sm:px-4 py-2 rounded-xl shadow-lg">
              Click to Play Video
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
