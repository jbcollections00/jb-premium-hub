import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());

  useEffect(() => {
    fetchUsers();
    setupPresence();
  }, []);

  // 1. Fetch Users List mula sa Database
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsers(profiles || []);
    } catch (err) {
      console.error("Error fetching users:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Realtime Presence Listener (Kung sino ang Online ngayon)
  const setupPresence = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const channel = supabase.channel("online-users", {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const activeIds = new Set(Object.keys(state));
        setOnlineUserIds(activeIds);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  };

  // 3. Admin Access/Impersonate User Account
  const handleAccessAccount = (userAccount) => {
    const confirmAccess = window.confirm(
      `Gusto mo bang i-access at pasukin ang account ni "${userAccount.full_name || userAccount.email}"?`
    );

    if (confirmAccess) {
      // I-save sa localStorage para magamit sa frontend session view
      localStorage.setItem("admin_impersonated_user", JSON.stringify(userAccount));
      alert(`Na-access mo na ang account ni ${userAccount.full_name || userAccount.email}. Inililipat ka na sa Home...`);
      window.location.href = "/home";
    }
  };

  // Promote / Demote User
  const handleToggleVip = async (userId, currentType) => {
    const newType = currentType === "VIP" ? "STANDARD" : "VIP";
    const { error } = await supabase
      .from("profiles")
      .update({ account_type: newType })
      .eq("id", userId);

    if (!error) fetchUsers();
  };

  // Ban User
  const handleBanUser = async (userId, isBanned) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_banned: !isBanned })
      .eq("id", userId);

    if (!error) fetchUsers();
  };

  // Delete User
  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Sigurado ka bang gusto mong burahin ang user na ito?")) return;
    const { error } = await supabase.from("profiles").delete().eq("id", userId);
    if (!error) fetchUsers();
  };

  // Filter & Search Logic
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      (u.full_name && u.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.id && u.id.toLowerCase().includes(searchTerm.toLowerCase()));

    const isVip = (u.account_type || "").toUpperCase() === "VIP";
    if (filterType === "VIP") return matchesSearch && isVip;
    if (filterType === "STANDARD") return matchesSearch && !isVip;
    if (filterType === "ONLINE") return matchesSearch && onlineUserIds.has(u.id);

    return matchesSearch;
  });

  return (
    <div className="p-6 bg-slate-950 text-white min-h-screen">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
        <div className="relative w-full md:w-1/2">
          <input
            type="text"
            placeholder="🔍 Search Name, Email, or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs text-slate-400 shrink-0">Filter:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-red-500"
          >
            <option value="ALL">All Accounts ({users.length})</option>
            <option value="ONLINE">Online Now ({onlineUserIds.size})</option>
            <option value="VIP">VIP Only</option>
            <option value="STANDARD">Standard Only</option>
          </select>
        </div>
      </div>

      {/* Users List */}
      {loading ? (
        <div className="text-center py-10 text-slate-400">Loading users...</div>
      ) : (
        <div className="space-y-4">
          {filteredUsers.map((item) => {
            const isVip = (item.account_type || "").toUpperCase() === "VIP";
            const isOnline = onlineUserIds.has(item.id);

            return (
              <div
                key={item.id}
                className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg hover:border-slate-700 transition-all"
              >
                {/* User Details */}
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    {/* 🟢 Online Status Indicator */}
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isOnline
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-slate-800 text-slate-500 border-slate-700"
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isOnline ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                        }`}
                      ></span>
                      {isOnline ? "ONLINE" : "OFFLINE"}
                    </span>

                    <h3 className="font-bold text-white text-base">
                      {item.full_name || item.email || "Unnamed User"}
                    </h3>

                    {/* Badge VIP / Standard */}
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-md uppercase border ${
                        isVip
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                          : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      }`}
                    >
                      {isVip ? "VIP 👑" : "STANDARD"}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 font-mono">
                    ID: {item.id}
                  </p>
                  <p className="text-xs text-slate-400">
                    Watch Tokens: <span className="text-amber-400 font-bold">{item.tokens || 0}</span> | Daily Views Used: <span className="text-white font-bold">{item.views_used || 0}/5</span>
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 🔑 ACCESS ACCOUNT BUTTON */}
                  <button
                    onClick={() => handleAccessAccount(item)}
                    className="bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 font-bold text-xs px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                    title="Access account as this user"
                  >
                    🔑 Access
                  </button>

                  {/* PROMOTE / DEMOTE */}
                  <button
                    onClick={() => handleToggleVip(item.id, item.account_type)}
                    className={`font-bold text-xs px-3.5 py-2 rounded-xl border transition-all cursor-pointer ${
                      isVip
                        ? "bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 border-purple-500/30"
                        : "bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 border-emerald-500/30"
                    }`}
                  >
                    {isVip ? "Demote" : "Promote 👑"}
                  </button>

                  {/* BAN / UNBAN */}
                  <button
                    onClick={() => handleBanUser(item.id, item.is_banned)}
                    className={`font-bold text-xs px-3.5 py-2 rounded-xl border transition-all cursor-pointer ${
                      item.is_banned
                        ? "bg-amber-900/40 hover:bg-amber-800 text-amber-300 border-amber-500/30"
                        : "bg-orange-950/50 hover:bg-orange-900 text-orange-400 border-orange-800/40"
                    }`}
                  >
                    {item.is_banned ? "Unban 🔓" : "Ban 🚫"}
                  </button>

                  {/* DELETE */}
                  <button
                    onClick={() => handleDeleteUser(item.id)}
                    className="bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-300 border border-slate-700/60 hover:border-rose-500/40 font-bold text-xs px-3 py-2 rounded-xl transition-all cursor-pointer"
                  >
                    Delete 🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}