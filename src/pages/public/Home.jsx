import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";
import VIPVideoPlayer from "../../components/VIPVideoPlayer";

export default function Home() {
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState(null);

  // 🟡 ADSTERRA & PRE-ROLL AD CONFIGURATION
  const AD_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
  const AD_DIRECT_LINK = "https://www.effectivecpmnetwork.com/tw8ajp18mf?key=786d474da794ee7cd3596da3aab40fcc";

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("media")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching media:", error);
    } else {
      setMediaList(data || []);
    }
    setLoading(false);
  };

  const isVideo = (item) => {
    if (item.type === "video" || item.media_type === "video") return true;
    if (item.type === "image" || item.media_type === "image") return false;
    const url = (item.media_url || "").toLowerCase();
    return (
      url.includes(".mp4") ||
      url.includes(".mov") ||
      url.includes(".webm") ||
      url.includes(".mkv")
    );
  };

  const filteredMedia = mediaList.filter(isVideo);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        
        {/* 📦 Video Gallery Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
          </div>
        ) : filteredMedia.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/40 rounded-2xl border border-slate-800/80">
            <p className="text-slate-400 text-base md:text-lg">
              Wala pang available na videos sa Vault.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredMedia.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedMedia(item)}
                className="group cursor-pointer bg-slate-900 border border-slate-800/80 hover:border-red-600/50 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1"
              >
                <div className="aspect-video bg-slate-950 relative overflow-hidden flex items-center justify-center">
                  {item.thumbnail_url ? (
                    <img
                      src={item.thumbnail_url}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <video
                      src={`${item.media_url}#t=0.5`}
                      preload="metadata"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                    />
                  )}

                  {/* Play Icon Badge */}
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                    <div className="w-12 h-12 bg-red-600/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <svg
                        className="w-6 h-6 text-white fill-current ml-0.5"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-red-950/60 text-red-400 rounded-md border border-red-900/40">
                    Video
                  </span>
                  <h3 className="text-white font-semibold text-base mt-2 line-clamp-1 group-hover:text-red-400 transition-colors">
                    {item.title}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 🎬 Modal Video Player View with Guaranteed Ads */}
      {selectedMedia && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-3 md:p-6"
          onClick={() => setSelectedMedia(null)}
        >
          <div 
            className="bg-slate-900 border border-slate-800/80 w-full max-w-5xl max-h-[95vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* 1️⃣ TOP HEADER */}
            <div className="p-4 md:px-6 md:py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/90 shrink-0">
              <div className="flex flex-col pr-4">
                <span className="text-[10px] md:text-xs font-black text-red-500 uppercase tracking-widest">
                  Video Vault
                </span>
                <h2 className="text-sm md:text-lg font-bold text-white line-clamp-1 mt-0.5">
                  {selectedMedia.title}
                </h2>
              </div>

              <button
                onClick={() => setSelectedMedia(null)}
                className="w-9 h-9 bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white rounded-xl flex items-center justify-center transition-all cursor-pointer font-bold shrink-0 border border-slate-700/50"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* 2️⃣ VIDEO PLAYER CONTAINER (Force re-mount with key) */}
            <div className="bg-black w-full flex-1 flex flex-col items-center justify-center overflow-y-auto p-2 md:p-4 min-h-[300px] md:min-h-[480px]">
              <div className="w-full h-full max-w-4xl flex items-center justify-center">
                <VIPVideoPlayer
                  key={selectedMedia.id} // 🔑 Tinitiyak na nagre-reset ang Ad para sa BAWAT video!
                  mainVideoUrl={selectedMedia.media_url}
                  adVideoUrl={AD_VIDEO_URL}
                  adDirectLink={AD_DIRECT_LINK}
                />
              </div>

              {/* 3️⃣ ADSTERRA DISPLAY AD / SPONSORED BANNER UNDER EVERY VIDEO */}
              <div className="w-full max-w-4xl mt-3 p-3 bg-slate-950 border border-red-900/30 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">
                    AD
                  </span>
                  <p className="text-slate-300 text-xs hidden sm:block">
                    Click here to support VIP Server Access & unlock high-speed stream
                  </p>
                </div>
                <a
                  href={AD_DIRECT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shrink-0"
                >
                  Visit Sponsor 🚀
                </a>
              </div>
            </div>

            {/* 4️⃣ DESCRIPTION */}
            {selectedMedia.description && !selectedMedia.description.includes("Auto-synced") && (
              <div className="px-4 py-3 md:px-6 border-t border-slate-800/80 bg-slate-950/60 shrink-0">
                <p className="text-slate-400 text-xs md:text-sm line-clamp-2">
                  {selectedMedia.description}
                </p>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}