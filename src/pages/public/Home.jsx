import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";
import VIPVideoPlayer from "../../components/VIPVideoPlayer";
import EventPopup from "../../components/EventPopup";

const ITEMS_PER_PAGE = 50;

// Helper para siguraduhing CDN URL ang gamit kahit may lumang link pa sa DB
const getCdnUrl = (url) => {
  if (!url) return "";
  return url.replace(/pub-[a-f0-9]+\.r2\.dev/g, "cdn.jb-premium-hub.vip");
};

export default function Home() {
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState(null);

  // 📄 Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // 👤 User Account & Tier State
  const [userProfile, setUserProfile] = useState(null);

  // 🚪 Modals State
  const [showRedeemModal, setShowRedeemModal] = useState(false);

  // 🔑 Code Redemption Input State
  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);

  const AD_DIRECT_LINK = "https://www.effectivecpmnetwork.com/tw8ajp18mf?key=786d474da794ee7cd3596da3aab40fcc";

  // Determine user account tier and privileges
  const accountTypeUpper = (userProfile?.account_type || "").toUpperCase();
  const roleUpper = (userProfile?.role || "").toUpperCase();
  const isAdmin = accountTypeUpper === "ADMIN" || roleUpper === "ADMIN";
  const isVIP = accountTypeUpper === "VIP";
  const isAdFree = isVIP || isAdmin;

  // 🛡️ 1. Suppress Third-Party Ad Script Errors
  useEffect(() => {
    const handleGlobalError = (event) => {
      if (
        event.message?.includes("appendChild") ||
        event.message?.includes("null") ||
        (event.filename && event.filename.includes("fb5310e"))
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("error", handleGlobalError);
    return () => window.removeEventListener("error", handleGlobalError);
  }, []);

  // 📢 2. Trigger Monetag In-App Interstitial Ads (For Standard / Non-VIP Users)
  useEffect(() => {
    if (!isAdFree && typeof window.show_11699131 === "function") {
      window.show_11699131({
        type: "inApp",
        inAppSettings: {
          frequency: 2,
          capping: 0.1,
          interval: 30,
          timeout: 5,
          everyPage: false,
        },
      });
    }
  }, [isAdFree]);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  useEffect(() => {
    fetchMedia(currentPage);
  }, [currentPage]);

  // Fetch Current Logged-In User Profile
  const fetchUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      let { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile && !error) {
        const { data: newProfile } = await supabase
          .from("profiles")
          .upsert([{ id: user.id, account_type: "standard" }])
          .select()
          .maybeSingle();
        profile = newProfile;
      }

      if (profile) {
        setUserProfile(profile);
      }
    } catch (err) {
      console.error("Profile load error:", err);
    }
  };

  // Fetch Video Media List
  const fetchMedia = async (page = 1) => {
    setLoading(true);
    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const { data, count, error } = await supabase
      .from("media")
      .select("*", { count: "exact" })
      .eq("type", "video")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Error fetching media:", error);
    } else {
      setMediaList(data || []);
      if (count !== null) setTotalCount(count);
    }
    setLoading(false);
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE) || 1;

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSelectMedia = (item) => {
    // Mag-trigger din ng ad kapag nag-click ng video ang Standard user
    if (!isAdFree && typeof window.show_11699131 === "function") {
      window.show_11699131('pop').catch(() => {});
    }
    setSelectedMedia(item);
  };

  const handleRedeemCode = async (e) => {
    e.preventDefault();
    if (!accessCodeInput.trim() || !userProfile) return;

    setRedeemLoading(true);
    const codeUpper = accessCodeInput.trim().toUpperCase();

    const { data: codeData, error: codeErr } = await supabase
      .from("access_codes")
      .select("*")
      .eq("code", codeUpper)
      .maybeSingle();

    if (codeErr || !codeData) {
      alert("Invalid Access Code! Please check your code.");
      setRedeemLoading(false);
      return;
    }

    if (codeData.is_used) {
      alert("This access code has already been used!");
      setRedeemLoading(false);
      return;
    }

    const { error: markUsedErr } = await supabase
      .from("access_codes")
      .update({ is_used: true, used_by: userProfile.id })
      .eq("id", codeData.id);

    if (markUsedErr) {
      alert("Error redeeming code: " + markUsedErr.message);
      setRedeemLoading(false);
      return;
    }

    const isVipCode = codeData.type === "VIP" || codeUpper.startsWith("VIP");
    const newType = isVipCode ? "vip" : "standard";

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ account_type: newType })
      .eq("id", userProfile.id);

    if (!profileErr) {
      setUserProfile((prev) => ({
        ...prev,
        account_type: newType
      }));

      setAccessCodeInput("");
      setShowRedeemModal(false);

      alert(
        isVipCode
          ? "👑 CONGRATULATIONS! Your account has been upgraded to VIP ACCESS!"
          : "🎉 Standard Code Redeemed! You are now an active user."
      );
    }

    setRedeemLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-10">
      
      {/* 🚀 Active Event Popup Modal */}
      <EventPopup />

      <div className="max-w-7xl mx-auto">
        
        {/* 👑 USER MEMBERSHIP STATUS BAR */}
        {userProfile && (
          <div className="mb-8 p-4 md:p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${isAdmin ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : isVIP ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                {isAdmin ? "🛡️" : isVIP ? "👑" : "👤"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-white text-base">
                    {userProfile.full_name || userProfile.email || "Member Account"}
                  </h2>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase ${isAdmin ? 'bg-purple-600 text-white' : isVIP ? 'bg-amber-500 text-black' : 'bg-slate-800 text-blue-400 border border-blue-500/30'}`}>
                    {isAdmin ? "ADMIN ACCESS" : isVIP ? "VIP ACCESS" : "STANDARD TIER"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isAdFree ? "Unlimited Videos • Ad-Free • VIP Download Unlocked" : "Unlimited Videos • Ad Supported"}
                </p>
              </div>
            </div>

            {!isAdFree && (
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  onClick={() => setShowRedeemModal(true)}
                  className="flex-1 sm:flex-none bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-red-600/20 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>🔑 Upgrade VIP</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* 📊 Vault Header Info */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-white">Vault Media</h1>
          <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            Showing {mediaList.length} of <strong className="text-red-500">{totalCount}</strong> Videos
          </span>
        </div>

        {/* 📦 Video Gallery Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
          </div>
        ) : mediaList.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/40 rounded-2xl border border-slate-800/80">
            <p className="text-slate-400 text-base md:text-lg">
              Wala pang available na videos sa Vault.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {mediaList.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelectMedia(item)}
                className="group cursor-pointer bg-slate-900 border border-slate-800/80 hover:border-red-600/50 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1"
              >
                <div className="aspect-video bg-slate-950 relative overflow-hidden flex items-center justify-center">
                  {item.thumbnail_url ? (
                    <img
                      src={getCdnUrl(item.thumbnail_url)}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : item.media_url ? (
                    <video
                      src={`${getCdnUrl(item.media_url)}#t=1`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                      preload="metadata"
                      muted
                      playsInline
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                      <span className="text-slate-600 text-xs font-semibold">No Display</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                    <div className="w-12 h-12 bg-red-600/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <svg className="w-6 h-6 text-white fill-current ml-0.5" viewBox="0 0 24 24">
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

        {/* 📄 Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-3 mt-10 mb-6">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-red-600/50 text-xs font-bold rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              ← Previous
            </button>

            <span className="text-xs text-slate-400 font-semibold px-2">
              Page <strong className="text-white">{currentPage}</strong> of{' '}
              <strong className="text-white">{totalPages}</strong>
            </span>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || loading}
              className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-red-600/50 text-xs font-bold rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              Next →
            </button>
          </div>
        )}

      </div>

      {/* 🎬 Modal Video Player View */}
      {selectedMedia && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-3 md:p-6"
          onClick={() => setSelectedMedia(null)}
        >
          <div 
            className="bg-slate-900 border border-slate-800/80 w-full max-w-5xl max-h-[95vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
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
              >
                ✕
              </button>
            </div>

            <div className="bg-black w-full flex-1 flex flex-col items-center justify-center overflow-y-auto p-2 md:p-4 min-h-[300px] md:min-h-[480px]">
              <div className="w-full h-full max-w-4xl flex items-center justify-center [&_video]:w-full [&_video]:h-auto [&_video]:aspect-video [&_video]:bg-black">
                <VIPVideoPlayer
                  key={selectedMedia.id}
                  mainVideoUrl={getCdnUrl(selectedMedia.media_url)}
                  adDirectLink={AD_DIRECT_LINK}
                  userProfile={userProfile}
                  accountType={userProfile?.account_type}
                />
              </div>

              {!isAdFree && (
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
              )}
            </div>

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

      {/* 🔑 MODAL: REDEEM VIP CODE */}
      {showRedeemModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 max-w-md w-full text-center relative shadow-2xl">
            <button
              onClick={() => setShowRedeemModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              ✕
            </button>

            <div className="w-14 h-14 bg-red-600/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-3 border border-red-500/30 text-2xl">
              🔑
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Redeem Access Code</h3>
            <p className="text-slate-400 text-xs mb-6">
              Enter your VIP Access Code to unlock ad-free viewing and downloads.
            </p>

            <form onSubmit={handleRedeemCode} className="flex flex-col gap-3">
              <input
                type="text"
                value={accessCodeInput}
                onChange={(e) => setAccessCodeInput(e.target.value)}
                placeholder="e.g. VIP-86TTQM"
                className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white uppercase text-center font-mono font-bold tracking-widest focus:outline-none focus:border-red-500"
              />

              <button
                type="submit"
                disabled={redeemLoading}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-red-600/20"
              >
                {redeemLoading ? "Redeeming..." : "Redeem Code Now ➔"}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}