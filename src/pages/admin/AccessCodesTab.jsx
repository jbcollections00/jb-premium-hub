import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabaseClient";

const PER_PAGE = 50;
const TABS = [
  { key: "VIP", label: "VIP Codes" },
  { key: "STANDARD", label: "Standard Codes" },
  { key: "EXPIRED", label: "Expired / History" },
];
const expDate = (code) => {
  if (code.expires_at) {
    const date = new Date(code.expires_at);
    if (Number.isFinite(date.valueOf())) return date;
  }
  if (code.is_used && code.used_at) {
    const date = new Date(code.used_at);
    if (Number.isFinite(date.valueOf())) {
      return new Date(date.valueOf() + (code.duration_days || 30) * 86400000);
    }
  }
  return null;
};
function stateOf(code, now) {
  const expiry = expDate(code);
  if (code.is_used) {
    if (!expiry) return "UNKNOWN";
    return expiry.getTime() <= now ? "EXPIRED" : "REDEEMED";
  }
  if (expiry && expiry.getTime() <= now) return "EXPIRED";
  return "AVAILABLE";
}
const textDate = (date) => date ? date.toLocaleString("en-PH") : "Unknown";
function fromRow(row) {
  const plan = String(row.type || "").toUpperCase();
  return plan === "STANDARD" ? "STANDARD" : plan === "VIP" ? "VIP" : "UNKNOWN";
}
function loadAll(table, select, order = "created_at", max = 10000) {
  return (async () => {
    const result = [];
    for (let offset = 0; offset < max; offset += 1000) {
      const { data, error } = await supabase.from(table).select(select)
        .order(order, { ascending: false }).range(offset, offset + 999);
      if (error) throw error;
      result.push(...(data || []));
      if (!data || data.length < 1000) return result;
    }
    throw new Error("Too many records to display safely. Use a paged backend.");
  })();
}
export default function AccessCodesTab() {
  const [codes, setCodes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("VIP");
  const [activeTab, setActiveTab] = useState("VIP");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [selectedCode, setSelectedCode] = useState(null);
  const [modalQuery, setModalQuery] = useState("");
  const [modalUser, setModalUser] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [errorText, setErrorText] = useState("");
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorText("");
    try {
      const [newCodes, profiles] = await Promise.all([
        loadAll("access_codes", "id,code,type,is_used,used_by,used_at,expires_at,created_at,duration_days"),
        loadAll("profiles", "id,email,full_name,account_type,role,created_at"),
      ]);
      setCodes(newCodes);
      setUsers(profiles.filter((u) =>
        u.id && u.email && String(u.role || "").toLowerCase() !== "admin" &&
        String(u.account_type || "").toLowerCase() !== "admin"
      ));
    } catch (error) {
      setErrorText(error.message || "Could not load access codes.");
      setCodes([]);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { setPage(1); }, [activeTab, filter, search]);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const counts = useMemo(() => ({
    VIP: codes.filter((c) => fromRow(c) === "VIP" && stateOf(c, now) !== "EXPIRED").length,
    STANDARD: codes.filter((c) => fromRow(c) === "STANDARD" && stateOf(c, now) !== "EXPIRED").length,
    EXPIRED: codes.filter((c) => stateOf(c, now) === "EXPIRED").length,
    AVAILABLE: codes.filter((c) => stateOf(c, now) === "AVAILABLE").length,
  }), [codes, now]);
  const filtered = useMemo(() => codes.filter((code) => {
    const state = stateOf(code, now);
    const matchesTab = activeTab === "EXPIRED" ? state === "EXPIRED"
      : fromRow(code) === activeTab && state !== "EXPIRED";
    const matchesFilter = filter === "ALL" || filter === state;
    const q = search.toLowerCase().trim();
    const recipient = usersById.get(code.used_by);
    const matchesSearch = !q || [code.code, recipient?.email, recipient?.full_name, code.used_by]
      .some((value) => String(value || "").toLowerCase().includes(q));
    return matchesTab && matchesFilter && matchesSearch;
  }), [codes, now, activeTab, filter, search, usersById]);
  const visible = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));

  async function notifyUser(userId, code, plan, days) {
    const { error } = await supabase.from("admin_messages").insert({
      user_id: userId, send_to_all: false,
      title: "Your " + plan + " access code",
      message: "Here is your " + plan + " access code (" + days +
        " days):\n\n" + code + "\n\nRedeem it on your Profile page.",
      is_read: false,
    });
    if (error) throw error;
  }
  async function generate(event) {
    event.preventDefault();
    if (busy) return;
    if (sendTo && !usersById.has(sendTo)) {
      setErrorText("Choose a registered non-admin recipient."); return;
    }
    setBusy(true); setErrorText(""); setStatus("");
    try {
      const { data, error } = await supabase.rpc("jb_admin_create_access_code_v1", {
        p_type: type, p_duration_days: 30, p_custom_code: customCode.trim() || null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.code) throw new Error("Code generation did not return a code.");
      if (sendTo) {
        try {
          await notifyUser(sendTo, row.code, type, 30);
          setStatus(type + " code " + row.code + " created and sent successfully.");
        } catch (sendError) {
          setStatus(type + " code " + row.code + " created, but message delivery failed: " + sendError.message);
        }
      } else {
        setStatus(type + " access code " + row.code + " created.");
      }
      setCustomCode(""); setSendTo(""); setActiveTab(type);
      await refresh();
    } catch (error) { setErrorText(error.message || "Code generation failed."); }
    finally { setBusy(false); }
  }
  async function removeUnused(row) {
    if (busy || stateOf(row, Date.now()) !== "AVAILABLE") return;
    if (!window.confirm("Permanently delete UNUSED " + fromRow(row) + " code " +
      row.code + "? Redeemed codes cannot be deleted.")) return;
    setBusy(true); setErrorText(""); setStatus("");
    try {
      const { data, error } = await supabase.rpc("jb_admin_delete_unused_access_code_v1", {
        p_code_id: row.id,
      });
      if (error || data !== true) throw error || new Error("Delete was not confirmed.");
      setStatus("Unused code deleted successfully.");
      await refresh();
    } catch (error) { setErrorText(error?.message || "Delete failed."); }
    finally { setBusy(false); }
  }
  async function sendExisting(event) {
    event.preventDefault();
    if (busy || !selectedCode || !usersById.has(modalUser) ||
        stateOf(selectedCode, Date.now()) !== "AVAILABLE") return;
    setBusy(true); setErrorText(""); setStatus("");
    try {
      await notifyUser(modalUser, selectedCode.code, fromRow(selectedCode),
        selectedCode.duration_days || 30);
      setStatus("Code sent to " + usersById.get(modalUser).email + ".");
      setSelectedCode(null); setModalUser(""); setModalQuery("");
    } catch (error) { setErrorText(error.message || "Could not send code."); }
    finally { setBusy(false); }
  }
  const foundUsers = users.filter((u) => {
    const q = modalQuery.toLowerCase();
    return !q || String(u.email || "").toLowerCase().includes(q) ||
      String(u.full_name || "").toLowerCase().includes(q);
  }).slice(0, 100);

  return (
    <section className="jbh-admin-page space-y-5">
      <header className="jbh-admin-page-head">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sky-100">Member benefits</p>
        <h1 className="mt-2">Access codes</h1>
        <p className="mt-2 text-sm">Issue 30-day complimentary VIP or Standard codes. PayMongo-paid subscriptions remain separate. Redeemed and expired codes are preserved for audit history.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["VIP", counts.VIP, "text-amber-300"],
          ["Standard", counts.STANDARD, "text-sky-300"],
          ["Available", counts.AVAILABLE, "text-emerald-300"],
          ["Expired", counts.EXPIRED, "text-rose-300"],
        ].map(([label, value, color]) => (
          <div key={label} className="jbh-admin-stat p-4">
            <p className="text-xs font-bold text-slate-300">{label}</p>
            <p className={"text-2xl font-black mt-1 " + color}>{value}</p>
          </div>
        ))}
      </div>

      <form onSubmit={generate} className="jbh-admin-panel space-y-3 p-4 sm:p-5">
        <h2 className="text-base font-bold">Generate / send access code</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-bold">Membership type
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="jbh-admin-input mt-2 w-full p-3 text-sm">
              <option value="VIP">VIP · 30 days</option>
              <option value="STANDARD">Standard · 30 days</option>
            </select>
          </label>
          <label className="text-xs font-bold">Custom code (optional)
            <input value={customCode} onChange={(e) => setCustomCode(e.target.value)}
              placeholder={type + "-XXXXXXXX"} maxLength={64}
              className="jbh-admin-input mt-2 w-full p-3 font-mono text-sm uppercase"/>
          </label>
          <label className="text-xs font-bold xl:col-span-2">Send directly to member (optional)
            <select value={sendTo} onChange={(e) => setSendTo(e.target.value)}
              className="jbh-admin-input mt-2 w-full p-3 text-sm">
              <option value="">Create code only</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </label>
          <button type="submit" disabled={busy} className="jbh-admin-primary mt-auto min-h-11 text-sm disabled:opacity-50">
            {busy ? "Working..." : "Generate code"}
          </button>
        </div>
      </form>

      {errorText && <div role="alert" className="rounded-xl border border-rose-400/50 bg-rose-900/20 p-3 text-sm text-rose-200">{errorText}</div>}
      {status && <div role="status" className="rounded-xl border border-sky-400/50 bg-sky-900/20 p-3 text-sm text-sky-100">{status}</div>}

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Access code categories">
        {TABS.map((tab) => <button type="button" role="tab"
          aria-selected={activeTab === tab.key} key={tab.key}
          onClick={() => { setActiveTab(tab.key); setFilter("ALL"); }}
          className={"rounded-xl border px-4 py-2.5 text-sm font-bold " +
            (activeTab === tab.key
              ? "border-sky-300 bg-sky-600/30 text-white"
              : "border-slate-600 bg-slate-800/60 text-slate-300 hover:text-white")}>
          {tab.label} ({counts[tab.key]})
        </button>)}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code, name or email..."
          className="jbh-admin-input w-full p-3 text-sm sm:flex-1"/>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="jbh-admin-input w-full p-3 text-sm sm:w-52">
          <option value="ALL">All status</option>
          {activeTab !== "EXPIRED" && <option value="AVAILABLE">Available</option>}
          {activeTab !== "EXPIRED" && <option value="REDEEMED">Redeemed / active</option>}
          {activeTab !== "EXPIRED" && <option value="UNKNOWN">Review dates</option>}
          {activeTab === "EXPIRED" && <option value="EXPIRED">Expired only</option>}
        </select>
        <button type="button" onClick={refresh} disabled={busy || loading}
          className="rounded-lg border border-slate-500 px-4 py-2 text-sm font-bold disabled:opacity-40">Refresh</button>
      </div>

      {loading ? <p role="status" className="p-8 text-center text-sm">Loading access codes...</p>
        : visible.length === 0 ? <p className="jbh-admin-empty p-6">No matching access codes.</p>
        : <div className="space-y-3">
          {visible.map((c) => {
            const state = stateOf(c, now);
            const member = usersById.get(c.used_by);
            return (
              <div key={c.id} className="jbh-admin-feature-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-amber-300">{c.code}</span>
                    <span className="rounded-full border border-slate-500 px-2 py-0.5 text-[10px] font-bold">
                      {fromRow(c)} ({c.duration_days || 30}D)
                    </span>
                  </div>
                  <p className="break-all text-xs text-slate-300">
                    {c.is_used ? "Redeemed by: " + (member?.email || member?.full_name || c.used_by || "Unknown")
                      : "Not redeemed"}
                  </p>
                  <p className="text-xs text-slate-400">Expires: {textDate(expDate(c))}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className={"rounded-lg px-3 py-1.5 text-xs font-bold " +
                    (state === "EXPIRED" ? "bg-rose-900/40 text-rose-200" :
                     state === "AVAILABLE" ? "bg-emerald-900/40 text-emerald-200" :
                     state === "UNKNOWN" ? "bg-amber-900/40 text-amber-200" :
                     "bg-sky-900/40 text-sky-200")}>{state}</span>
                  {state === "AVAILABLE" && <>
                    <button type="button" disabled={busy}
                      onClick={() => { setSelectedCode(c); setModalUser(""); setModalQuery(""); }}
                      className="rounded-lg border border-sky-500 px-3 py-2 text-xs font-bold text-sky-200 disabled:opacity-40">Send</button>
                    <button type="button" disabled={busy} onClick={() => removeUnused(c)}
                      className="rounded-lg border border-rose-500 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-40">Delete unused</button>
                  </>}
                </div>
              </div>
            );
          })}
        </div>}

      {pages > 1 && <div className="flex items-center justify-between gap-3 text-sm">
        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded-lg border border-slate-500 px-4 py-2 disabled:opacity-30">Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}
          className="rounded-lg border border-slate-500 px-4 py-2 disabled:opacity-30">Next</button>
      </div>}

      {selectedCode && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <form onSubmit={sendExisting} className="jbh-admin-dialog w-full max-w-lg space-y-4 rounded-2xl border p-5">
          <h2 className="text-lg font-bold">Send {fromRow(selectedCode)} code</h2>
          <p className="break-all font-mono text-sm text-amber-300">{selectedCode.code}</p>
          <input value={modalQuery} onChange={(e) => setModalQuery(e.target.value)}
            placeholder="Search member email or name..." className="jbh-admin-input w-full p-3 text-sm"/>
          <label className="block text-sm">Recipient
            <select required value={modalUser} onChange={(e) => setModalUser(e.target.value)}
              className="jbh-admin-input mt-2 w-full p-3 text-sm">
              <option value="">Select member ({foundUsers.length} displayed)</option>
              {foundUsers.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSelectedCode(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={busy || !modalUser}
              className="jbh-admin-primary px-4 py-2 text-sm disabled:opacity-40">Send code</button>
          </div>
        </form>
      </div>}
    </section>
  );
}
