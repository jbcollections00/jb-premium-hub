import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";
import VIPVideoPlayer from "../../components/VIPVideoPlayer";

const ITEMS_PER_PAGE = 50;

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
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showEarnModal, setShowEarnModal] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);

  // 💰 Ad / Token Earning State
  const [watchingAd, setWatchingAd] = useState(false);
  const [adTimer, setAdTimer] = useState(10);

  // 🔑 Code Redemption Input State
  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);

  const AD_DIRECT_LINK = "https://www.effectivecpmnetwork.com/tw8ajp18mf?key=786d474da794ee7cd3596da3aab40fcc";

  // 🛡️ 1. Suppress Third-Party Ad Script Errors
  useEffect(() => {
    const handleGlobalError = (event) => {
      if (
        event.message?.includes("appendChild") ||
        event.message?.includes("null") ||
        (event.filename && event.filename.includes("fb5310e"))
      ) {
        event.preventDefault(); // Prevents third-party ad scripts from crashing React
      }
    };

    window.addEventListener("error", handleGlobalError);
    return () => window.removeEventListener("error", handleGlobalError);
  }, []);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  useEffect(() => {
    fetchMedia(currentPage);
  }, [currentPage]);

  // 2️⃣ Fetch Current Logged-In User Profile
  const fetchUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      setUserProfile(profile);
    }
  };

  // 3️⃣ Fetch Video Media List
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

  // 4️⃣ Video Click Handler with VIP / Standard Enforcement
  const handleSelectMedia = async (item) => {
    if (!userProfile) {
      setSelectedMedia(item);
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const isVIP = userProfile.account_type?.toLowerCase() === "vip";

    // 👑 A. VIP USER LOGIC
    if (isVIP) {
      const nextCounter = (userProfile.vip_video_counter || 0) + 1;
      const isFifthVideo = nextCounter % 5 === 0;

      await supabase
        .from("profiles")
        .update({ vip_video_counter: nextCounter })
        .eq("id", userProfile.id);

      setUserProfile((prev) => ({ ...prev, vip_video_counter: nextCounter }));
      setSelectedMedia({ ...item, showAd: isFifthVideo });
      return;
    }

    // 👤 B. STANDARD USER LOGIC
    let currentDailyViews = userProfile.daily_views_count || 0;
    let currentTokens = userProfile.watch_tokens || 0;
    const lastDate = userProfile.last_view_date;

    if (lastDate !== today) {
      currentDailyViews = 0;
    }

    if (currentDailyViews < 5) {
      const updatedViews = currentDailyViews + 1;
      await supabase
        .from("profiles")
        .update({
          daily_views_count: updatedViews,
          last_view_date: today,
        })
        .eq("id", userProfile.id);

      setUserProfile((prev) => ({
        ...prev,
        daily_views_count: updatedViews,
        last_view_date: today,
      }));

      setSelectedMedia({ ...item, showAd: true });
      return;
    }

    if (currentTokens > 0) {
      const updatedTokens = currentTokens - 1;
      await supabase
        .from("profiles")
        .update({ watch_tokens: updatedTokens })
        .eq("id", userProfile.id);

      setUserProfile((prev) => ({ ...prev, watch_tokens: updatedTokens }));
      setSelectedMedia({ ...item, showAd: true });
      return;
    }

    setShowLimitModal(true);
  };

  // 5️⃣ Earn Watch Token via Ad View
  const handleStartEarnAd = () => {
    window.open(AD_DIRECT_LINK, "_blank");
    setWatchingAd(true);
    setAdTimer(10);

    const interval = setInterval(() => {
      setAdTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          grantEarnedToken();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const grantEarnedToken = async () => {
    if (!userProfile) return;
    const newTokens = (userProfile.watch_tokens || 0) + 1;

    const { error } = await supabase
      .from("profiles")
      .update({ watch_tokens: newTokens })
      .eq("id", userProfile.id);

    if (!error) {
      setUserProfile((prev) => ({ ...prev, watch_tokens: newTokens }));
      setWatchingAd(false);
      setShowLimitModal(false);
      alert("🎉 Success! You earned 1 Watch Token!");
    }
  };

  // 6️⃣ Redeem Access Code
  const handleRedeemCode = async (e) => {
    e.preventDefault();
    if (!accessCodeInput.trim() || !userProfile) return;

    setRedeemLoading(true);
    const codeUpper = accessCodeInput.trim().toUpperCase();

    const { data: codeData, error: codeErr } = await supabase
      .from("access_codes")
      .select("*")
      .eq("code", codeUpper)
      .single();

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
    const extraTokens = isVipCode ? userProfile.watch_tokens : (userProfile.watch_tokens || 0) + 5;

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        account_type: newType,
        watch_tokens: extraTokens,
      })
      .eq("id", userProfile.id);

    if (!profileErr) {
      setUserProfile((prev) => ({
        ...prev,
        account_type: newType,
        watch_tokens: extraTokens,
      }));

      setAccessCodeInput("");
      setShowRedeemModal(false);
      setShowLimitModal(false);

      alert(
        isVipCode
          ? "👑 CONGRATULATIONS! Your account has been upgraded to VIP ACCESS!"
          : "🎉 Standard Code Redeemed! +5 Watch Tokens added to your account."
      );
    }

    setRedeemLoading(false);
  };

  const isVIP = userProfile?.account_type?.toLowerCase() === "vip";
  const dailyUsed = userProfile?.daily_views_count || 0;
  const remainingFreeViews = Math.max(0, 5 - dailyUsed);
  const watchTokens = userProfile?.watch_tokens || 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        
        {/* 👑 USER MEMBERSHIP STATUS BAR */}
        {userProfile && (
          <div className="mb-8 p-4 md:p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${isVIP ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                {isVIP ? "👑" : "👤"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-white text-base">
                    {userProfile.full_name || userProfile.email || "Member Account"}
                  </h2>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase ${isVIP ? 'bg-amber-500 text-black' : 'bg-slate-800 text-blue-400 border border-blue-500/30'}`}>
                    {isVIP ? "VIP ACCESS" : "STANDARD TIER"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isVIP ? (
                    "Unlimited Videos • Reduced Ads (1 ad per 5 videos)"
                  ) : (
                    <>Daily Free Views: <b className="text-white">{remainingFreeViews}/5</b> | Watch Tokens: <b className="text-amber-400">{watchTokens}</b></>
                  )}
                </p>
              </div>
            </div>

            {!isVIP && (
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  onClick={() => setShowEarnModal(true)}
                  className="flex-1 sm:flex-none bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>💰 Earn Tokens</span>
                </button>

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

        {/* 📊 Vault Header Info & Item Count */}
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
                      src={item.thumbnail_url}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : item.media_url ? (
                    <video
                      src={`${item.media_url}#t=1`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none opacity-60"
                      preload="metadata"
                      muted
                      playsInline
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                      <span className="text-slate-600 text-xs font-semibold">No Display</span>
                    </div>
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

            {/* 2️⃣ VIDEO PLAYER CONTAINER (ADDED CSS FIX HERE) */}
            <div className="bg-black w-full flex-1 flex flex-col items-center justify-center overflow-y-auto p-2 md:p-4 min-h-[300px] md:min-h-[480px]">
              <div className="w-full h-full max-w-4xl flex items-center justify-center [&_video]:w-full [&_video]:h-auto [&_video]:aspect-video [&_video]:bg-black">
                <VIPVideoPlayer
                  key={selectedMedia.id}
                  mainVideoUrl={selectedMedia.media_url}
                  adDirectLink={AD_DIRECT_LINK}
                />
              </div>

              {/* 3️⃣ ADSTERRA SPONSOR BANNER UNDER VIDEO */}
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

      {/* ⚠️ MODAL 1: DAILY LIMIT REACHED */}
      {showLimitModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 max-w-md w-full text-center relative shadow-2xl">
            <div className="w-16 h-16 bg-red-600/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
              🔒
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Daily Free Limit Reached!</h3>
            <p className="text-slate-400 text-xs md:text-sm mb-6">
              Standard accounts are limited to <b className="text-white">5 free videos per day</b>. Watch a short ad to earn a Watch Token or upgrade to VIP!
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowLimitModal(false);
                  setShowEarnModal(true);
                }}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-500/20"
              >
                💰 Watch Ad (+1 Watch Token)
              </button>

              <button
                onClick={() => {
                  setShowLimitModal(false);
                  setShowRedeemModal(true);
                }}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-red-600/20"
              >
                🔑 Upgrade with VIP Code
              </button>

              <button
                onClick={() => setShowLimitModal(false)}
                className="text-slate-500 hover:text-slate-300 text-xs mt-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 💰 MODAL 2: EARN WATCH TOKENS PAGE */}
      {showEarnModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 max-w-md w-full text-center relative shadow-2xl">
            <button
              onClick={() => setShowEarnModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              ✕
            </button>

            <div className="w-14 h-14 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-3 border border-amber-500/30 text-2xl">
              🪙
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Earn Watch Tokens</h3>
            <p className="text-slate-400 text-xs mb-6">
              Watch 1 sponsor offer to get <b className="text-amber-400">1 Watch Token = 1 Extra Video Play</b>.
            </p>

            {watchingAd ? (
              <div className="bg-slate-950 p-6 rounded-2xl border border-amber-500/30 animate-pulse my-4">
                <p className="text-xs text-amber-400 font-bold uppercase tracking-wider">Verifying Sponsor Visit...</p>
                <p className="text-3xl font-black text-white mt-2">{adTimer}s</p>
                <p className="text-[10px] text-slate-500 mt-2">Please keep the sponsor tab open to confirm token award.</p>
              </div>
            ) : (
              <button
                onClick={handleStartEarnAd}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold py-3.5 rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                🚀 Launch Sponsor & Earn +1 Token
              </button>
            )}
          </div>
        </div>
      )}

      {/* 🔑 MODAL 3: REDEEM VIP CODE */}
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
              Enter your VIP Access Code to unlock unlimited video browsing and reduced ads.
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