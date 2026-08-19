import { useState, useEffect, useRef } from 'react';

export default function VIPVideoPlayer({ mainVideoUrl, adVideoUrl, adDirectLink }) {
  const [isPlayingAd, setIsPlayingAd] = useState(true);
  const [timeLeft, setTimeLeft] = useState(5); // 5 seconds countdown
  const [canSkip, setCanSkip] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // Default Muted para pumasa sa browser Autoplay policy
  
  const adVideoRef = useRef(null);
  const mainVideoRef = useRef(null);

  // 1️⃣ Reset ang Ad Player kapag pinalitan ng user ang pinapanood na VIP Video
  useEffect(() => {
    setIsPlayingAd(true);
    setTimeLeft(5);
    setCanSkip(false);
    setIsMuted(true);
  }, [mainVideoUrl]);

  // 2️⃣ Countdown Timer para sa Skip Ad button
  useEffect(() => {
    if (!isPlayingAd) return;

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
  }, [isPlayingAd]);

  // ⏩ Skip Ad Handler
  const handleSkipAd = (e) => {
    e.stopPropagation(); // Iwasan ang pag-click sa ad background
    setIsPlayingAd(false);
  };

  // 🎬 Kapag natapos ang Ad
  const handleAdEnded = () => {
    setIsPlayingAd(false);
  };

  // 🔊 Sound Toggle Handler
  const toggleMute = (e) => {
    e.stopPropagation(); // Iwasan ang pag-click sa ad background
    setIsMuted((prev) => !prev);
  };

  // 💰 Ad Background Click Handler (Ad Network / Direct Link)
  const handleAdClick = () => {
    if (adDirectLink) {
      window.open(adDirectLink, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black rounded-xl overflow-hidden shadow-2xl group border border-slate-800/80">
      
      {isPlayingAd ? (
        /* ==================== 📢 IN-STREAM VIDEO AD PLAYER ==================== */
        <div 
          className="relative w-full h-full flex items-center justify-center cursor-pointer select-none" 
          onClick={handleAdClick}
        >
          {/* Ad Video Stream */}
          <video
            ref={adVideoRef}
            src={adVideoUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"} // Fallback test ad
            autoPlay
            playsInline
            muted={isMuted} // Muted default para gumana ang autoplay
            className="w-full h-full max-h-[65vh] object-contain"
            onEnded={handleAdEnded}
          />

          {/* Top Left: Ad Badge & Unmute Button */}
          <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
            <div className="flex items-center gap-1.5 bg-yellow-500 text-black px-2.5 py-1 rounded-md font-extrabold text-[11px] tracking-wider uppercase shadow-md">
              <span>📢 Ad</span>
              <span className="text-[9px] opacity-80">• Sponsored</span>
            </div>

            {/* 🔊 Unmute/Mute Toggle Button */}
            <button
              onClick={toggleMute}
              className="bg-black/80 hover:bg-black text-white text-xs font-semibold px-2.5 py-1 rounded-md border border-white/20 backdrop-blur-md transition-all flex items-center gap-1 cursor-pointer"
            >
              {isMuted ? '🔇 Unmute' : '🔊 Mute'}
            </button>
          </div>

          {/* Bottom Right: Skip Ad / Countdown Button */}
          <div className="absolute bottom-3 right-3 z-20">
            {canSkip ? (
              <button
                onClick={handleSkipAd}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl border border-blue-400/30 text-xs md:text-sm shadow-lg transition-all cursor-pointer flex items-center gap-1.5 hover:scale-105 active:scale-95"
              >
                <span>Skip Ad</span>
                <span className="text-base">➔</span>
              </button>
            ) : (
              <div className="bg-black/80 text-gray-200 px-3 py-1.5 rounded-xl text-xs font-medium border border-white/10 backdrop-blur-md flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                You can skip ad in <span className="text-yellow-400 font-bold">{timeLeft}s</span>
              </div>
            )}
          </div>

          {/* Bottom Left: Visit Advertiser */}
          {adDirectLink && (
            <div className="absolute bottom-3 left-3 z-10 hidden sm:block">
              <span className="bg-black/70 hover:bg-black/90 text-white/90 text-[11px] px-2.5 py-1 rounded-md border border-white/20 backdrop-blur-md">
                🔗 Visit Advertiser
              </span>
            </div>
          )}
        </div>
      ) : (
        /* ==================== 🎥 MAIN VIP VIDEO PLAYER ==================== */
        <video
          ref={mainVideoRef}
          src={mainVideoUrl}
          controls
          autoPlay
          controlsList="nodownload" // Proteksyon para hindi madaling ma-download ang VIP video
          className="w-full h-full max-h-[65vh] object-contain"
        />
      )}
    </div>
  );
}