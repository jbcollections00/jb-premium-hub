import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";
import AdminMembershipModal from "./AdminMembershipModal";

const USERS_PER_PAGE = 50;

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [membershipTiersById, setMembershipTiersById] = useState({});
  const [membershipTierError, setMembershipTierError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [actionInProgress, setActionInProgress] = useState(null);
  const [membershipUser, setMembershipUser] = useState(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

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

  // I-reset sa Page 1 kapag nagbago ang search term o filter type
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType]);

  // BATCH FETCH: Kukunin ang lahat ng users kahit lumagpas sa 1000 limit ng Supabase
  const fetchUsers = async () => {
    try {
      setLoading(true);
      let allProfiles = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allProfiles = [...allProfiles, ...data];
          from += batchSize;
          if (data.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      setUsers(allProfiles);

      // Fetch effective memberships in bounded admin-only batches. The legacy
      // profile.account_type field does NOT prove an active paid membership.
      const tiers = {};
      try {
        for (let offset = 0; offset < allProfiles.length; offset += 200) {
          const batch = allProfiles.slice(offset, offset + 200);
          const ids = batch.map((user) => user.id);
          const { data: resolved, error: tierError } = await supabase.rpc(
            "jb_admin_user_membership_tiers_v1",
            { p_user_ids: ids }
          );
          if (tierError) throw tierError;
          if (!Array.isArray(resolved)) throw new Error("Invalid membership response.");
          for (const entry of resolved) {
            if (!ids.includes(entry?.user_id) ||
                !["FREE", "STANDARD", "VIP", "ADMIN"].includes(entry?.tier)) {
              throw new Error("Unexpected membership response.");
            }
            tiers[entry.user_id] = entry.tier;
          }
        }
        if (!allProfiles.every((user) => Object.hasOwn(tiers, user.id))) {
          throw new Error("Incomplete membership response.");
        }
        setMembershipTiersById(tiers);
        setMembershipTierError(false);
      } catch (tierError) {
        console.error("Unable to load current membership tiers:", tierError?.code || tierError?.message);
        // Fail closed: never fall back to 'Profile: standard' or invent FREE.
        setMembershipTiersById({});
        setMembershipTierError(true);
        setFilterType("ALL");
      }
    } catch (err) {
      console.error("Error fetching users:", err.message);
      setMembershipTiersById({});
      setMembershipTierError(true);
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

  // Membership changes now use audited, admin-only RPCs in AdminMembershipModal.

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

  // Live Realtime presence may still include IDs for deleted accounts or
  // sessions that have no registered profile. The online badge must count
  // exactly the same visible users as the Online Now table.
  const searchLower = searchTerm.trim().toLowerCase();
  const matchesSearch = (u) =>
    [u.full_name, u.email, u.id].some((value) =>
      String(value || "").toLowerCase().includes(searchLower)
    );
  const matchingUsers = users.filter(matchesSearch);
  const onlineMatchingUsers = matchingUsers.filter((u) => onlineUserIds.has(u.id));
  const onlineCount = onlineMatchingUsers.length;

  // 1. FILTER LOGIC
  const filteredUsers = filterType === "ONLINE"
    ? onlineMatchingUsers
    : ["ADMIN", "VIP", "STANDARD", "FREE"].includes(filterType)
      ? matchingUsers.filter((u) => membershipTiersById[u.id] === filterType)
      : matchingUsers;

  // 2. PAGINATION CALCULATIONS
  const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);
  const startIndex = (currentPage - 1) * USERS_PER_PAGE;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + USERS_PER_PAGE);

  return (
    <div className="jbh-admin-page space-y-6">
      <header className="jbh-admin-page-head">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sky-100">People & accounts</p>
        <h1 className="mt-2">User management</h1>
        <p className="mt-2 text-sm">Review account profiles, membership grants and access settings.</p>
        <p className="mt-3 text-xs">Profiles loaded: <strong>{users.length.toLocaleString()}</strong></p>
      </header>

      <div className="jbh-admin-panel flex flex-col items-stretch justify-between gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="relative w-full md:w-1/2">
          <input
            type="text"
            placeholder="Search name, email or user ID"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="jbh-admin-input w-full px-4 py-3 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs text-gray-400 shrink-0">Filter:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full min-w-40 px-3 py-2.5 text-sm sm:w-auto"
          >
            <option value="ALL">All Accounts ({users.length})</option>
            <option value="ONLINE">Online Now ({onlineCount})</option>
            <option value="ADMIN" disabled={membershipTierError}>Admins Only</option>
            <option value="FREE" disabled={membershipTierError}>FREE Account Users</option>
            <option value="STANDARD" disabled={membershipTierError}>STANDARD Account Users</option>
            <option value="VIP" disabled={membershipTierError}>VIP Account Users</option>
          </select>
        </div>
      </div>

      {membershipTierError && !loading && (
        <div role="status" className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
          Membership tier data is temporarily unavailable. User profiles remain visible, but no FREE, STANDARD or VIP status is guessed. Refresh the page to retry.
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-xs">Loading user profiles...</div>
      ) : (
        <>
          <div className="jbh-admin-panel jbh-admin-table overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-gray-950 text-gray-400 font-semibold border-b border-gray-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-4">User Details</th>
                  <th className="p-4">Account User</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Joined Date</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-gray-500">
                      No user accounts match your search or filter criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((u) => {
                    const isOnline = onlineUserIds.has(u.id);
                    const currentTier = membershipTiersById[u.id];
                    const isAdminUser = (u.role || "").toLowerCase() === "admin" || (u.account_type || "").toLowerCase() === "admin";
                    const tierStyle = currentTier === "VIP"
                      ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                      : currentTier === "STANDARD"
                        ? "bg-sky-500/10 text-sky-300 border-sky-500/30"
                        : currentTier === "FREE"
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                          : "bg-slate-500/10 text-slate-300 border-slate-500/30";

                    return (
                      <tr key={u.id} className="hover:bg-gray-800/40 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-white">{u.full_name || u.email || 'Unnamed User'}</div>
                          <div className="text-[10px] text-gray-500 font-mono truncate max-w-xs">{u.id}</div>
                        </td>
                        <td className="p-4">
                          <span title="Current effective membership access" className={`inline-block rounded-full border px-2.5 py-1 text-[10px] font-bold ${tierStyle}`}>
                            {currentTier || "Unavailable"}
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
                            disabled={actionInProgress === u.id || Boolean(u.is_banned) || isAdminUser}
                            onClick={() => setMembershipUser(u)}
                            className="jbh-admin-secondary px-3 py-2 text-xs font-semibold disabled:opacity-50"
                            title="Manage complimentary membership grants; payment subscriptions are unchanged"
                          >
                            Manage Membership
                          </button>
                          <button
                            disabled={actionInProgress === u.id}
                            onClick={() => handleAccessAccount(u)}
                            className="jbh-admin-secondary px-3 py-2 text-xs font-semibold disabled:opacity-50"
                          >
                            Impersonate
                          </button>
                          <button
                            disabled={actionInProgress === u.id}
                            onClick={() => handleBanUser(u.id, u.is_banned)}
                            className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg font-bold text-[10px] transition-all cursor-pointer disabled:opacity-50"
                          >
                            {u.is_banned ? 'Unban' : 'Ban'}
                          </button>
                          <button
                            disabled={actionInProgress === u.id}
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1 text-gray-500 hover:text-rose-400 transition-colors cursor-pointer disabled:opacity-50"
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

          {/* Lalabas lang ang Pagination UI kung higit sa 50 ang filtered users */}
          {totalPages > 1 && (
            <div className="jbh-admin-panel mt-5 flex flex-wrap items-center justify-between gap-3 p-4">
              <span className="text-xs text-gray-400">
                Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                  className="jbh-admin-secondary px-4 py-2 text-xs font-semibold disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || loading}
                  className="jbh-admin-secondary px-4 py-2 text-xs font-semibold disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {membershipUser && (
        <AdminMembershipModal
          key={membershipUser.id}
          user={membershipUser}
          onClose={() => { setMembershipUser(null); fetchUsers(); }}
        />
      )}
    </div>
  );
}
