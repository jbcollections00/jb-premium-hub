import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../services/supabaseClient";
import VIPVideoPlayer from "../../components/VIPVideoPlayer";
import EventPopup from "../../components/EventPopup";

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

// Helper function para i-format ang duration ng video
const formatDuration = (duration) => {
  if (!duration) return "00:00";
  if (typeof duration === "string" && duration.includes(":")) return duration;
  const sec = parseInt(duration, 10);
  if (isNaN(sec)) return "00:00";
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${mins}:${remSec < 10 ? "0" : ""}${remSec}`;
};

// Single Native Banner Component for Top Placement (Isolating in Iframe)
function TopNativeBanner() {
  const adHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; background: transparent; overflow: hidden; }
      </style>
    </head>
    <body>
      <script async="async" data-cfasync="false" src="https://deeprootedpressure.com/07daf68a9e786bf55c0980163fb30853/invoke.js"></script>
      <div id="container-07daf68a9e786bf55c0980163fb30853"></div>
    </body>
    </html>
  `;

  return (
    <div className="w-full flex flex-col items-center justify-center mb-6 p-3 bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
      <span className="text-[10px] text-slate-500 font-semibold mb-1 uppercase tracking-widest">Advertisement</span>
      <iframe
        srcDoc={adHtml}
        className="w-full h-[100px] border-0 overflow-hidden"
        scrolling="no"
        title="Top Adsterra Banner"
      />
    </div>
  );
}

// Native Banner Component inside Video Modal (Isolating in Iframe)
function ModalNativeBanner() {
  const adHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; background: transparent; overflow: hidden; }
      </style>
    </head>
    <body>
      <script async="async" data-cfasync="false" src="https://deeprootedpressure.com/07daf68a9e786bf55c0980163fb30853/invoke.js"></script>
      <div id="container-07daf68a9e786bf55c0980163fb30853"></div>
    </body>
    </html>
  `;

  return (
    <div className="w-full flex flex-col items-center justify-center my-4 p-3 bg-slate-950/80 border border-amber-500/20 rounded-xl overflow-hidden shadow-md">
      <span className="text-[9px] text-amber-500/70 font-semibold mb-1 uppercase tracking-widest">Sponsored Content</span>
      <iframe
        srcDoc={adHtml}
        className="w-full h-[100px] border-0 overflow-hidden"
        scrolling="no"
        title="Modal Adsterra Banner"
      />
    </div>
  );
}

export default function Home() {
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState(null);

  // States para sa Most Watched Videos
  const [mostWatched, setMostWatched] = useState([]);
  const [mostWatchedLoading, setMostWatchedLoading] = useState(true);

  // Ref para i-save ang eksaktong scroll position bago magbukas ng video
  const scrollPosRef = useRef(0);

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

  // Admin Viewers Modal State
  const [showViewersModal, setShowViewersModal] = useState(false);
  const [viewersList, setViewersList] = useState([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [viewersModalMedia, setViewersModalMedia] = useState(null);

  // States para sa Comments at Captcha
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [captchaNum1, setCaptchaNum1] = useState(0);
  const [captchaNum2, setCaptchaNum2] = useState(0);
  const [captchaInput, setCaptchaInput] = useState("");

  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);

  const accountTypeUpper = (userProfile?.account_type || "").toUpperCase();
  const roleUpper = (userProfile?.role || "").toUpperCase();
  const isAdmin = accountTypeUpper === "ADMIN" || roleUpper === "ADMIN";
  const isVIP = accountTypeUpper === "VIP" || roleUpper === "VIP";
  const isAdFree = isAdmin || isVIP;

  // Body scroll management
  useEffect(() => {
    if (selectedMedia) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [selectedMedia]);

  // Load Socialbar Script dynamically
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

  // Handle Auth Session Restoration
  useEffect(() => {
    fetchUserProfile();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await loadProfileForUser(session.user);
      } else {
        setUserProfile(null);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    fetchMedia(currentPage, activeCategory);
    fetchMostWatched();
  }, [currentPage, activeCategory]);

  useEffect(() => {
    const allIds = [
      ...mediaList.map((m) => m.id),
      ...mostWatched.map((m) => m.id),
    ];
    const uniqueIds = [...new Set(allIds)];

    if (uniqueIds.length > 0) {
      const initialViews = {};
      [...mediaList, ...mostWatched].forEach((m) => {
        initialViews[m.id] = m.views_count ?? m.views ?? 0;
      });
      setViewCounts((prev) => ({ ...initialViews, ...prev }));

      fetchReactionsData(uniqueIds, userProfile?.id);
      fetchViewCountsData(uniqueIds);
    }
  }, [mediaList, mostWatched, userProfile]);

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
        const found = mediaList.find((m) => String(m.id) === String(videoId)) || mostWatched.find((m) => String(m.id) === String(videoId));
        if (found) {
          setSelectedMedia(found);
          setTimeout(() => {
            const el = document.getElementById(`video-${videoId}`);
            if (el) {
              el.scrollIntoView({ block: "center" });
              scrollPosRef.current = window.scrollY || document.documentElement.scrollTop;
            }
          }, 100);
        }
      }
    }
  }, [mediaList, mostWatched, selectedMedia]);

  const generateCaptcha = () => {
    setCaptchaNum1(Math.floor(Math.random() * 9) + 1);
    setCaptchaNum2(Math.floor(Math.random() * 9) + 1);
    setCaptchaInput("");
  };

  const loadProfileForUser = async (user) => {
    if (!user?.id) return;
    try {
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

      const mergedProfile = {
        ...(profile || {}),
        id: user.id,
        email: user.email || profile?.email,
        role: profile?.role || user.app_metadata?.role || user.user_metadata?.role || "user",
        account_type: profile?.account_type || user.user_metadata?.account_type || "standard",
      };

      setUserProfile(mergedProfile);
    } catch (err) {
      console.error("Profile load error:", err);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await loadProfileForUser(session.user);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await loadProfileForUser(user);
      }
    } catch (err) {
      console.error("Profile fetch error:", err);
    }
  };

  // Kumuha ng Top Most Watched Videos
  const fetchMostWatched = async () => {
    setMostWatchedLoading(true);
    try {
      const { data, error } = await supabase
        .from("media")
        .select("*")
        .eq("type", "video")
        .order("views_count", { ascending: false })
        .limit(6);

      if (!error && data) {
        setMostWatched(data);
      }
    } catch (err) {
      console.error("Fetch most watched error:", err);
    } finally {
      setMostWatchedLoading(false);
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

      const counts = {};
      mediaIds.forEach((id) => (counts[id] = 0));

      if (!error && data) {
        data.forEach((item) => {
          if (counts[item.media_id] !== undefined) {
            counts[item.media_id] += 1;
          }
        });
      }

      setViewCounts((prev) => {
        const merged = { ...prev };
        mediaIds.forEach((id) => {
          const tableCount = counts[id] || 0;
          const mediaObj = [...mediaList, ...mostWatched].find((m) => m.id === id);
          const mediaDbCount = mediaObj?.views_count ?? mediaObj?.views ?? 0;
          merged[id] = Math.max(merged[id] || 0, tableCount, mediaDbCount);
        });
        return merged;
      });
    } catch (err) {
      console.error("View count fetch error:", err);
    }
  };

  const handleOpenViewers = async (e, mediaItem) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!isAdmin || !mediaItem?.id) return;

    setViewersModalMedia(mediaItem);
    setShowViewersModal(true);
    setViewersLoading(true);

    try {
      const { data: viewsData, error: viewsErr } = await supabase
        .from("media_views")
        .select("created_at, user_id")
        .eq("media_id", mediaItem.id)
        .order("created_at", { ascending: false });

      if (viewsErr) throw viewsErr;

      if (viewsData && viewsData.length > 0) {
        const userIds = [...new Set(viewsData.filter((v) => v.user_id).map((v) => v.user_id))];

        let profilesMap = {};
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, full_name, email, account_type")
            .in("id", userIds);

          if (profilesData) {
            profilesData.forEach((p) => {
              profilesMap[p.id] = p;
            });
          }
        }

        const formatted = viewsData.map((v) => ({
          created_at: v.created_at,
          user_id: v.user_id,
          profile: v.user_id ? profilesMap[v.user_id] : null,
        }));

        setViewersList(formatted);
      } else {
        setViewersList([]);
      }
    } catch (err) {
      console.error("Viewers log fetch error:", err.message);
    } finally {
      setViewersLoading(false);
    }
  };

  const handleVideoPlay = async () => {
    if (!selectedMedia?.id || hasRecordedCurrentView) return;

    setHasRecordedCurrentView(true);
    const mediaId = selectedMedia.id;
    const currentVal = viewCounts[mediaId] ?? selectedMedia.views_count ?? selectedMedia.views ?? 0;
    const newCount = currentVal + 1;

    setViewCounts((prev) => ({
      ...prev,
      [mediaId]: newCount,
    }));

    try {
      await supabase.from("media_views").insert([
        { media_id: mediaId, user_id: userProfile?.id || null }
      ]);

      await supabase
        .from("media")
        .update({ views_count: newCount, views: newCount })
        .eq("id", mediaId);

      await supabase.rpc("increment_video_views", { p_media_id: mediaId }).catch(() => {});
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
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    scrollPosRef.current = window.scrollY || document.documentElement.scrollTop;
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
    
    const targetY = scrollPosRef.current;
    setSelectedMedia(null);

    const url = new URL(window.location.href);
    url.searchParams.delete("v");
    url.searchParams.delete("step");
    window.history.replaceState({}, "", url);

    setTimeout(() => {
      window.scrollTo(0, targetY);
    }, 20);
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

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-10">
      <EventPopup />

      <div className="max-w-7xl mx-auto">
        {!isAdFree && <TopNativeBanner />}

        {/* MOST WATCHED VIDEOS SHOWCASE SECTION */}
        <div className="mb-10 bg-slate-900/80 border border-slate-800 rounded-3xl p-4 md:p-6 shadow-2xl backdrop-blur-md relative overflow-hidden">
          {/* Subtle Ambient Background Glow */}
          <div className="absolute -top-20 -left-20 w-60 h-60 bg-red-600/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

          {/* Header Bar ng Most Watched Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center text-2xl shadow-lg shadow-red-600/30 border border-amber-400/30">
                🔥
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xl md:text-2xl font-black text-white tracking-wide">
                    Most Watched
                  </h2>
                  <span className="bg-gradient-to-r from-red-600 to-amber-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest shadow-md">
                    TOP TRENDING
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ang pinakapinapanood na mga video sa komunidad
                </p>
              </div>
            </div>

            {/* User Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {userProfile && (
                <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-xs">
                  <span className="text-slate-500 font-semibold">Account:</span>
                  <span className={`font-black uppercase text-[11px] ${isAdmin ? 'text-purple-400' : isVIP ? 'text-amber-400' : 'text-blue-400'}`}>
                    {isAdmin ? "🛡️ Admin" : isVIP ? "👑 VIP" : "👤 Standard"}
                  </span>
                </div>
              )}
              {userProfile && !isAdFree && (
                <button
                  onClick={() => setShowRedeemModal(true)}
                  className="bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-red-600/20 cursor-pointer flex items-center gap-1.5 border border-amber-400/30 active:scale-95"
                >
                  <span>🔑 Upgrade VIP</span>
                </button>
              )}
            </div>
          </div>

          {/* Cards Horizontal Slider */}
          {mostWatchedLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 py-4">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="bg-slate-950/80 border border-slate-800/80 rounded-2xl h-44 animate-pulse"></div>
              ))}
            </div>
          ) : mostWatched.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-2 pt-1 scrollbar-none snap-x snap-mandatory relative z-10">
              {mostWatched.map((item, index) => {
                const rank = index + 1;
                const badgeStyle =
                  rank === 1
                    ? "bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 text-black shadow-amber-500/40"
                    : rank === 2
                    ? "bg-gradient-to-r from-slate-200 to-slate-400 text-black shadow-slate-300/30"
                    : rank === 3
                    ? "bg-gradient-to-r from-amber-700 to-amber-900 text-white shadow-amber-800/30"
                    : "bg-slate-950/90 text-slate-300 border border-slate-800";

                return (
                  <div
                    key={`top-${item.id}`}
                    onClick={(e) => handleSelectMedia(e, item)}
                    className="min-w-[190px] sm:min-w-[210px] md:min-w-[230px] max-w-[230px] bg-slate-950 border border-slate-800/80 hover:border-amber-500/60 rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-300 cursor-pointer group snap-start flex flex-col justify-between shrink-0 hover:-translate-y-1"
                  >
                    <div>
                      {/* Thumbnail Box */}
                      <div className="aspect-video bg-black relative overflow-hidden flex items-center justify-center">
                        {/* Rank Badge */}
                        <div className={`absolute top-2 left-2 z-10 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-lg ${badgeStyle}`}>
                          #{rank} {rank === 1 ? "🔥" : ""}
                        </div>

                        {/* Duration Badge */}
                        <div className="absolute bottom-2 right-2 z-10 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-bold text-amber-400 border border-amber-500/30">
                          ⏱️ {formatDuration(item.duration)}
                        </div>

                        {item.thumbnail_url ? (
                          <img
                            src={getCdnUrl(item.thumbnail_url)}
                            alt={item.title}
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : item.media_url ? (
                          <video
                            src={`${getCdnUrl(item.media_url)}#t=1`}
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                            preload="metadata"
                            muted
                            playsInline
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-900 flex items-center justify-center text-slate-600 text-xs font-semibold">
                            No Display
                          </div>
                        )}

                        {/* Play Overlay */}
                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                          <div className="w-10 h-10 bg-amber-500 group-hover:bg-red-600 text-black group-hover:text-white rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-all duration-300">
                            <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Content Info */}
                      <div className="p-3">
                        <h4 className="text-white font-bold text-xs line-clamp-1 group-hover:text-amber-400 transition-colors">
                          {item.title}
                        </h4>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-900">
                          <span
                            onClick={(e) => isAdmin && handleOpenViewers(e, item)}
                            className={`text-[11px] font-bold text-amber-400/90 flex items-center gap-1 ${isAdmin ? 'hover:underline cursor-pointer' : ''}`}
                            title={isAdmin ? "Click to view watch logs (Admin)" : ""}
                          >
                            👁️ {viewCounts[item.id] ?? item.views_count ?? item.views ?? 0} views
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {reactionCounts[item.id]?.likes ? `👍 ${reactionCounts[item.id].likes}` : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 bg-slate-950/40 border border-slate-800/60 rounded-2xl text-center text-slate-500 text-xs">
              Wala pang karagdagang data para sa Most Watched videos.
            </div>
          )}
        </div>

        {/* VAULT MEDIA LIST HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-white">Vault Media</h1>
          <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl self-start sm:self-auto">
            Showing {mediaList.length} of <strong className="text-red-500">{totalCount}</strong> Videos
          </span>
        </div>

        {/* CATEGORY TABS */}
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

        {/* MAIN VIDEO GRID */}
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
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : item.media_url ? (
                      <video
                        src={`${getCdnUrl(item.media_url)}#t=1`}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 pointer-events-none"
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
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-slate-950/80 text-red-400 rounded-md border border-red-900/40 flex items-center gap-1">
                        ⏱️ {formatDuration(item.duration)}
                      </span>
                      <span
                        onClick={(e) => isAdmin && handleOpenViewers(e, item)}
                        className={`text-[11px] text-slate-400 font-medium flex items-center gap-1 ${isAdmin ? 'hover:text-red-400 cursor-pointer underline decoration-dotted underline-offset-2' : ''}`}
                        title={isAdmin ? "Click to view watch logs (Admin)" : ""}
                      >
                        👁️ {viewCounts[item.id] ?? item.views_count ?? item.views ?? 0} views
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

        {/* PAGINATION */}
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

            <div className="overflow-y-auto flex-1 [scrollbar-width:thin] [scrollbar-color:#ef4444_#0f172a] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:bg-slate-950 [&::-webkit-scrollbar-thumb]:bg-red-600 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-red-500">
              
              <div className="bg-black w-full flex items-center justify-center p-2 md:p-4 min-h-[280px] md:min-h-[460px]">
                <div className="w-full h-full max-w-4xl flex items-center justify-center [&_video]:max-h-[70vh] [&_video]:w-auto [&_video]:max-w-full [&_video]:object-contain [&_video]:bg-black">
                  <VIPVideoPlayer 
                    key={selectedMedia.id}
                    mainVideoUrl={getCdnUrl(selectedMedia.media_url)} 
                    isAdFree={isAdFree} 
                    accountType={userProfile?.account_type} 
                    userProfile={userProfile} 
                    onPlay={handleVideoPlay}
                  />
                </div>
              </div>
              
              <div className="px-4 py-3 md:px-6 border-t border-b border-slate-800/80 bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span 
                    onClick={(e) => isAdmin && handleOpenViewers(e, selectedMedia)}
                    className={`text-xs text-slate-400 font-semibold bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5 ${isAdmin ? 'hover:text-red-400 hover:border-red-500/50 cursor-pointer' : ''}`}
                    title={isAdmin ? "Click to view user watch logs (Admin)" : ""}
                  >
                    👁️ {viewCounts[selectedMedia.id] ?? selectedMedia.views_count ?? selectedMedia.views ?? 0} Total Views {isAdmin && "🔍 (Log)"}
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

              {!isAdFree && (
                <div className="px-4 md:px-6">
                  <ModalNativeBanner />
                </div>
              )}

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

      {/* ADMIN VIEWERS LOG MODAL */}
      {showViewersModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowViewersModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full relative shadow-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowViewersModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            >
              ✕
            </button>

            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <span>👁️</span> Video Viewers Log (Admin Only)
            </h3>
            <p className="text-xs text-slate-400 mb-4 line-clamp-1 border-b border-slate-800 pb-2">
              {viewersModalMedia?.title}
            </p>

            <div className="overflow-y-auto flex-1 divide-y divide-slate-800/60 pr-1">
              {viewersLoading ? (
                <div className="text-center py-8 text-xs text-slate-400">Loading viewer accounts...</div>
              ) : viewersList.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500 italic">No user views recorded yet for this video.</div>
              ) : (
                viewersList.map((vw, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-200">
                        {vw.profile?.full_name || vw.profile?.email || (vw.user_id ? `User ID: ${vw.user_id.slice(0, 8)}...` : "Anonymous Guest")}
                      </div>
                      {vw.profile?.email && (
                        <div className="text-[10px] text-slate-500 font-mono">{vw.profile.email}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase ${
                        vw.profile?.account_type === "vip" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-slate-800 text-slate-400"
                      }`}>
                        {vw.profile?.account_type || "Guest"}
                      </span>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {vw.created_at ? new Date(vw.created_at).toLocaleString() : "N/A"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* REDEEM CODE MODAL */}
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