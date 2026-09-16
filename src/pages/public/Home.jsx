import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";
import VIPVideoPlayer from "../../components/VIPVideoPlayer";
import EventPopup from "../../components/EventPopup";
import TopInviters from "../../components/TopInviters";

const ITEMS_PER_PAGE = 50;

const getCdnUrl = (url) => {
  if (!url) return "";
  return url.replace(/pub-[a-f0-9]+\.r2\.dev/g, "cdn.jb-premium-hub.vip");
};

export default function Home() {
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState(null);

  const [activeCategory, setActiveCategory] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("cat") || "all";
    }
    return "all";
  });

  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window !== "undefined") {
      const page = parseInt(new URLSearchParams(window.location.search).get("page"), 10);
      return isNaN(page) ? 1 : page;
    }
    return 1;
  });

  const [totalCount, setTotalCount] = useState(0);
  const [userProfile, setUserProfile] = useState(null);
  const [adsEnabled, setAdsEnabled] = useState(true);

  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const AD_DIRECT_LINK = "https://www.effectivecpmnetwork.com/tw8ajp18mf?key=786d474da794ee7cd3596da3aab40fcc";

  const accountTypeUpper = (userProfile?.account_type || "").toUpperCase();
  const roleUpper = (userProfile?.role || "").toUpperCase();
  const isAdmin = accountTypeUpper === "ADMIN" || roleUpper === "ADMIN";
  const isVIP = accountTypeUpper === "VIP" || roleUpper === "VIP";
  const isAdFree = isAdmin || isVIP;

  const showAds = adsEnabled && !isAdFree;

  useEffect(() => {
    fetchUserProfile();
    fetchAdSettings();
  }, []);

  useEffect(() => {
    fetchMedia(currentPage, activeCategory);
  }, [currentPage, activeCategory]);

  useEffect(() => {
    if (mediaList.length > 0 && !selectedMedia) {
      const params = new URLSearchParams(window.location.search);
      const videoId = params.get("v");
      if (videoId) {
        const found = mediaList.find((m) => String(m.id) === String(videoId));
        if (found) setSelectedMedia(found);
      }
    }
  }, [mediaList]);

  const fetchAdSettings = async () => {
    try {
      const { data } = await supabase
        .from("site_settings")
        .select("ads_enabled")
        .eq("id", 1)
        .maybeSingle();

      if (data !== null && data.ads_enabled !== undefined) {
        setAdsEnabled(data.ads_enabled);
      }
    } catch (err) {
      console.error("Error loading ad settings:", err);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      let { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) setUserProfile(profile);
    } catch (err) {
      console.error("Profile load error:", err);
    }
  };

  const fetchMedia = async (page = 1, category = "all") => {
    setLoading(true);
    const from = (page - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    let query = supabase.from("media").select("*", { count: "exact" }).eq("type", "video");

    if (category === "pinay_asian") {
      query = query.or("category.eq.pinay_asian,category.ilike.%pinay%,category.ilike.%asian%,title.ilike.%pinay%,title.ilike.%asian%");
    }

    const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);

    if (!error) {
      setMediaList(data || []);
      if (count !== null) setTotalCount(count);
    }
    setLoading(false);
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE) || 1;

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      const url = new URL(window.location.href);
      url.searchParams.set("page", newPage);
      window.history.replaceState({}, "", url);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleCategoryChange = (catKey) => {
    setActiveCategory(catKey);
    setCurrentPage(1);
    const url = new URL(window.location.href);
    url.searchParams.set("cat", catKey);
    url.searchParams.set("page", 1);
    window.history.replaceState({}, "", url);
  };

  const handleSelectMedia = (e, item) => {
    e.preventDefault();
    e.stopPropagation();

    // Trigger direct link popunder ONLY when clicking a video card
    if (showAds && AD_DIRECT_LINK) {
      window.open(AD_DIRECT_LINK, "_blank", "noopener,noreferrer");
    }

    setSelectedMedia(item);
    const url = new URL(window.location.href);
    url.searchParams.set("v", item.id);
    url.searchParams.set("page", currentPage);
    url.searchParams.set("cat", activeCategory);
    window.history.replaceState({}, "", url);
  };

  const handleCloseMedia = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setSelectedMedia(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("v");
    window.history.replaceState({}, "", url);
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

    if (codeErr || !codeData || codeData.is_used) {
      alert(codeData?.is_used ? "This access code has already been used!" : "Invalid Access Code!");
      setRedeemLoading(false);
      return;
    }

    const { error: markUsedErr } = await supabase
      .from("access_codes")
      .update({ is_used: true, used_by: userProfile.id, used_at: new Date().toISOString() })
      .eq("id", codeData.id);

    if (!markUsedErr) {
      const isVipCode = codeData.type === "VIP" || codeUpper.startsWith("VIP");
      const newType = isVipCode ? "vip" : "standard";

      await supabase.from("profiles").update({ account_type: newType }).eq("id", userProfile.id);

      setUserProfile((prev) => ({ ...prev, account_type: newType }));
      setAccessCodeInput("");
      setShowRedeemModal(false);
      alert(isVipCode ? "👑 VIP ACCESS Unlocked!" : "🎉 Standard Code Redeemed!");
    }
    setRedeemLoading(false);
  };

  const myInviteLink = userProfile 
    ? `${window.location.origin}/signup?ref=${userProfile.id}`
    : '';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(myInviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between">
      <EventPopup />

      {/* 📢 TOP WARNING BANNER */}
      {showAds && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs py-2 px-4 text-center font-medium flex items-center justify-center gap-2">
          <span>📢 <strong>Sponsored Page</strong> (Upgrade to VIP to remove page ads)</span>
          <button 
            onClick={() => setShowRedeemModal(true)}
            className="underline font-bold hover:text-white transition-colors cursor-pointer"
          >
            Upgrade VIP
          </button>
        </div>
      )}

      {/* 🏢 MAIN CENTER CONTENT */}
      <main className="w-full max-w-7xl mx-auto px-4 py-6 md:p-8 flex-1">
        
        {/* User Account Panel */}
        {userProfile && (
          <div className="mb-6 p-4 md:p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
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
                    {isAdmin ? "ADMIN" : isVIP ? "VIP" : "STANDARD"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isAdFree ? "Unlimited Videos • Ad-Free" : "Unlimited Videos • Ad Supported"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
              <button
                onClick={() => setShowReferralModal(true)}
                className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-lg cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>🏆 Refer & Earn</span>
              </button>
            
              {!isAdFree && (
                <button
                  onClick={() => setShowRedeemModal(true)}
                  className="flex-1 sm:flex-none bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-lg cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>🔑 Upgrade VIP</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Title & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-white">Vault Media</h1>
          <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl self-start sm:self-auto">
            Showing {mediaList.length} of <strong className="text-red-500">{totalCount}</strong> Videos
          </span>
        </div>

        <div className="flex items-center gap-2.5 mb-8 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => handleCategoryChange("all")}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${activeCategory === "all" ? "bg-red-600 text-white" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"}`}
          >
            <span>🔥</span> All Videos
          </button>
          <button
            onClick={() => handleCategoryChange("pinay_asian")}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${activeCategory === "pinay_asian" ? "bg-red-600 text-white" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"}`}
          >
            <span>🇵🇭</span> Pinay / Asian
          </button>
        </div>

        {/* Video Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
          </div>
        ) : mediaList.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/40 rounded-2xl border border-slate-800/80">
            <p className="text-slate-400">Wala pang available na videos sa kategoryang ito.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {mediaList.map((item) => (
              <div
                key={item.id}
                onClick={(e) => handleSelectMedia(e, item)}
                className="group cursor-pointer bg-slate-900 border border-slate-800/80 hover:border-red-600/50 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-video bg-slate-950 relative overflow-hidden flex items-center justify-center">
                    {item.thumbnail_url ? (
                      <img
                        src={getCdnUrl(item.thumbnail_url)}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
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
                      <div className="w-full h-full bg-slate-900 flex items-center justify-center text-slate-600 text-xs font-semibold">
                        No Display
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                      <div className="w-12 h-12 bg-red-600/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <svg className="w-6 h-6 text-white fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-red-950/60 text-red-400 rounded-md border border-red-900/40">Video</span>
                    <h3 className="text-white font-semibold text-base mt-2 line-clamp-1 group-hover:text-red-400 transition-colors">{item.title}</h3>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-3 mt-10 mb-6">
            <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1 || loading} className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-red-600/50 text-xs font-bold rounded-xl text-white disabled:opacity-40 cursor-pointer">← Previous</button>
            <span className="text-xs text-slate-400 font-semibold px-2">Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong></span>
            <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages || loading} className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-red-600/50 text-xs font-bold rounded-xl text-white disabled:opacity-40 cursor-pointer">Next →</button>
          </div>
        )}
      </main>

      {/* 🎬 Modal Video Player View */}
      {selectedMedia && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-3 md:p-6" onClick={handleCloseMedia}>
          <div className="bg-slate-900 border border-slate-800/80 w-full max-w-5xl max-h-[95vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 md:px-6 md:py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/90 shrink-0">
              <div className="flex flex-col pr-4">
                <span className="text-[10px] md:text-xs font-black text-red-500 uppercase tracking-widest">Video Vault</span>
                <h2 className="text-sm md:text-lg font-bold text-white line-clamp-1 mt-0.5">{selectedMedia.title}</h2>
              </div>
              <button onClick={handleCloseMedia} className="w-9 h-9 bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white rounded-xl flex items-center justify-center transition-all cursor-pointer font-bold shrink-0 border border-slate-700/50">✕</button>
            </div>

            <div className="bg-black w-full flex-1 flex flex-col items-center justify-center overflow-y-auto p-2 md:p-4 min-h-[300px] md:min-h-[480px]">
              <div className="w-full h-full max-w-4xl flex items-center justify-center [&_video]:w-full [&_video]:h-auto [&_video]:aspect-video [&_video]:bg-black">
                <VIPVideoPlayer
                  key={selectedMedia.id}
                  mainVideoUrl={getCdnUrl(selectedMedia.media_url)}
                  adDirectLink={showAds ? AD_DIRECT_LINK : null}
                  userProfile={userProfile}
                  accountType={userProfile?.account_type}
                  isAdFree={!showAds}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🔑 Redeem Code Modal */}
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

      {/* 🏆 Referral Modal */}
      {showReferralModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl relative shadow-2xl my-8">
            <button
              onClick={() => setShowReferralModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              ✕
            </button>
            
            <div className="mb-6 border-b border-slate-800 pb-6">
              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <span>🔗</span> Your Invite Link
              </h3>
              <p className="text-slate-400 text-sm mb-4">
                Share this link with your friends. Only registered accounts count towards the leaderboard.
              </p>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={myInviteLink}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 font-mono focus:outline-none"
                />
                <button
                  onClick={copyToClipboard}
                  className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                    copiedLink 
                      ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                  }`}
                >
                  {copiedLink ? '✓ Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            <TopInviters />
          </div>
        </div>
      )}
    </div>
  );
}