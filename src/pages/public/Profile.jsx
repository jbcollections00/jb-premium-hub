import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabaseClient";
import UserSupportTicket from "./UserSupportTicket";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [expirationDate, setExpirationDate] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [codeHistory, setCodeHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Profile Edit State
  const [displayName, setDisplayName] = useState("");
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ type: "", text: "" });

  // Access Code State
  const [accessCode, setAccessCode] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState({ type: "", text: "" });

  // Password Reset State
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState({ type: "", text: "" });

  // Delete Account State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // FAQ Toggle State
  const [openFaq, setOpenFaq] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    fetchUserData();
  }, []);

  useEffect(() => {
    if (!expirationDate) return;

    const timer = setInterval(() => {
      const calculated = calculateTimeLeft(expirationDate);
      setTimeLeft(calculated);
    }, 1000);

    return () => clearInterval(timer);
  }, [expirationDate]);

  const fetchUserData = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError;
      setUser(user);

      // 1. Fetch Profile Data
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        setProfileData(profile);
        setDisplayName(profile.full_name || user.email?.split("@")[0] || "");
      }

      // 2. Fetch Access Code Expiration
      const { data: activeCodes } = await supabase
        .from("access_codes")
        .select("expires_at")
        .eq("used_by", user.id)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1);

      if (activeCodes && activeCodes.length > 0 && activeCodes[0].expires_at) {
        setExpirationDate(activeCodes[0].expires_at);
        setTimeLeft(calculateTimeLeft(activeCodes[0].expires_at));
      } else {
        setExpirationDate(null);
        setTimeLeft(null);
      }

      // 3. Code History
      const { data: history } = await supabase
        .from("access_codes")
        .select("*")
        .eq("used_by", user.id)
        .order("used_at", { ascending: false });

      if (history) setCodeHistory(history);

    } catch (error) {
      console.error("Error fetching profile data:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateTimeLeft = (expDate) => {
    if (!expDate) return null;
    const difference = new Date(expDate) - new Date();

    if (difference <= 0) return { expired: true };

    return {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
      expired: false,
    };
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setUpdatingProfile(true);
    setProfileMsg({ type: "", text: "" });

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          full_name: displayName.trim()
        })
        .eq("id", user.id);

      if (error) throw error;
      setProfileMsg({ type: "success", text: "Display name updated successfully!" });
      fetchUserData();
    } catch (err) {
      setProfileMsg({ type: "error", text: err.message });
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleResetPassword = async () => {
    setResetLoading(true);
    setResetMsg({ type: "", text: "" });

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      setResetMsg({ type: "success", text: "Password reset link sent to your email!" });
    } catch (err) {
      setResetMsg({ type: "error", text: err.message });
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;

    setDeletingAccount(true);
    setDeleteError("");

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", user.id);

      if (profileError) throw profileError;

      await supabase.auth.signOut();
      navigate("/admin-login");
    } catch (err) {
      setDeleteError("Failed to delete account: " + err.message);
      setDeletingAccount(false);
    }
  };

  const handleRedeemCode = async (e) => {
    e.preventDefault();
    if (!accessCode.trim()) return;

    setRedeemLoading(true);
    setRedeemMsg({ type: "", text: "" });

    try {
      const cleanCode = accessCode.trim().toUpperCase();
      const now = new Date();

      const { data: codeData, error: fetchError } = await supabase
        .from("access_codes")
        .select("*")
        .eq("code", cleanCode)
        .eq("is_used", false)
        .single();

      if (fetchError || !codeData) {
        setRedeemMsg({ type: "error", text: "Invalid or already used access code." });
        setRedeemLoading(false);
        return;
      }

      if (codeData.expires_at && new Date(codeData.expires_at) < now) {
        setRedeemMsg({
          type: "error",
          text: "⛔ EXPIRED CODE: This code has exceeded its expiration limit.",
        });
        setRedeemLoading(false);
        return;
      }

      const isVip = (codeData.type || "VIP").toUpperCase() === "VIP";
      const durationDays = codeData.duration_days || 30;

      const { data: activeCodes } = await supabase
        .from("access_codes")
        .select("expires_at")
        .eq("used_by", user.id)
        .gt("expires_at", now.toISOString())
        .order("expires_at", { ascending: false })
        .limit(1);

      let baseDate = now;
      if (activeCodes && activeCodes.length > 0) {
        const currentExp = new Date(activeCodes[0].expires_at);
        if (currentExp > now) baseDate = currentExp;
      }

      const expiresAt = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

      await supabase
        .from("access_codes")
        .update({
          is_used: true,
          used_by: user.id,
          used_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq("id", codeData.id);

      await supabase
        .from("profiles")
        .update({
          account_type: isVip ? "VIP" : "STANDARD",
          is_activated: true,
        })
        .eq("id", user.id);

      const isExtension = baseDate > now;
      const activationTitle = isExtension
        ? `🎉 ${isVip ? "VIP" : "Standard"} Membership Extended!`
        : `🎉 ${isVip ? "VIP" : "Standard"} Account Activated!`;

      const activationMessage = isExtension
        ? `Great news! Your access has been extended by ${durationDays} days until ${expiresAt.toLocaleDateString("en-US")}.`
        : `Congratulations! Your account is active for ${durationDays} days until ${expiresAt.toLocaleDateString("en-US")}.`;

      await supabase.from("admin_messages").insert([
        {
          user_id: user.id,
          send_to_all: false,
          title: activationTitle,
          message: activationMessage,
          is_read: false,
        },
      ]);

      setRedeemMsg({
        type: "success",
        text: `Success! Code applied. New Expiration: ${expiresAt.toLocaleDateString("en-US")}`,
      });
      setAccessCode("");
      fetchUserData();
    } catch (err) {
      setRedeemMsg({ type: "error", text: "Failed to redeem: " + err.message });
    } finally {
      setRedeemLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] bg-slate-950 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  const rawAccountType = (profileData?.account_type || "STANDARD").toLowerCase();
  const isAdmin = rawAccountType === "admin";
  const hasActiveVipDate = expirationDate ? new Date(expirationDate) > new Date() : false;
  const isVip = isAdmin || rawAccountType === "vip" || hasActiveVipDate;

  const faqs = [
    {
      q: "How do I activate or extend my VIP membership?",
      a: "Enter your purchased Access Code in the 'Redeem Access Code' section above. Extra days automatically stack onto your current subscription expiration.",
    },
    {
      q: "What happens when my VIP status expires?",
      a: "Your account reverts to Standard status, restricting access to exclusive VIP video content until renewed.",
    },
    {
      q: "How can I buy an Access Code?",
      a: "Click on 'Buy 30 Days VIP' button or contact Admin Support directly via Telegram.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-10 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Account Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage your profile, active subscription status, and security settings.
          </p>
        </div>

        {/* Top Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Profile Card & Expiration Timer */}
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-600 via-amber-500 to-amber-300"></div>
              
              <div className="w-24 h-24 mx-auto bg-slate-800 rounded-full flex items-center justify-center border-4 border-slate-950 shadow-inner my-3 relative">
                <span className="text-3xl font-extrabold text-slate-300 uppercase">
                  {(displayName || user?.email)?.charAt(0)}
                </span>
                <span className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 border-4 border-slate-900 rounded-full"></span>
              </div>

              <h2 className="text-lg font-bold text-white truncate">
                {displayName || "User"}
              </h2>
              <p className="text-xs text-slate-400 truncate mb-3">{user?.email}</p>

              {/* Dynamic Account Badge */}
              {isAdmin ? (
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border bg-purple-500/20 text-purple-400 border-purple-500/40">
                  ⚙️ Admin Member
                </span>
              ) : isVip ? (
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border bg-amber-500/10 text-amber-400 border-amber-500/30">
                  👑 VIP Member
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border bg-blue-500/10 text-blue-400 border-blue-500/30">
                  👤 Standard Member
                </span>
              )}

              {/* BUY VIP ACCESS BUTTON */}
              <button
                onClick={() => navigate("/buy-vip")}
                className="w-full mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs py-3 px-4 rounded-xl shadow-lg shadow-amber-950/40 transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider"
              >
                👑 Buy 30 Days VIP
              </button>

              {/* Countdown Display */}
              {isVip && expirationDate && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950/90 border border-amber-500/20 text-left">
                  <p className="text-[11px] uppercase font-bold text-amber-400 tracking-wider text-center mb-2">
                    ⏳ VIP Remaining Access Time
                  </p>
                  {timeLeft?.expired ? (
                    <p className="text-xs font-bold text-rose-500 text-center py-1">MEMBERSHIP EXPIRED</p>
                  ) : timeLeft ? (
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <span className="text-base font-black text-white block">{timeLeft.days}</span>
                        <span className="text-[9px] text-slate-400 uppercase">Days</span>
                      </div>
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <span className="text-base font-black text-white block">{timeLeft.hours}</span>
                        <span className="text-[9px] text-slate-400 uppercase">Hours</span>
                      </div>
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <span className="text-base font-black text-white block">{timeLeft.minutes}</span>
                        <span className="text-[9px] text-slate-400 uppercase">Mins</span>
                      </div>
                      <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                        <span className="text-base font-black text-amber-400 block">{timeLeft.seconds}</span>
                        <span className="text-[9px] text-slate-400 uppercase">Secs</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* VIP Perks */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="text-amber-400">✨</span> VIP Member Advantages
              </h3>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Unlimited Video Streaming
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Full HD Quality Access
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span> Exclusive Priority Server
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column: Access Code Redemption & Profile Settings */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Redeem Access Code */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  🔑 Redeem Access Code
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Enter your activation code below to start or extend your subscription.
                </p>
              </div>

              <form onSubmit={handleRedeemCode} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    placeholder="ENTER CODE (E.G. VIP-XXXXXX)"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm uppercase font-mono tracking-wider focus:outline-none focus:border-red-500 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={redeemLoading}
                    className="bg-red-600 hover:bg-red-500 disabled:bg-slate-800 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shrink-0 cursor-pointer shadow-lg shadow-red-950/50"
                  >
                    {redeemLoading ? "Processing..." : "Activate Code"}
                  </button>
                </div>

                {redeemMsg.text && (
                  <p className={`text-xs font-bold mt-2 ${redeemMsg.type === "success" ? "text-emerald-400" : "text-rose-400"}`}>
                    {redeemMsg.text}
                  </p>
                )}
              </form>
            </div>

            {/* Personal Details Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                👤 Personal Details
              </h3>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                  <label className="text-xs font-semibold text-slate-400 uppercase">Display Name</label>
                  <div className="sm:col-span-2 flex gap-2">
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                    />
                    <button
                      type="submit"
                      disabled={updatingProfile}
                      className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shrink-0 cursor-pointer"
                    >
                      {updatingProfile ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
                {profileMsg.text && (
                  <p className={`text-xs font-bold ${profileMsg.type === "success" ? "text-emerald-400" : "text-rose-400"}`}>
                    {profileMsg.text}
                  </p>
                )}
              </form>
            </div>

            {/* Account Details & Security */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                🛡️ Account Details & Security
              </h3>

              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-3 border-b border-slate-800/80">
                  <span className="text-slate-400 font-medium">User ID</span>
                  <span className="sm:col-span-2 text-slate-300 font-mono bg-slate-950 p-2 rounded-lg truncate">
                    {user?.id}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-3 border-b border-slate-800/80">
                  <span className="text-slate-400 font-medium">Email Address</span>
                  <span className="sm:col-span-2 text-slate-200 font-semibold">{user?.email}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-3 border-b border-slate-800/80">
                  <span className="text-slate-400 font-medium">VIP Expiration Date</span>
                  <span className="sm:col-span-2 text-amber-400 font-bold">
                    {expirationDate ? formatDate(expirationDate) : "No Active VIP Subscription"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center pt-2">
                  <span className="text-slate-400 font-medium">Password Management</span>
                  <div className="sm:col-span-2">
                    <button
                      onClick={handleResetPassword}
                      disabled={resetLoading}
                      className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer"
                    >
                      {resetLoading ? "Sending Link..." : "🔑 Request Password Reset Link"}
                    </button>
                    {resetMsg.text && (
                      <p className={`text-xs font-bold mt-2 ${resetMsg.type === "success" ? "text-emerald-400" : "text-rose-400"}`}>
                        {resetMsg.text}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* DANGER ZONE: DELETE ACCOUNT */}
            <div className="bg-slate-900 border border-rose-900/40 rounded-2xl p-6 shadow-xl">
              <h3 className="text-lg font-bold text-rose-400 mb-2 flex items-center gap-2">
                ⚠️ Danger Zone
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Permanently remove your account and access to any active VIP memberships. This action cannot be undone.
              </p>

              <button
                onClick={() => setShowDeleteModal(true)}
                className="bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/60 font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2"
              >
                🗑️ Delete My Account
              </button>
            </div>

          </div>
        </div>

        {/* Subscription History Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            📜 Subscription Code History
          </h3>
          <p className="text-xs text-slate-400 mb-4">Record of all codes you have successfully redeemed.</p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Days Added</th>
                  <th className="py-3 px-4">Redeemed On</th>
                  <th className="py-3 px-4">Valid Until</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {codeHistory.length > 0 ? (
                  codeHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-950/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-white font-bold">{item.code}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {item.type || "VIP"}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-emerald-400">+{item.duration_days || 30} Days</td>
                      <td className="py-3 px-4 text-slate-400">{formatDate(item.used_at)}</td>
                      <td className="py-3 px-4 text-slate-300">{formatDate(item.expires_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-slate-500 italic">
                      No redeemed codes found in your account history.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Support & FAQs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* TICKET COMPONENT NA NASA KALIWA NA NGAYON (2 Columns space para lumapad) */}
          <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col overflow-hidden h-[450px]">
            <UserSupportTicket supabase={supabase} user={user} />
          </div>

          {/* FAQ NA NASA KANAN NA NGAYON (1 Column space) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl h-fit">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              ❓ Frequently Asked Questions
            </h3>
            <div className="space-y-3">
              {faqs.map((faq, idx) => (
                <div key={idx} className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/50">
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full text-left p-3 text-xs font-semibold text-slate-200 flex justify-between items-center hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <span className="text-slate-500 font-bold">{openFaq === idx ? "−" : "+"}</span>
                  </button>
                  {openFaq === idx && (
                    <div className="p-3 text-xs text-slate-400 border-t border-slate-800/80 bg-slate-950">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* CONFIRM DELETE MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/60 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-xl font-black text-rose-400 flex items-center gap-2">
              🚨 Permanently Delete Account?
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              This action will completely erase your profile information and active VIP status. You will not be able to recover this account.
            </p>

            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase text-slate-400 block">
                Type <span className="text-white font-mono font-black">DELETE</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono uppercase text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            {deleteError && (
              <p className="text-xs text-rose-400 font-semibold">{deleteError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText("");
                  setDeleteError("");
                }}
                disabled={deletingAccount}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== "DELETE" || deletingAccount}
                className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer"
              >
                {deletingAccount ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}