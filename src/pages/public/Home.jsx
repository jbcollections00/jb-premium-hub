import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../services/supabaseClient";
import VIPVideoPlayer from "../../components/VIPVideoPlayer";
import EventPopup from "../../components/EventPopup";
import TopInviters from "../../components/TopInviters";

const ITEMS_PER_PAGE = 50;

// Set to true once Cloudflare SSL status for cdn.jb-premium-hub.vip is Active
const USE_CUSTOM_CDN = true;

// --- ADSTERRA CONFIGURATION ---
const ADSTERRA_SOCIALBAR_URL = "https://deeprootedpressure.com/77/84/87/7784879ac907b760977addd43bca7b1a.js";

const getCdnUrl = (url) => {
  if (!url) return "";
  if (!USE_CUSTOM_CDN) return url;
  return url.replace(/pub-[a-f0-9]+\.r2\.dev/g, "cdn.jb-premium-hub.vip");
};

// Single Native Banner Component for Top Placement
function TopNativeBanner() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const adDiv = document.createElement('div');
    adDiv.id = 'container-07daf68a9e786bf55c0980163fb30853';

    const invokeScript = document.createElement('script');
    invokeScript.type = 'text/javascript';
    invokeScript.async = true;
    invokeScript.setAttribute('data-cfasync', 'false');
    invokeScript.src = 'https://deeprootedpressure.com/07daf68a9e786bf55c0980163fb30853/invoke.js';

    containerRef.current.appendChild(adDiv);
    containerRef.current.appendChild(invokeScript);
  }, []);

  return (
    <div className="w-full flex flex-col items-center justify-center mb-6 p-3 bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
      <span className="text-[10px] text-slate-500 font-semibold mb-1 uppercase tracking-widest">Advertisement</span>
      <div ref={containerRef} className="w-full flex justify-center min-h-[90px]" />
    </div>
  );
}

// Native Banner Component inside Video Modal
function ModalNativeBanner() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const adDiv = document.createElement('div');
    adDiv.id = 'container-07daf68a9e786bf55c0980163fb30853';

    const invokeScript = document.createElement('script');
    invokeScript.type = 'text/javascript';
    invokeScript.async = true;
    invokeScript.setAttribute('data-cfasync', 'false');
    invokeScript.src = 'https://deeprootedpressure.com/07daf68a9e786bf55c0980163fb30853/invoke.js';

    containerRef.current.appendChild(adDiv);
    containerRef.current.appendChild(invokeScript);
  }, []);

  return (
    <div className="w-full flex flex-col items-center justify-center my-4 p-3 bg-slate-950/80 border border-amber-500/20 rounded-xl overflow-hidden shadow-md">
      <span className="text-[9px] text-amber-500/70 font-semibold mb-1 uppercase tracking-widest">Sponsored Content</span>
      <div ref={containerRef} className="w-full flex justify-center min-h-[90px]" />
    </div>
  );
}

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

  // States para sa Likes/Dislikes at Views
  const [userReactions, setUserReactions] = useState({});
  const [reactionCounts, setReactionCounts] = useState({});
  const [viewCounts, setViewCounts] = useState({});
  const [hasRecordedCurrentView, setHasRecordedCurrentView] = useState(false);

  // States para sa Comments at Captcha
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [captchaNum1, setCaptchaNum1] = useState(0);
  const [captchaNum2, setCaptchaNum2] = useState(0);
  const [captchaInput, setCaptchaInput] = useState("");

  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const accountTypeUpper = (userProfile?.account_type || "").toUpperCase();
  const roleUpper = (userProfile?.role || "").toUpperCase();
  const isAdmin = accountTypeUpper === "ADMIN" || roleUpper === "ADMIN";
  const isVIP = accountTypeUpper === "VIP" || roleUpper === "VIP";
  const isAdFree = isAdmin || isVIP;

  // Load Socialbar Script dynamically at top-level body for non-VIP users
  useEffect(() => {
    if (isAdFree) return;

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = ADSTERRA_SOCIALBAR_URL;
    script.id = "adsterra-socialbar";
    script.async = true;

    document.body.appendChild(script);

    return () => {
      const existingScript = document.getElementById("adsterra-socialbar");
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [isAdFree]);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  useEffect(() => {
    fetchMedia(currentPage, activeCategory);
  }, [currentPage, activeCategory]);

  useEffect(() => {
    if (mediaList.length > 0) {
      const ids = mediaList.map((m) => m.id);
      fetchReactionsData(ids, userProfile?.id);
      fetchViewCountsData(ids);
    }
  }, [mediaList, userProfile]);

  useEffect(() => {
    if (selectedMedia) {
      fetchComments(selectedMedia.id);
      generateCaptcha();
      setHasRecordedCurrentView(false);
    }
  }, [selectedMedia]);

  useEffect(() => {
    if (mediaList.length > 0 && !selectedMedia) {
      const params = new URLSearchParams(window.location.search);
      const videoId = params.get("v");
      if (videoId) {
        const found = mediaList.find((m) => String(m.id) === String(videoId));
        if (found) {
          setSelectedMedia(found);
          setTimeout(() => {
            const el = document.getElementById(`video-${videoId}`);
            if (el) {
              el.scrollIntoView({ block: "center" });
            }
          }, 100);
        }
      }
    }
  }, [mediaList]);

  const generateCaptcha = () => {
    setCaptchaNum1(Math.floor(Math.random() * 9) + 1);
    setCaptchaNum2(Math.floor(Math.random() * 9) + 1);
    setCaptchaInput("");
  };

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

  const fetchViewCountsData = async (mediaIds) => {
    if (!mediaIds.length) return;
    try {
      const { data, error } = await supabase
        .from("media_views")
        .select("media_id")
        .in("media_id", mediaIds);

      if (!error && data) {
        const counts = {};
        mediaIds.forEach((id) => (counts[id] = 0));
        data.forEach((item) => {
          if (counts[item.media_id] !== undefined) {
            counts[item.media_id] += 1;
          }
        });
        setViewCounts((prev) => ({ ...prev, ...counts }));
      }
    } catch (err) {
      console.error("View count fetch error:", err);
    }
  };

  const handleVideoPlay = async () => {
    if (!selectedMedia?.id || hasRecordedCurrentView) return;

    setHasRecordedCurrentView(true);

    setViewCounts((prev) => ({
      ...prev,
      [selectedMedia.id]: (prev[selectedMedia.id] || 0) + 1,
    }));

    try {
      await supabase.from("media_views").insert([
        { media_id: selectedMedia.id, user_id: userProfile?.id || null }
      ]);
    } catch (err) {
      console.error("Record view error:", err);
    }
  };

  const fetchReactionsData = async (mediaIds, userId) => {
    if (!mediaIds.length) return;

    try {
      const { data: reactions, error } = await supabase
        .from("media_reactions")
        .select("media_id, reaction_type, user_id")
        .in("media_id", mediaIds);

      if (!error && reactions) {
        const counts = {};
        const userMap = {};

        mediaIds.forEach((id) => {
          counts[id] = { likes: 0, dislikes: 0 };
        });

        reactions.forEach((r) => {
          if (counts[r.media_id]) {
            if (r.reaction_type === "like") counts[r.media_id].likes += 1;
            if (r.reaction_type === "dislike") counts[r.media_id].dislikes += 1;
          }
          if (userId && r.user_id === userId) {
            userMap[r.media_id] = r.reaction_type;
          }
        });

        setReactionCounts((prev) => ({ ...prev, ...counts }));
        setUserReactions((prev) => ({ ...prev, ...userMap }));
      }
    } catch (err) {
      console.error("Error loading reactions:", err);
    }
  };

  const fetchComments = async (mediaId) => {
    try {
      const { data, error } = await supabase
        .from("media_comments")
        .select("*")
        .eq("media_id", mediaId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setComments(data);
      }
    } catch (err) {
      console.error("Fetch comments error:", err);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();

    if (!userProfile?.id) {
      alert("Kailangan mong mag-login o mag-register para makapag-comment!");
      return;
    }

    if (!newComment.trim()) return;

    if (parseInt(captchaInput, 10) !== captchaNum1 + captchaNum2) {
      alert("Mali ang sagot sa Captcha! Pakisubukan ulit.");
      generateCaptcha();
      return;
    }

    const linkRegex = /(https?:\/\/|www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i;
    if (!isAdmin && linkRegex.test(newComment)) {
      alert("Bawal maglagay ng kahit anong website link o URL sa comment section!");
      return;
    }

    setCommentLoading(true);

    try {
      const authorName = userProfile.full_name || userProfile.email || "Member";
      const { data, error } = await supabase
        .from("media_comments")
        .insert([
          {
            media_id: selectedMedia.id,
            user_id: userProfile.id,
            user_name: authorName,
            comment: newComment.trim(),
          },
        ])
        .select();

      if (error) {
        alert("Bumagsak ang pag-post ng comment: " + error.message);
      } else {
        setNewComment("");
        generateCaptcha();
        if (data && data.length > 0) {
          setComments((prev) => [data[0], ...prev]);
        } else {
          fetchComments(selectedMedia.id);
        }
      }
    } catch (err) {
      console.error("Comment submit error:", err);
    }

    setCommentLoading(false);
  };

  const handleReaction = async (e, mediaId, targetReaction) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!userProfile?.id) {
      alert("Please log in to like or dislike videos!");
      return;
    }

    const currentReaction = userReactions[mediaId] || null;
    let newReaction = null;

    if (currentReaction === targetReaction) {
      newReaction = null;
    } else {
      newReaction = targetReaction;
    }

    setUserReactions((prev) => {
      const updated = { ...prev };
      if (newReaction) {
        updated[mediaId] = newReaction;
      } else {
        delete updated[mediaId];
      }
      return updated;
    });

    setReactionCounts((prev) => {
      const currentCounts = prev[mediaId] || { likes: 0, dislikes: 0 };
      let likes = currentCounts.likes;
      let dislikes = currentCounts.dislikes;

      if (currentReaction === "like") likes = Math.max(0, likes - 1);
      if (currentReaction === "dislike") dislikes = Math.max(0, dislikes - 1);

      if (newReaction === "like") likes += 1;
      if (newReaction === "dislike") dislikes += 1;

      return {
        ...prev,
        [mediaId]: { likes, dislikes },
      };
    });

    try {
      if (newReaction === null) {
        await supabase
          .from("media_reactions")
          .delete()
          .eq("user_id", userProfile.id)
          .eq("media_id", mediaId);
      } else {
        await supabase.from("media_reactions").upsert(
          {
            user_id: userProfile.id,
            media_id: mediaId,
            reaction_type: newReaction,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,media_id" }
        );
      }
    } catch (err) {
      console.error("Reaction save error:", err);
    }
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

  const handleUpdateCategory = async (videoId, newCategory) => {
    const { error } = await supabase
      .from("media")
      .update({ category: newCategory })
      .eq("id", videoId);

    if (error) {
      alert("Failed to update category: " + error.message);
    } else {
      fetchMedia(currentPage, activeCategory);
    }
  };

  const handleSelectMedia = (e, item) => {
    e.preventDefault();
    e.stopPropagation();

    setSelectedMedia(item);

    const url = new URL(window.location.href);
    url.searchParams.set("v", item.id);
    url.searchParams.set("page", currentPage);
    url.searchParams.set("cat", activeCategory);
    url.searchParams.delete("step");
    window.history.replaceState({}, "", url);
  };

  const handleCloseMedia = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    const closedVideoId = selectedMedia?.id;
    setSelectedMedia(null);

    const url = new URL(window.location.href);
    url.searchParams.delete("v");
    url.searchParams.delete("step");
    window.history.replaceState({}, "", url);

    if (closedVideoId) {
      setTimeout(() => {
        const el = document.getElementById(`video-${closedVideoId}`);
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }, 50);
    }
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
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-10">
      <EventPopup />

      <div className="max-w-7xl mx-auto">
        {!isAdFree && <TopNativeBanner />}

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
                    {isAdmin ? "ADMIN" : isVIP ? "VIP" : "STANDARD"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isAdFree ? "Unlimited Videos • Ad-Free" : "Unlimited Videos"}
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
                id={`video-${item.id}`}
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
                  <div className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-red-950/60 text-red-400 rounded-md border border-red-900/40">
                        Video
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                        👁️ {viewCounts[item.id] || 0} views
                      </span>
                    </div>
                    <h3 className="text-white font-semibold text-base mt-2 line-clamp-1 group-hover:text-red-400 transition-colors">{item.title}</h3>
                  </div>
                </div>

                <div className="px-4 pb-3 flex items-center gap-2">
                  <button
                    onClick={(e) => handleReaction(e, item.id, "like")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      userReactions[item.id] === "like"
                        ? "bg-blue-600/20 text-blue-400 border-blue-500/40"
                        : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700"
                    }`}
                  >
                    <span>👍</span>
                    <span>{reactionCounts[item.id]?.likes || 0}</span>
                  </button>

                  <button
                    onClick={(e) => handleReaction(e, item.id, "dislike")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      userReactions[item.id] === "dislike"
                        ? "bg-red-600/20 text-red-400 border-red-500/40"
                        : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700"
                    }`}
                  >
                    <span>👎</span>
                    <span>{reactionCounts[item.id]?.dislikes || 0}</span>
                  </button>
                </div>

                {isAdmin && (
                  <div 
                    className="p-3 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 bg-slate-950/40"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Tag Category:
                    </span>
                    <select
                      value={item.category || "general"}
                      onChange={(e) => handleUpdateCategory(item.id, e.target.value)}
                      className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 font-bold cursor-pointer hover:border-red-500 focus:outline-none"
                    >
                      <option value="general">🔥 General</option>
                      <option value="pinay_asian">🇵🇭 Pinay / Asian</option>
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex flex-wrap justify-center items-center gap-3 mt-10 mb-6">
            <button 
              onClick={() => handlePageChange(currentPage - 1)} 
              disabled={currentPage === 1 || loading} 
              className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-red-600/50 text-xs font-bold rounded-xl text-white disabled:opacity-40 cursor-pointer transition-all"
            >
              ← Previous
            </button>

            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl">
              <span className="text-xs text-slate-400 font-semibold">Page</span>
              <select
                value={currentPage}
                onChange={(e) => handlePageChange(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 text-white text-xs font-bold rounded-lg px-2 py-1 focus:outline-none focus:border-red-500 cursor-pointer"
              >
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                  <option key={pg} value={pg}>
                    {pg}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-400 font-semibold">of <strong className="text-white">{totalPages}</strong></span>
            </div>

            <button 
              onClick={() => handlePageChange(currentPage + 1)} 
              disabled={currentPage === totalPages || loading} 
              className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-red-600/50 text-xs font-bold rounded-xl text-white disabled:opacity-40 cursor-pointer transition-all"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* VIDEO PLAYER MODAL */}
      {selectedMedia && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-2 md:p-6" onClick={handleCloseMedia}>
          <div className="bg-slate-900 border border-slate-800/80 w-full max-w-5xl max-h-[95vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            
            <div className="p-4 md:px-6 md:py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900 shrink-0">
              <div className="flex flex-col pr-4">
                <span className="text-[10px] md:text-xs font-black text-red-500 uppercase tracking-widest">Video Vault</span>
                <h2 className="text-sm md:text-lg font-bold text-white line-clamp-1 mt-0.5">{selectedMedia.title}</h2>
              </div>
              <button onClick={handleCloseMedia} className="w-9 h-9 bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white rounded-xl flex items-center justify-center transition-all cursor-pointer font-bold shrink-0 border border-slate-700/50">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-800">
              
              <div className="bg-black w-full flex items-center justify-center p-2 md:p-4 min-h-[280px] md:min-h-[460px]">
                <div className="w-full h-full max-w-4xl flex items-center justify-center [&_video]:w-full [&_video]:h-auto [&_video]:aspect-video [&_video]:bg-black">
                  <VIPVideoPlayer
                    key={selectedMedia.id}
                    mainVideoUrl={getCdnUrl(selectedMedia.media_url)}
                    adDirectLink={null}
                    userProfile={userProfile}
                    accountType={userProfile?.account_type}
                    isAdFree={isAdFree}
                    onPlay={handleVideoPlay}
                  />
                </div>
              </div>
              
              <div className="px-4 py-3 md:px-6 border-t border-b border-slate-800/80 bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-semibold bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                    👁️ {viewCounts[selectedMedia.id] || 0} Total Views
                  </span>
                  {selectedMedia.description && !selectedMedia.description.includes("Auto-synced") && (
                    <p className="text-slate-400 text-xs md:text-sm line-clamp-2">{selectedMedia.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => handleReaction(e, selectedMedia.id, "like")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      userReactions[selectedMedia.id] === "like"
                        ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/20"
                        : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700"
                    }`}
                  >
                    <span>👍 Like</span>
                    <span className="bg-black/40 px-2 py-0.5 rounded-md text-[10px]">
                      {reactionCounts[selectedMedia.id]?.likes || 0}
                    </span>
                  </button>

                  <button
                    onClick={(e) => handleReaction(e, selectedMedia.id, "dislike")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      userReactions[selectedMedia.id] === "dislike"
                        ? "bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/20"
                        : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700"
                    }`}
                  >
                    <span>👎 Dislike</span>
                    <span className="bg-black/40 px-2 py-0.5 rounded-md text-[10px]">
                      {reactionCounts[selectedMedia.id]?.dislikes || 0}
                    </span>
                  </button>
                </div>
              </div>

              {/* MODAL BANNER ADS (Free users only) */}
              {!isAdFree && (
                <div className="px-4 md:px-6">
                  <ModalNativeBanner />
                </div>
              )}

              {/* COMMENT SECTION */}
              <div className="px-4 py-5 md:px-6 bg-slate-900/90">
                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <span>💬 Comments</span>
                  <span className="text-xs text-slate-400">({comments.length})</span>
                </h3>

                {userProfile ? (
                  <form onSubmit={handleAddComment} className="flex flex-col gap-3 mb-6 bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                    <textarea
                      rows={2}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Isulat ang iyong komento... (Bawal ang website links/URLs)"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-red-500 resize-none"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl">
                        <span className="text-xs text-amber-400 font-bold">
                          🛡️ Security: {captchaNum1} + {captchaNum2} =
                        </span>
                        <input
                          type="number"
                          value={captchaInput}
                          onChange={(e) => setCaptchaInput(e.target.value)}
                          placeholder="Sagot"
                          className="w-16 bg-slate-950 border border-slate-700 text-center text-xs text-white font-bold rounded-lg px-2 py-1 focus:outline-none focus:border-red-500"
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={commentLoading}
                        className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50"
                      >
                        {commentLoading ? "Posting..." : "Post Comment"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl text-center mb-6">
                    <p className="text-xs text-slate-400">
                      🔒 Kailangan mong <strong className="text-white">Mag-login o Mag-register</strong> para makapag-comment.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  {comments.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">Wala pang komento. Maging una sa pag-comment!</p>
                  ) : (
                    comments.map((c) => (
                      <div key={c.id} className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-200">{c.user_name || "User"}</span>
                          <span className="text-[10px] text-slate-500">
                            {c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 break-words leading-relaxed">{c.comment}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

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