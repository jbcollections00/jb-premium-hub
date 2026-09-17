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
      const { data: { user } } = await supabase.auth.getUser();
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

  const handleAccessAccount = async (userAccount) => {
    if (!userAccount?.id && !userAccount?.email) {
      alert("Cannot impersonate: Invalid user profile.");
      return;
    }

    const displayName = userAccount.full_name || userAccount.email || userAccount.id;
    if (!window.confirm(`Are you sure you want to log in as "${displayName}"?`)) return;

    try {
      setActionInProgress(userAccount.id);

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

  const filteredUsers = users.filter((u) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      (u.full_name && u.full_name.toLowerCase().includes(searchLower)) ||
      (u.email && u.email.toLowerCase().includes(searchLower)) ||
      (u.id && u.id.toLowerCase().includes(searchLower));

    const accountType = (u.account_type || u.role || "").toUpperCase();
    const isAdmin = accountType === "ADMIN";
    const isVip = accountType === "VIP";

    if (filterType === "ADMIN") return matchesSearch && isAdmin;
    if (filterType === "VIP") return matchesSearch && isVip;
    if (filterType === "STANDARD") return matchesSearch && !isVip && !isAdmin;
    if (filterType === "ONLINE") return matchesSearch && onlineUserIds.has(u.id);

    return matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">User Management</h1>
        <p className="text-xs text-gray-400 mt-1">
          Monitor online active users, toggle membership tiers, impersonate accounts, and manage user status.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-1/2">
          <input
            type="text"
            placeholder="🔍 Search Name, Email, or User ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs text-gray-400 shrink-0">Filter:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-gray-900 border border-gray-800 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-red-500 cursor-pointer w-full md:w-auto"
          >
            <option value="ALL">All Accounts ({users.length})</option>
            <option value="ONLINE">Online Now ({onlineUserIds.size})</option>
            <option value="ADMIN">Admins Only</option>
            <option value="VIP">VIP Members</option>
            <option value="STANDARD">Standard Users</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-xs">Loading user profiles...</div>
      ) : (
        <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-2xl shadow-xl">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-gray-950 text-gray-400 font-semibold border-b border-gray-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-4">User Details</th>
                <th className="p-4">Account Tier</th>
                <th className="p-4">Status</th>
                <th className="p-4">Joined Date</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500">
                    No user accounts match your search or filter criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isOnline = onlineUserIds.has(u.id);
                  const isVip = (u.account_type || "").toUpperCase() === "VIP";

                  return (
                    <tr key={u.id} className="hover:bg-gray-800/40 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-white">{u.full_name || u.email || 'Unnamed User'}</div>
                        <div className="text-[10px] text-gray-500 font-mono truncate max-w-xs">{u.id}</div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                          isVip ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}>
                          {u.account_type || 'STANDARD'}
                        </span>
                      </td>
                      <td className="p-4">
                        {u.is_banned ? (
                          <span className="text-rose-400 font-bold">🚫 Banned</span>
                        ) : isOnline ? (
                          <span className="text-emerald-400 font-bold">🟢 Online</span>
                        ) : (
                          <span className="text-gray-500">Offline</span>
                        )}
                      </td>
                      <td className="p-4 text-gray-400">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button
                          disabled={actionInProgress === u.id}
                          onClick={() => handleToggleVip(u.id, u.account_type)}
                          className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg font-bold text-[10px] transition-all cursor-pointer"
                        >
                          {isVip ? 'Demote VIP' : 'Make VIP'}
                        </button>
                        <button
                          disabled={actionInProgress === u.id}
                          onClick={() => handleAccessAccount(u)}
                          className="px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg font-bold text-[10px] transition-all cursor-pointer"
                        >
                          Impersonate
                        </button>
                        <button
                          disabled={actionInProgress === u.id}
                          onClick={() => handleBanUser(u.id, u.is_banned)}
                          className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg font-bold text-[10px] transition-all cursor-pointer"
                        >
                          {u.is_banned ? 'Unban' : 'Ban'}
                        </button>
                        <button
                          disabled={actionInProgress === u.id}
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-1 text-gray-500 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Delete User"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}