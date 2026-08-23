import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';

export default function AccessCodesTab() {
  const [codes, setCodes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [codeType, setCodeType] = useState('VIP');
  const [durationDays, setDurationDays] = useState(30);
  const [customCode, setCustomCode] = useState('');
  const [directSendUser, setDirectSendUser] = useState(''); 
  const [generating, setGenerating] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Modal State for Sending Existing Code
  const [selectedCodeForSend, setSelectedCodeForSend] = useState(null);
  const [targetUserId, setTargetUserId] = useState('');
  const [modalUserSearch, setModalUserSearch] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: codesData } = await supabase
      .from('access_codes')
      .select('*')
      .order('created_at', { ascending: false });
    if (codesData) setCodes(codesData);

    const { data: usersData } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (usersData) setUsers(usersData);

    setLoading(false);
  };

  const generateRandomCode = (type) => {
    const prefix = type === 'VIP' ? 'VIP-' : 'STD-';
    const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${randomChars}`;
  };

  // 🚀 GENERATE CODE WITH DIRECT SEND
  const handleGenerateCode = async (e) => {
    e.preventDefault();
    setGenerating(true);

    const finalCode = customCode.trim()
      ? customCode.trim().toUpperCase()
      : generateRandomCode(codeType);

    const { data: newCodeData, error: codeErr } = await supabase
      .from('access_codes')
      .insert([
        {
          code: finalCode,
          type: codeType,
          duration_days: Number(durationDays),
          is_used: false
        }
      ])
      .select()
      .single();

    if (codeErr) {
      alert('Error generating code: ' + codeErr.message);
      setGenerating(false);
      return;
    }

    if (directSendUser && newCodeData) {
      const selectedUserObj = users.find((u) => u.id === directSendUser);
      const userEmail = selectedUserObj?.email || selectedUserObj?.full_name || 'User';

      const sendErr = await sendMessageToUser(
        directSendUser,
        codeType,
        finalCode,
        durationDays
      );

      if (sendErr) {
        alert(`Code generated (${finalCode}), but failed to send message: ${sendErr.message}`);
      } else {
        alert(`✅ Code generated (${finalCode}) and sent directly to ${userEmail}!`);
      }
    } else {
      alert(`✅ Access Code (${finalCode}) successfully generated!`);
    }

    setCustomCode('');
    setDirectSendUser('');
    setGenerating(false);
    fetchData();
  };

  // 📩 SEND CODE TO USER FUNCTION
  const sendMessageToUser = async (userId, type, code, days) => {
    const title = `🔑 Your New ${type} Access Code Inside`;
    const message = `Hello! Here is your new ${type} Access Code (${days} Days duration):\n\nCode: ${code}\n\nPlease copy this code and redeem it in your Profile settings to activate or extend your membership. Enjoy!`;

    const { error } = await supabase.from('admin_messages').insert([
      {
        user_id: userId,
        send_to_all: false,
        title: title,
        message: message,
        is_read: false
      }
    ]);

    return error;
  };

  // Send Existing Unused Code via Modal
  const handleSendExistingCode = async (e) => {
    e.preventDefault();
    if (!selectedCodeForSend || !targetUserId) {
      alert('Please select a target user.');
      return;
    }

    setSendingMessage(true);
    const err = await sendMessageToUser(
      targetUserId,
      selectedCodeForSend.type || 'VIP',
      selectedCodeForSend.code,
      selectedCodeForSend.duration_days || 30
    );

    if (err) {
      alert('Failed to send code: ' + err.message);
    } else {
      const uObj = users.find((u) => u.id === targetUserId);
      alert(`✅ Code ${selectedCodeForSend.code} successfully sent to ${uObj?.email || uObj?.full_name || 'User'}!`);
      setSelectedCodeForSend(null);
      setTargetUserId('');
      setModalUserSearch('');
    }
    setSendingMessage(false);
  };

  const handleDeleteCode = async (codeId) => {
    if (!confirm('Are you sure you want to delete this access code?')) return;
    const { error } = await supabase.from('access_codes').delete().eq('id', codeId);
    if (error) {
      alert('Delete failed: ' + error.message);
    } else {
      fetchData();
    }
  };

  // ⏳ HELPER: Determine absolute expiration date
  const getExpDate = (c) => {
    if (c.expires_at) {
      const d = new Date(c.expires_at);
      if (!isNaN(d.getTime())) return d;
    }
    if (c.used_at) {
      const d = new Date(c.used_at);
      if (!isNaN(d.getTime())) {
        const duration = c.duration_days || 30;
        return new Date(d.getTime() + duration * 24 * 60 * 60 * 1000);
      }
    }
    return null;
  };

  // ⏱️ HELPER: Calculate dynamic remaining time badge
  const getRemainingTime = (c) => {
    const expDate = getExpDate(c);
    if (!expDate) return 'ACTIVE';

    const diff = expDate - new Date();
    if (diff <= 0) return 'EXPIRED';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / 1000 / 60) % 60);

    if (days > 0) return `${days}D ${hours}H LEFT`;
    if (hours > 0) return `${hours}H ${mins}M LEFT`;
    return `${mins}M LEFT`;
  };

  // Filter Users inside Modal based on Search Input
  const filteredModalUsers = users.filter((u) => {
    const query = modalUserSearch.toLowerCase();
    const email = u.email ? u.email.toLowerCase() : '';
    const name = u.full_name ? u.full_name.toLowerCase() : '';
    const id = u.id ? u.id.toLowerCase() : '';
    return email.includes(query) || name.includes(query) || id.includes(query);
  });

  // Safe status calculation
  const totalCodesCount = codes.length;
  const availableCodesCount = codes.filter((c) => !c.is_used).length;

  const activeSubsCount = codes.filter((c) => {
    if (!c.is_used) return false;
    const expDate = getExpDate(c);
    return !expDate || expDate > new Date();
  }).length;

  const expiredCodesCount = codes.filter((c) => {
    if (!c.is_used) return false;
    const expDate = getExpDate(c);
    return expDate && expDate <= new Date();
  }).length;

  const filteredCodes = codes.filter((c) => {
    const expDate = getExpDate(c);
    const isExpired = c.is_used && expDate && expDate <= new Date();
    const isActive = c.is_used && (!expDate || expDate > new Date());

    const matchesSearch =
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.used_by && c.used_by.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = filterType === 'ALL' || c.type?.toUpperCase() === filterType;

    let matchesStatus = true;
    if (filterStatus === 'AVAILABLE') matchesStatus = !c.is_used;
    if (filterStatus === 'ACTIVE') matchesStatus = isActive;
    if (filterStatus === 'EXPIRED') matchesStatus = isExpired;

    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Access Code Management</h1>
        <p className="text-xs text-gray-400 mt-1">
          Generate, send directly to users, and track live subscription expiration countdowns.
        </p>
      </div>

      {/* 📊 STATS OVERVIEW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl">
          <p className="text-gray-400 text-[10px] font-bold uppercase">Total Codes</p>
          <p className="text-2xl font-black text-white mt-1">{totalCodesCount}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl">
          <p className="text-gray-400 text-[10px] font-bold uppercase">Available (Unused)</p>
          <p className="text-2xl font-black text-emerald-400 mt-1">{availableCodesCount}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl">
          <p className="text-gray-400 text-[10px] font-bold uppercase">Active Subs</p>
          <p className="text-2xl font-black text-sky-400 mt-1">{activeSubsCount}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl">
          <p className="text-gray-400 text-[10px] font-bold uppercase">Expired</p>
          <p className="text-2xl font-black text-rose-400 mt-1">{expiredCodesCount}</p>
        </div>
      </div>

      {/* 🔑 GENERATE ACCESS CODE FORM */}
      <form onSubmit={handleGenerateCode} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl space-y-4">
        <h2 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Generate & Direct Send Access Code</h2>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-2">
            <select
              value={codeType}
              onChange={(e) => setCodeType(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="VIP">👑 VIP Code</option>
              <option value="STANDARD">👤 Standard Code</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <select
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value={7}>📅 7 Days</option>
              <option value={30}>📅 30 Days (1 Month)</option>
              <option value={90}>📅 90 Days (3 Months)</option>
              <option value={365}>📅 365 Days (1 Year)</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <input
              type="text"
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              placeholder="CUSTOM CODE (BLANK FOR AUTO)"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-xs uppercase font-mono focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              value={directSendUser}
              onChange={(e) => setDirectSendUser(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-amber-300 text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="">📩 Send Direct to User? (Optional)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email || u.full_name || 'User'} ({u.account_type || 'STD'})
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={generating}
              className="w-full bg-red-600 hover:bg-red-500 disabled:bg-gray-800 text-white font-bold py-2.5 rounded-xl transition-all text-xs cursor-pointer shadow-lg shadow-red-600/20 shrink-0"
            >
              {generating ? 'Generating...' : 'Generate 🚀'}
            </button>
          </div>
        </div>
      </form>

      {/* 🔍 SEARCH & FILTERS */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search code or user ID..."
          className="w-full sm:w-80 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-red-500"
        />

        <div className="flex gap-2 w-full sm:w-auto">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-gray-300 text-xs font-medium focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Types</option>
            <option value="VIP">VIP Only</option>
            <option value="STANDARD">Standard Only</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-gray-300 text-xs font-medium focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Status</option>
            <option value="AVAILABLE">Available (Unused)</option>
            <option value="ACTIVE">Active Subs</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
      </div>

      {/* 📋 CODES LIST */}
      {loading ? (
        <div className="p-12 text-center text-gray-500 text-xs">Loading access codes...</div>
      ) : filteredCodes.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 p-8 text-center rounded-2xl text-gray-500 text-xs">
          No access codes found matching your query.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCodes.map((c) => {
            const expDate = getExpDate(c);
            const isExpired = c.is_used && expDate && expDate <= new Date();
            const isActive = c.is_used && (!expDate || expDate > new Date());
            const remainingText = c.is_used ? getRemainingTime(c) : 'NOT USED YET';

            const usedByUser = users.find((u) => u.id === c.used_by);

            return (
              <div
                key={c.id}
                className="bg-gray-900 border border-gray-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-gray-700"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sm text-amber-400 tracking-wider">{c.code}</span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                        c.type === 'VIP'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      }`}
                    >
                      {c.type || 'VIP'} ({c.duration_days || 30}D)
                    </span>
                  </div>

                  <p className="text-[11px] text-gray-400">
                    {c.is_used ? (
                      <span>
                        Used by:{' '}
                        <strong className="text-gray-200">
                          {usedByUser?.email || usedByUser?.full_name || c.used_by}
                        </strong>
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-bold">🟢 Available for redemption</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  {!c.is_used && (
                    <button
                      onClick={() => {
                        setSelectedCodeForSend(c);
                        setTargetUserId('');
                        setModalUserSearch('');
                      }}
                      className="bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-500/30 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                    >
                      📩 Send to User
                    </button>
                  )}

                  {isActive && (
                    <span className="bg-sky-950 text-sky-400 border border-sky-800 font-mono text-[11px] font-bold px-3 py-1.5 rounded-xl">
                      ⏳ {remainingText}
                    </span>
                  )}

                  {isExpired && (
                    <span className="bg-rose-950 text-rose-400 border border-rose-900/50 text-[11px] font-bold px-3 py-1.5 rounded-xl">
                      🔴 EXPIRED
                    </span>
                  )}

                  <button
                    onClick={() => handleDeleteCode(c.id)}
                    className="p-2 bg-gray-800 hover:bg-rose-900/40 text-gray-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer border border-gray-700/50"
                    title="Delete Code"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 📩 SEND CODE MODAL WITH LIVE USER SEARCH */}
      {selectedCodeForSend && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>📩</span> Send Access Code
            </h3>
            <p className="text-xs text-gray-400">
              Send code <strong className="text-amber-400 font-mono">{selectedCodeForSend.code}</strong> directly to user's message.
            </p>

            <form onSubmit={handleSendExistingCode} className="space-y-4">
              {/* 🔍 LIVE USER SEARCH FILTER */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                  1. Search User:
                </label>
                <input
                  type="text"
                  value={modalUserSearch}
                  onChange={(e) => setModalUserSearch(e.target.value)}
                  placeholder="Type email, name, or user ID to search..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-red-500"
                />
              </div>

              {/* 👥 SELECT RECIPIENT DROPDOWN */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                  2. Select Recipient ({filteredModalUsers.length} found):
                </label>
                <select
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  required
                  size={5}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2 text-white text-xs font-medium focus:outline-none focus:border-red-500 cursor-pointer overflow-y-auto"
                >
                  {filteredModalUsers.length === 0 ? (
                    <option disabled className="text-gray-500 p-2">No user matches your search...</option>
                  ) : (
                    filteredModalUsers.map((u) => (
                      <option key={u.id} value={u.id} className="p-1.5 hover:bg-red-600/30 rounded cursor-pointer">
                        {u.email || u.full_name || 'Unnamed'} ({u.account_type || 'STANDARD'})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedCodeForSend(null)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingMessage || !targetUserId}
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-800 text-white text-xs font-bold rounded-xl cursor-pointer shadow-lg shadow-red-600/20"
                >
                  {sendingMessage ? 'Sending...' : 'Send Message 📩'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}