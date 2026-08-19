import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";
import VIPVideoPlayer from "../../components/VIPVideoPlayer";

export default function Home() {
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'video', o 'image'

  // 🎯 DITO PALITAN ANG IYONG AD LINKS
  const AD_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"; // Sample Ad Video MP4
  const AD_DIRECT_LINK = "https://your-ad-network-direct-link.com"; // Monetag / Adsterra Direct Link

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

  // Helper function para malaman kung Video o Image ang item
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

  // Filter ng media list batay sa active tab
  const filteredMedia = mediaList.filter((item) => {
    if (activeTab === "video") return isVideo(item);
    if (activeTab === "image") return !isVideo(item);
    return true; // 'all'
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        
        {/* 🔘 Filter Buttons (Lahat, Videos, Images) */}
        <div className="flex items-center justify-center sm:justify-start gap-3 mb-8">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "all"
                ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            ✨ Lahat
          </button>
          <button
            onClick={() => setActiveTab("video")}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "video"
                ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            🎥 Videos
          </button>
          <button
            onClick={() => setActiveTab("image")}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "image"
                ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            🖼️ Images
          </button>
        </div>

        {/* 📦 Media Gallery Content */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
          </div>
        ) : filteredMedia.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/40 rounded-2xl border border-slate-800/80">
            <p className="text-slate-400 text-base md:text-lg">
              {activeTab === "video"
                ? "Wala pang available na videos sa Vault."
                : activeTab === "image"
                ? "Wala pang available na images sa Vault."
                : "Wala pang available na media sa Vault."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredMedia.map((item) => {
              const itemIsVideo = isVideo(item);
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedMedia(item)}
                  className="group cursor-pointer bg-slate-900 border border-slate-800/80 hover:border-red-600/50 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="aspect-video bg-slate-950 relative overflow-hidden flex items-center justify-center">
                    {itemIsVideo ? (
                      item.thumbnail_url ? (
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
                      )
                    ) : (
                      <img
                        src={item.media_url}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    )}

                    {/* Play Icon Badge para sa Video */}
                    {itemIsVideo && (
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
                    )}
                  </div>

                  <div className="p-4">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-red-950/60 text-red-400 rounded-md border border-red-900/40">
                      {itemIsVideo ? "Video" : "Image"}
                    </span>
                    <h3 className="text-white font-semibold text-base mt-2 line-clamp-1 group-hover:text-red-400 transition-colors">
                      {item.title}
                    </h3>
                    {item.description && !item.description.includes("Auto-synced") && (
                      <p className="text-slate-400 text-xs mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 🎬 / 🖼️ Modal Player View */}
      {selectedMedia && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-3 md:p-6"
          onClick={() => setSelectedMedia(null)}
        >
          <div 
            className="bg-slate-900 border border-slate-800/80 w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* 1️⃣ TOP HEADER: Title & Badge sa TAAS */}
            <div className="p-4 md:px-6 md:py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/90 shrink-0">
              <div className="flex flex-col pr-4">
                <span className="text-[10px] md:text-xs font-black text-red-500 uppercase tracking-widest">
                  {isVideo(selectedMedia) ? "Video" : "Image"}
                </span>
                <h2 className="text-sm md:text-lg font-bold text-white line-clamp-1 mt-0.5">
                  {selectedMedia.title}
                </h2>
              </div>

              {/* Close Button sa Top Right */}
              <button
                onClick={() => setSelectedMedia(null)}
                className="w-9 h-9 bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white rounded-xl flex items-center justify-center transition-all cursor-pointer font-bold shrink-0 border border-slate-700/50"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* 2️⃣ CENTERED MEDIA PLAYER CONTAINER */}
            <div className="bg-black w-full flex-1 flex items-center justify-center overflow-hidden p-2 md:p-4 min-h-[300px] md:min-h-[480px]">
              {isVideo(selectedMedia) ? (
                <div className="w-full h-full max-w-4xl flex items-center justify-center">
                  <VIPVideoPlayer
                    mainVideoUrl={selectedMedia.media_url}
                    adVideoUrl={AD_VIDEO_URL}
                    adDirectLink={AD_DIRECT_LINK}
                  />
                </div>
              ) : (
                <img
                  src={selectedMedia.media_url}
                  alt={selectedMedia.title}
                  className="w-full h-full max-h-[75vh] object-contain rounded-xl"
                />
              )}
            </div>

            {/* 3️⃣ DESCRIPTION (Lalabas lang kung may totoong description) */}
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