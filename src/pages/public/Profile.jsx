import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Access Code State
  const [accessCode, setAccessCode] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState({ type: "", text: "" });

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(user);

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (profile) setProfileData(profile);
      }
    } catch (error) {
      console.error("Error fetching user data:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // 🔑 CODE REDEMPTION WITH AUTOMATIC DAY STACKING & EXPIRATION CHECK
  const handleRedeemCode = async (e) => {
    e.preventDefault();
    if (!accessCode.trim()) return;

    setRedeemLoading(true);
    setRedeemMsg({ type: "", text: "" });

    try {
      const cleanCode = accessCode.trim().toUpperCase();
      const now = new Date();

      // 1. Fetch & Verify Code
      const { data: codeData, error: fetchError } = await supabase
        .from("access_codes")
        .select("*")
        .eq("code", cleanCode)
        .eq("is_used", false)
        .single();

      if (fetchError || !codeData) {
        console.error("Fetch code error (Likely doesn't exist or RLS block):", fetchError);
        setRedeemMsg({ type: "error", text: "Invalid or already used access code." });
        setRedeemLoading(false);
        return;
      }

      // 🛑 2. CHECK IF UNUSED CODE IS EXPIRED (Lampas sa 7-day limit)
      if (codeData.expires_at && new Date(codeData.expires_at) < now) {
        setRedeemMsg({
          type: "error",
          text: "⛔ EXPIRED CODE: Ang Access Code na ito ay lampas na sa 7 araw na expiration limit at hindi na pwedeng gamitin. Mag-request ng bago sa Admin."
        });
        setRedeemLoading(false);
        return;
      }

      const isVip = (codeData.type || "VIP").toUpperCase() === "VIP";
      const durationDays = codeData.duration_days || 30;

      // 3. ➕ STACKING LOGIC: Check for active unexpired code
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
        if (currentExp > now) {
          baseDate = currentExp; // Dagdag mula sa lumang expiration date!
        }
      }

      const expiresAt = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

      // 4. Update Access Code in Database
      await supabase
        .from("access_codes")
        .update({
          is_used: true,
          used_by: user.id,
          used_at: now.toISOString(),
          expires_at: expiresAt.toISOString()
        })
        .eq("id", codeData.id);

      // 5. Update User Profile Status
      await supabase
        .from("profiles")
        .update({
          account_type: isVip ? "VIP" : "STANDARD",
          is_activated: true
        })
        .eq("id", user.id);

      // 6. Automated Notification Message
      const isExtension = baseDate > now;
      const activationTitle = isExtension
        ? `🎉 ${isVip ? 'VIP' : 'Standard'} Membership Extended!`
        : `🎉 ${isVip ? 'VIP' : 'Standard'} Account Activated!`;

      const activationMessage = isExtension
        ? `Great news! Your ${isVip ? 'VIP' : 'Standard'} access has been extended by ${durationDays} days. Your new expiration date is ${expiresAt.toLocaleDateString("en-US")}.`
        : `Congratulations! Your ${isVip ? 'VIP' : 'Standard'} account is now active for ${durationDays} days until ${expiresAt.toLocaleDateString("en-US")}.`;

      await supabase.from("admin_messages").insert([
        {
          user_id: user.id,
          send_to_all: false,
          title: activationTitle,
          message: activationMessage,
          is_read: false
        }
      ]);

      setRedeemMsg({
        type: "success",
        text: `Success! Code applied. New Expiration: ${expiresAt.toLocaleDateString("en-US")}`
      });
      setAccessCode("");
      fetchUserData();
    } catch (err) {
      console.error("Redeem code system error:", err);
      setRedeemMsg({ type: "error", text: "Failed to redeem: " + err.message });
    } finally {
      setRedeemLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const options = { year: "numeric", month: "long", day: "numeric" };
    return new Date(dateString).toLocaleDateString("en-US", options);
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] bg-slate-950 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  const accountType = profileData?.account_type || "STANDARD";
  const isVip = accountType.toUpperCase() === "VIP";

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">My Profile</h1>
          <p className="text-slate-400 mt-1">Manage your account settings and activate subscriptions.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 🧑‍💼 Left Column: Avatar & Basic Info */}
          <div className="md:col-span-1 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-lg">
              <div className="w-24 h-24 mx-auto bg-slate-800 rounded-full flex items-center justify-center border-4 border-slate-950 shadow-inner mb-4 relative">
                <span className="text-3xl font-bold text-slate-400 uppercase">
                  {user?.email ? user.email.charAt(0) : "U"}
                </span>
                <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 border-4 border-slate-900 rounded-full" title="Online"></div>
              </div>
              <h2 className="text-lg font-semibold text-white truncate px-2">
                {user?.email || "No Email Found"}
              </h2>
              <span
                className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${
                  isVip
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                }`}
              >
                {isVip ? "👑 VIP Member" : "👤 Standard Member"}
              </span>
            </div>
          </div>

          {/* ⚙️ Right Column: Details & Code Redemption */}
          <div className="md:col-span-2 space-y-6">
            
            {/* 🔑 REDEEM ACCESS CODE CARD */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <span>🔑</span> Redeem Access Code
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Enter your VIP or Standard monthly code to activate or extend your membership.
              </p>

              <form onSubmit={handleRedeemCode} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    placeholder="E.G. VIP-XXXXXX"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm uppercase font-mono focus:outline-none focus:border-red-500"
                  />
                  <button
                    type="submit"
                    disabled={redeemLoading}
                    className="bg-red-600 hover:bg-red-500 disabled:bg-slate-800 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition-all cursor-pointer shrink-0"
                  >
                    {redeemLoading ? "Activating..." : "Activate Code"}
                  </button>
                </div>

                {redeemMsg.text && (
                  <p
                    className={`text-xs font-bold mt-2 ${
                      redeemMsg.type === "success" ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {redeemMsg.text}
                  </p>
                )}
              </form>
            </div>

            {/* 📋 Account Information Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                Account Details
              </h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 pb-4 border-b border-slate-800/50">
                  <div className="text-slate-400 text-sm font-medium">User ID</div>
                  <div className="sm:col-span-2 text-sm text-slate-300 font-mono bg-slate-950/50 p-2 rounded-lg truncate">
                    {user?.id || "N/A"}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 pb-4 border-b border-slate-800/50">
                  <div className="text-slate-400 text-sm font-medium">Email Address</div>
                  <div className="sm:col-span-2 text-sm text-slate-200">
                    {user?.email || "N/A"}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
                  <div className="text-slate-400 text-sm font-medium">Member Since</div>
                  <div className="sm:col-span-2 text-sm text-slate-200">
                    {formatDate(user?.created_at)}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}