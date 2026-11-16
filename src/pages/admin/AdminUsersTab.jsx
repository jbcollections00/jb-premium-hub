import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../services/supabaseClient";
import AdminMembershipModal from "./AdminMembershipModal";
import {
  getAdminDisplayedTier, getAdminDisplayedTierLabel,
  matchAdminMemberTierFilter, normalizeAdminPaidTiers, countAdminDisplayTiers,
} from "../../services/adminMemberTierView";

const USERS_PER_PAGE = 50;

export default function AdminUsers({ onlineUserIds = new Set() }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [paidTiers, setPaidTiers] = useState(new Map());
  const [paidStatus, setPaidStatus] = useState("loading");
  const [paidError, setPaidError] = useState("");
  const paidSerialRef = useRef(0);
  const [fetchError, setFetchError] = useState("");
  const requestSerialRef = useRef(0);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [membershipUser, setMembershipUser] = useState(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Dashboard owns the shared online-presence channel. Do not create/remove
  // a second channel in this tab: it would break live status on tab changes.
  useEffect(() => {
    void fetchUsers();
    void fetchLivePaidTiers();
    return () => {
      // Ignore late replies once the lazy tab is unmounted.
      requestSerialRef.current += 1;
      paidSerialRef.current += 1;
    };
  }, []);

  // I-reset sa Page 1 kapag nagbago ang search term o filter type
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType, onlineOnly]);

  // BATCH FETCH: Kukunin ang lahat ng users kahit lumagpas sa 1000 limit ng Supabase
  const fetchUsers = async () => {
    const requestSerial = ++requestSerialRef.current;
    setFetchError("");
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

      if (requestSerial === requestSerialRef.current) setUsers(allProfiles);
    } catch (err) {
      console.error("Error fetching users:", err?.code || "UNAVAILABLE");
      if (requestSerial === requestSerialRef.current) {
        setFetchError("User profiles could not be loaded. Try reopening this tab.");
      }
    } finally {
      if (requestSerial === requestSerialRef.current) setLoading(false);
    }
  };

  const fetchLivePaidTiers = async () => {
    const serial = ++paidSerialRef.current;
    setPaidStatus("loading");
    setPaidError("");
    // Do NOT fall back to profiles.account_type if the authoritative
    // admin-only RPC is missing, unauthorized or malformed.
    try {
      const { data, error } = await supabase.rpc("jb_admin_live_paid_tiers_v1");
      if (serial !== paidSerialRef.current) return;
      if (error) throw error;
      const active = normalizeAdminPaidTiers(data);
      setPaidTiers(active);
      setPaidStatus("ready");
    } catch (error) {
      if (serial !== paidSerialRef.current) return;
      setPaidTiers(new Map());
      setPaidStatus("error");
      // A previously selected VIP/Standard filter must not make all rows
      // mysteriously disappear while payment verification is unavailable.
      setFilterType("ALL");
      setPaidError(
        "Verified LIVE membership tiers are unavailable. Ensure the " +
        "admin-only billing report RPC is installed and authorized. " +
        "No users have been reclassified."
      );
      console.error("Admin membership tiers unavailable:", error?.code || "UNAVAILABLE");
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

  // True LIVE paid tiers from the server. Never infer payment from profiles.
  const tierCounts = countAdminDisplayTiers(users, paidTiers, paidStatus);
  const filteredUsers = users.filter((u) => {
    const searchLower = searchTerm.trim().toLowerCase();
    const matchesSearch =
      String(u.full_name || "").toLowerCase().includes(searchLower) ||
      String(u.email || "").toLowerCase().includes(searchLower) ||
      String(u.id || "").toLowerCase().includes(searchLower);
    if (!matchesSearch || (onlineOnly && !onlineUserIds.has(u.id))) return false;
    const tier = getAdminDisplayedTier(u, paidTiers, paidStatus);
    return matchAdminMemberTierFilter(tier, filterType);
  });

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
        <p className="mt-2 text-xs text-sky-100/80">
          Payment tiers are based on current LIVE paid entitlement grants, not profile labels.
          Complimentary access and admin privileges are separate.
        </p>
        <p className="mt-3 text-xs">Profiles loaded: <strong>{users.length.toLocaleString()}</strong></p>
        {paidStatus === "ready" ? (
          <p className="mt-2 text-sm font-semibold text-sky-100" role="status">
            Free: {tierCounts.free.toLocaleString()} · Standard: {tierCounts.standard.toLocaleString()} · VIP: {tierCounts.vip.toLocaleString()}
          </p>
        ) : (
          <p className="mt-2 text-xs text-amber-200" role="status">
            {paidStatus === "loading" ? "Checking verified LIVE membership tiers…" : "Membership verification unavailable"}
          </p>
        )}
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

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <label htmlFor="admin-users-tier-filter" className="text-xs text-slate-300 shrink-0">Payment tier:</label>
          <select
            id="admin-users-tier-filter"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            disabled={paidStatus !== "ready"}
            style={{ colorScheme: "dark" }}
            className="w-full min-w-44 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30 disabled:opacity-50 sm:w-auto"
          >
            <option value="ALL">All users ({users.length})</option>
            <option value="FREE">Free Users ({paidStatus === "ready" ? tierCounts.free : "—"})</option>
            <option value="STANDARD">Standard Users ({paidStatus === "ready" ? tierCounts.standard : "—"})</option>
            <option value="VIP">VIP ({paidStatus === "ready" ? tierCounts.vip : "—"})</option>
          </select>
          <label className="inline-flex items-center gap-2 text-xs text-slate-200">
            <input type="checkbox" checked={onlineOnly} onChange={e => setOnlineOnly(e.target.checked)}
              className="accent-sky-500" />
            Online only ({onlineUserIds.size})
          </label>
          <button type="button" onClick={() => void fetchLivePaidTiers()}
            disabled={paidStatus === "loading"}
            className="jbh-admin-secondary rounded-xl px-3 py-2 text-xs disabled:opacity-40">
            Refresh tiers
          </button>
        </div>
      </div>

      {paidError && (
        <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          {paidError}
        </div>
      )}

      {fetchError && (
        <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          {fetchError}
        </div>
      )}

      {loading ? (
        <div role="status" className="text-center py-12 text-gray-400 text-sm">Loading user profiles...</div>
      ) : (
        <>
          <div className="jbh-admin-panel jbh-admin-table overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-gray-950 text-gray-400 font-semibold border-b border-gray-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-4">User Details</th>
                  <th className="p-4" title="Verified active LIVE paid tier, or Free if no current paid grant">Payment tier</th>
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
                    const tier = getAdminDisplayedTier(u, paidTiers, paidStatus);
                    const isAdminUser = (u.role || "").toLowerCase() === "admin" || (u.account_type || "").toLowerCase() === "admin";

                    return (
                      <tr key={u.id} className="hover:bg-gray-800/40 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-white">{u.full_name || u.email || 'Unnamed User'}</div>
                          <div className="text-[10px] text-gray-500 font-mono truncate max-w-xs">{u.id}</div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            tier === "vip"
                              ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                              : tier === "standard"
                                ? "bg-sky-500/10 text-sky-300 border-sky-500/20"
                                : tier === "free"
                                  ? "bg-slate-500/10 text-slate-300 border-slate-500/20"
                                  : "bg-rose-500/10 text-rose-300 border-rose-500/20"
                          }`} title="Based on current server-authorized LIVE paid entitlement grants">
                            {getAdminDisplayedTierLabel(tier)}
                          </span>
                          {isAdminUser && (
                            <div className="mt-2 text-[10px] text-violet-300">Admin role</div>
                          )}
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
          onClose={() => setMembershipUser(null)}
        />
      )}
    </div>
  );
}
