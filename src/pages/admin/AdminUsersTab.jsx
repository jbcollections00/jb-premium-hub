import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [actionInProgress, setActionInProgress] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let channel;

    fetchUsers();

    const setupPresence = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Guard against unmounted state or no authenticated user
      if (!user || !isMounted) return;

      const existingChannel = supabase
        .getChannels()
        .find((c) => c.topic === "realtime:online-users");
      if (existingChannel) {
        await supabase.removeChannel(existingChannel);
      }

      if (!isMounted) return;

      channel = supabase.channel("online-users", {
        config: { presence: { key: user.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (!isMounted) return;
          const state = channel.presenceState();
          const activeIds = new Set(Object.keys(state));
          setOnlineUserIds(activeIds);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && isMounted) {
            await channel.track({ online_at: new Date().toISOString() });
          }
        });
    };

    setupPresence();

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // 1. Fetch Users List
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

  // 2. Impersonation Link Handler
  const handleAccessAccount = async (userAccount) => {
    if (!userAccount?.id && !userAccount?.email) {
      alert("Cannot impersonate: Invalid user profile.");
      return;
    }

    const displayName = userAccount.full_name || userAccount.email || userAccount.id;

    if (!window.confirm(`Are you sure you want to log in as "${displayName}"?`)) return;

    try {
      setActionInProgress(userAccount.id);

      // Verify active admin session and retrieve session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("Authentication error: Session expired. Please log in again as Admin.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("impersonate-user", {
        body: {
          targetUserId: userAccount.id,
          targetEmail: userAccount.email,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        let detailedError = error.message;
        if (error.context) {
          try {
            const errorBody = await error.context.json();
            if (errorBody?.error) detailedError = errorBody.error;
          } catch (_) {}
        }
        alert("Impersonation failed: " + detailedError);
        return;
      }

      if (data?.action_link) {
        window.open(data.action_link, "_blank");
      } else {
        alert("Failed to generate impersonation link.");
      }
    } catch (err) {
      alert("Error connecting to impersonation service: " + err.message);
    } finally {
      setActionInProgress(null);
    }
  };

  // 3. Promote / Demote VIP (Optimistic Update)
  const handleToggleVip = async (userId, currentType) => {
    const newType = currentType === "VIP" ? "STANDARD" : "VIP";
    setActionInProgress(userId);

    const { error } = await supabase
      .from("profiles")
      .update({ account_type: newType })
      .eq("id", userId);

    if (error) {
      alert("Failed to update account tier: " + error.message);
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, account_type: newType } : u))
      );
    }
    setActionInProgress(null);
  };

  // 4. Ban / Unban User (Optimistic Update)
  const handleBanUser = async (userId, isBanned) => {
    setActionInProgress(userId);

    const { error } = await supabase
      .from("profiles")
      .update({ is_banned: !isBanned })
      .eq("id", userId);

    if (error) {
      alert("Failed to update ban status: " + error.message);
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_banned: !isBanned } : u))
      );
    }
    setActionInProgress(null);
  };

  // 5. Delete User Profile
  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Are you sure you want to delete this user profile?")) return;
    setActionInProgress(userId);

    const { error } = await supabase.from("profiles").delete().eq("id", userId);

    if (error) {
      alert("Failed to delete user: " + error.message);
    } else {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    }
    setActionInProgress(null);
  };

  // Search & Filter Logic
  const filteredUsers = users.filter((u) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      (u.full_name && u.full_name.toLowerCase().includes(searchLower)) ||
      (u.email && u.email.toLowerCase().includes(searchLower)) ||
      (u.id && u.id.toLowerCase().includes(searchLower));

    const isVip = (u.account_type || "").toUpperCase() === "VIP";
    if (filterType === "VIP") return matchesSearch && isVip;
    if (filterType === "STANDARD") return matchesSearch && !isVip;
    if (filterType === "ONLINE") return matchesSearch && onlineUserIds.has(u.id);

    return matchesSearch;
  });

  return (
    <div className="p-6 bg-slate-950 text-white min-h-screen">
      {/* Search & Filter Header */}
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
            className="bg-slate-900 border border-slate-800 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-red-500 cursor-pointer"
          >
            <option value="ALL">All Accounts ({users.length})</option>
            <option value="ONLINE">Online Now ({onlineUserIds.size})</option>
            <option value="VIP">VIP Only</option>
            <option value="STANDARD">Standard Only</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">Loading users...</div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/50 border border-slate-800 rounded-2xl text-slate-400 text-sm">
          No user accounts found matching your search criteria.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredUsers.map((item) => {
            const isVip = (item.account_type || "").toUpperCase() === "VIP";
            const isOnline = onlineUserIds.has(item.id);
            const isProcessing = actionInProgress === item.id;

            return (
              <div
                key={item.id}
                className={`bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg hover:border-slate-700 transition-all ${
                  isProcessing ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                {/* User Metadata */}
                <div className="space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
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
                      {item.full_name || "Unnamed User"}
                    </h3>

                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-md uppercase border ${
                        isVip
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                          : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      }`}
                    >
                      {isVip ? "VIP 👑" : "STANDARD"}
                    </span>

                    {item.is_banned && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-950/60 text-rose-400 border border-rose-800/50">
                        BANNED 🚫
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 font-medium">
                    {item.email || "No email linked"}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono">ID: {item.id}</p>
                  <p className="text-xs text-slate-400">
                    Watch Tokens: <span className="text-amber-400 font-bold">{item.tokens || 0}</span> | Daily Views Used: <span className="text-white font-bold">{item.views_used || 0}/5</span>
                  </p>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => handleAccessAccount(item)}
                    disabled={isProcessing}
                    className="bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/30 font-bold text-xs px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                    title="Log in as this user in a new tab"
                  >
                    👁️ View as User
                  </button>

                  <button
                    onClick={() => handleToggleVip(item.id, item.account_type)}
                    disabled={isProcessing}
                    className={`font-bold text-xs px-3.5 py-2 rounded-xl border transition-all cursor-pointer ${
                      isVip
                        ? "bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 border-purple-500/30"
                        : "bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 border-emerald-500/30"
                    }`}
                  >
                    {isVip ? "Demote" : "Promote 👑"}
                  </button>

                  <button
                    onClick={() => handleBanUser(item.id, item.is_banned)}
                    disabled={isProcessing}
                    className={`font-bold text-xs px-3.5 py-2 rounded-xl border transition-all cursor-pointer ${
                      item.is_banned
                        ? "bg-amber-900/40 hover:bg-amber-800 text-amber-300 border-amber-500/30"
                        : "bg-orange-950/50 hover:bg-orange-900 text-orange-400 border-orange-800/40"
                    }`}
                  >
                    {item.is_banned ? "Unban 🔓" : "Ban 🚫"}
                  </button>

                  <button
                    onClick={() => handleDeleteUser(item.id)}
                    disabled={isProcessing}
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