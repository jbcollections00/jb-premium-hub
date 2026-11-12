import { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

export default function VIPVideoPlayer({
  mainVideoUrl,
  autoPlay = false,
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
  const [hasStarted, setHasStarted] = useState(false);
  const [isSeekReady, setIsSeekReady] = useState(false);
  const [showSeekOverlay, setShowSeekOverlay] = useState(true);
  const overlayTimerRef = useRef(null);
  const mainVideoRef = useRef(null);
  const overlayVisible = showSeekOverlay || !isPlaying;

  // Tracking refs
  const hasLoggedWatchRef = useRef(false);
  const hasNotifiedPlayRef = useRef(false);
  const hasSavedDurationRef = useRef(false);
  const isLoggingWatchRef = useRef(false);

  // Active video tracking refs para sa stale request protection
  const currentMediaIdRef = useRef(mediaId);
  const currentVideoUrlRef = useRef(mainVideoUrl);

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

  // When Home supplies an explicit boolean, do not override billing truth with stale profile fields.
  const effectiveIsAdFree = typeof isAdFreeProp === "boolean" ? isAdFreeProp : isAdFreeUser;

  // 🔄 1. Reset tracking refs, playback state, at active video reference kapag nagpalit ng video
  useEffect(() => {
    hasLoggedWatchRef.current = false;
    hasNotifiedPlayRef.current = false;
    hasSavedDurationRef.current = false;
    isLoggingWatchRef.current = false;

    currentMediaIdRef.current = mediaId;
    currentVideoUrlRef.current = mainVideoUrl;

    setIsPlaying(false);
    setHasStarted(false);
    setIsSeekReady(false);
    setShowSeekOverlay(true);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
  }, [mainVideoUrl, mediaId]);

  // 🎬 2. Programmatic Autoplay execution
  useEffect(() => {
    if (autoPlay && mainVideoRef.current) {
      mainVideoRef.current
        .play()
        .catch((err) => {
          console.log("Autoplay was prevented by browser policy:", err);
        });
    }
  }, [mainVideoUrl, mediaId, autoPlay]);

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

  // YouTube-style in-video overlay: visible while paused, and briefly after interaction.
  const revealSeekOverlay = () => {
    setShowSeekOverlay(true);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => {
      if (mainVideoRef.current && !mainVideoRef.current.paused) {
        setShowSeekOverlay(false);
      }
    }, 2400);
  };

  useEffect(() => () => {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
  }, []);

  // Rewind / forward exactly 10 seconds, clamped to the current video's duration.
  const seekBy = (seconds) => {
    const video = mainVideoRef.current;
    if (!video || !Number.isFinite(video.currentTime) || video.readyState < 1) return;

    const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
    const nextTime = Math.max(0, Math.min(video.currentTime + seconds, duration));
    try {
      video.currentTime = nextTime;
      revealSeekOverlay();
    } catch (error) {
      console.error('Unable to seek video:', error);
    }
  };

  const togglePlayback = () => {
    const video = mainVideoRef.current;
    if (!video) return;
    if (video.paused) startVideoPlay();
    else video.pause();
  };

  const startVideoPlay = () => {
    if (mainVideoRef.current) {
      mainVideoRef.current
        .play()
        .catch((err) => {
          console.error("Play error:", err);
        });
    }
  };

  const handleLoadedMetadata = async (e) => {
    setIsSeekReady(true);
    const durationInSeconds = Math.round(e.target.duration);
    const storedDuration = Number(currentDuration || 0);

    const targetMediaId = mediaId;
    const targetVideoUrl = mainVideoUrl;

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

      if (
        currentMediaIdRef.current === targetMediaId &&
        currentVideoUrlRef.current === targetVideoUrl
      ) {
        hasSavedDurationRef.current = true;

        if (data === true && typeof onDurationUpdate === "function") {
          onDurationUpdate(mediaId, durationInSeconds);
        }
      }
    } catch (err) {
      if (
        currentMediaIdRef.current === targetMediaId &&
        currentVideoUrlRef.current === targetVideoUrl
      ) {
        hasSavedDurationRef.current = false;
      }
      console.error("Auto-update video duration error:", err);
    }
  };

  const handleVideoPlay = async () => {
    setIsPlaying(true);
    setHasStarted(true);
    revealSeekOverlay();

    if (!hasNotifiedPlayRef.current) {
      hasNotifiedPlayRef.current = true;

      if (typeof onPlay === "function") {
        onPlay();
      }
    }

    const targetMediaId = mediaId;
    const targetVideoUrl = mainVideoUrl;

    if (hasLoggedWatchRef.current || isLoggingWatchRef.current) return;

    isLoggingWatchRef.current = true;

    try {
      const { error } = await supabase.rpc('log_user_video_watch');

      if (error) throw error;

      if (
        currentMediaIdRef.current === targetMediaId &&
        currentVideoUrlRef.current === targetVideoUrl
      ) {
        hasLoggedWatchRef.current = true;
      }
    } catch (err) {
      console.error("Error logging video watch:", err);
    } finally {
      if (
        currentMediaIdRef.current === targetMediaId &&
        currentVideoUrlRef.current === targetVideoUrl
      ) {
        isLoggingWatchRef.current = false;
      }
    }
  };

  const handleVideoPause = () => {
    setIsPlaying(false);
    setShowSeekOverlay(true);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    setShowSeekOverlay(true);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
  };

  return (
    <div className="flex flex-col w-full bg-slate-950 rounded-xl overflow-hidden shadow-2xl border border-slate-800/80">
      
      {/* 🎬 MAIN PLAYER CONTAINER */}
      <div
        className="relative w-full h-full flex items-center justify-center bg-black group select-none"
        onMouseMove={revealSeekOverlay}
        onTouchStart={revealSeekOverlay}
      >
        <div className="relative inline-block max-w-full max-h-[65vh]">

          <video
            ref={mainVideoRef}
            src={videoSrc}
            controls={hasStarted}
            controlsList={!effectiveIsAdFree ? "nodownload" : undefined}
            onContextMenu={(e) => {
              if (!effectiveIsAdFree) e.preventDefault();
            }}
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            onClick={revealSeekOverlay}
            onEmptied={() => setIsSeekReady(false)}
            onPlay={handleVideoPlay}
            onPause={handleVideoPause}
            onEnded={handleVideoEnded}
            className="block max-w-full max-h-[65vh] w-auto h-auto object-contain"
            onError={(e) => {
              setIsSeekReady(false);
              console.error("Error loading video:", e.target.error, "URL Attempted:", videoSrc);
            }}
          />

          {/* 🏷️ JB LOGO WATERMARK */}
          {showWatermark && (
            <img
              src="/jb-logo.png"
              alt=""
              aria-hidden="true"
              draggable={false}
              className={`absolute ${watermarkClass} z-30 w-12 sm:w-14 md:w-16 h-auto opacity-55 pointer-events-none select-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)]`}
            />
          )}

          {/* ▶️ INITIAL PLAY OVERLAY (Lumalabas lamang BAGO magsimulang mag-play ang video) */}
          {!hasStarted && (
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

          {/* On-screen 10s skip / play overlay: sits on the video, NOT beneath it. */}
          {hasStarted && (
            <div
              className={`absolute inset-0 z-20 flex items-center justify-center gap-3 sm:gap-8 px-2 pb-10 sm:pb-12 pointer-events-none transition-opacity duration-200 ${
                overlayVisible ? "opacity-100" : "opacity-0"
              }`}
              aria-label="Video playback shortcuts"
            >
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); seekBy(-10); }}
                disabled={!isSeekReady}
                aria-label="Rewind 10 seconds"
                title="Rewind 10 seconds"
                className={`${overlayVisible ? "pointer-events-auto" : "pointer-events-none"} inline-flex h-12 w-12 sm:h-16 sm:w-16 shrink-0 flex-col items-center justify-center rounded-full bg-black/65 text-white shadow-xl ring-1 ring-white/20 backdrop-blur-sm transition-transform hover:scale-110 hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <svg viewBox="0 0 32 32" className="w-7 h-7 sm:w-9 sm:h-9" aria-hidden="true" fill="none">
                  <path d="M9 9H3V3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 9A12 12 0 1 1 4 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  <text x="16.5" y="21" fontSize="10" fontWeight="bold" fill="currentColor" textAnchor="middle">10</text>
                </svg>
              </button>
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); togglePlayback(); }}
                disabled={!isSeekReady}
                aria-label={isPlaying ? "Pause video" : "Play video"}
                title={isPlaying ? "Pause video" : "Play video"}
                className={`${overlayVisible ? "pointer-events-auto" : "pointer-events-none"} inline-flex h-14 w-14 sm:h-20 sm:w-20 shrink-0 items-center justify-center rounded-full bg-black/70 text-white shadow-2xl ring-1 ring-white/25 backdrop-blur-sm transition-transform hover:scale-110 hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" className="h-6 w-6 sm:h-9 sm:w-9" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-6 w-6 sm:h-9 sm:w-9" fill="currentColor" aria-hidden="true"><path d="M8 4.5v15l12-7.5z" /></svg>
                )}
              </button>
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); seekBy(10); }}
                disabled={!isSeekReady}
                aria-label="Forward 10 seconds"
                title="Forward 10 seconds"
                className={`${overlayVisible ? "pointer-events-auto" : "pointer-events-none"} inline-flex h-12 w-12 sm:h-16 sm:w-16 shrink-0 flex-col items-center justify-center rounded-full bg-black/65 text-white shadow-xl ring-1 ring-white/20 backdrop-blur-sm transition-transform hover:scale-110 hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <svg viewBox="0 0 32 32" className="w-7 h-7 sm:w-9 sm:h-9" aria-hidden="true" fill="none">
                  <path d="M23 9h6V3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M29 9A12 12 0 1 0 28 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  <text x="15.5" y="21" fontSize="10" fontWeight="bold" fill="currentColor" textAnchor="middle">10</text>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>


    </div>
  );
}
