import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

// Child Components / Tabs
import SupportTicketsTab from './SupportTicketsTab';
import AccessCodesTab from './AccessCodesTab';
import AdminUsersTab from './AdminUsersTab';
import AdminMessagesTab from './AdminMessagesTab'; 
import AdminMediaTab from './AdminMediaTab';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [users, setUsers] = useState([]);
  const [totalMediaCount, setTotalMediaCount] = useState(0);
  const [tickets, setTickets] = useState([]);

  const navigate = useNavigate();

  useEffect(() => {
    const isAdmin = localStorage.getItem('isAdminAuthenticated');
    if (!isAdmin) {
      navigate('/admin-login');
      return;
    }
    
    fetchData();
    checkAndSendVIPExpirationAlerts(); // 🤖 Auto-run 5-Day VIP Expiration Scanner
  }, [navigate]);

  const fetchData = async () => {
    // 1. Fetch Users
    const { data: usersData } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (usersData) setUsers(usersData);

    // 2. Fetch Vault Media Count
    const { count: mediaCount } = await supabase
      .from('media')
      .select('id', { count: 'exact', head: true });
    if (mediaCount !== null) setTotalMediaCount(mediaCount);

    // 3. Fetch Support Tickets
    const { data: ticketsData } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (ticketsData) setTickets(ticketsData || []);
  };

  // 🤖 AUTOMATED 5-DAY DAILY VIP EXPIRATION SCANNER
  const checkAndSendVIPExpirationAlerts = async () => {
    try {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD

      // Fetch all used VIP access codes
      const { data: activeVipCodes } = await supabase
        .from('access_codes')
        .select('*')
        .eq('is_used', true)
        .eq('type', 'VIP');

      if (!activeVipCodes) return;

      for (const code of activeVipCodes) {
        if (!code.used_by || !code.expires_at) continue;

        const expDate = new Date(code.expires_at);
        const diffMs = expDate - now;
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        // ⏳ Trigger warning if within 1 to 5 days remaining
        if (daysRemaining >= 1 && daysRemaining <= 5) {
          // Check if an alert message was ALREADY sent to this user TODAY
          const { data: existingAlerts } = await supabase
            .from('admin_messages')
            .select('id, created_at')
            .eq('user_id', code.used_by)
            .gte('created_at', `${todayStr}T00:00:00.000Z`)
            .like('title', '%VIP Access Expiring%');

          // If no alert sent today, send the automated message in English
          if (!existingAlerts || existingAlerts.length === 0) {
            const daysText = daysRemaining === 1 ? '1 Day' : `${daysRemaining} Days`;
            
            await supabase.from('admin_messages').insert([
              {
                user_id: code.used_by,
                send_to_all: false,
                title: `⚠️ VIP Access Expiring in ${daysText}!`,
                message: `Dear VIP Member, your VIP Access Code will expire in ${daysText} on ${expDate.toLocaleDateString('en-US')}. Please obtain a new monthly VIP access code to maintain uninterrupted access to the Vault.`,
                is_read: false
              }
            ]);
          }
        }
      }
    } catch (error) {
      console.error("Error checking VIP expiration alerts:", error);
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('isAdminAuthenticated');
    navigate('/admin-login');
  };

  const vipUsersCount = users.filter((u) => u.account_type?.toLowerCase() === 'vip' || u.is_activated).length;
  const standardUsersCount = users.length - vipUsersCount;
  const pendingTicketsCount = tickets.filter((t) => t.status === 'pending').length;

  const navItems = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'tickets', label: '🎧 Support Tickets', badge: pendingTicketsCount },
    { id: 'users', label: `👥 Users (${users.length})` },
    { id: 'messages', label: '💬 Send Messages' },
    { id: 'codes', label: '🔑 Access Codes' },
    { id: 'upload', label: '📤 Bulk Upload & Media' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* 🛡️ SIDEBAR */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col justify-between p-4 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-8 px-2">
            <span className="text-2xl">🛡️</span>
            <div>
              <h2 className="font-bold text-base text-red-500 leading-tight">Vault Control</h2>
              <p className="text-[10px] text-gray-500">Admin Portal v2.0</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`p-3 rounded-xl text-left font-medium text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-between ${
                    isActive
                      ? 'bg-red-600 text-white font-bold shadow-lg shadow-red-600/20'
                      : 'text-gray-400 hover:bg-gray-800/80 hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge > 0 && (
                    <span className="bg-amber-500 text-black font-black text-[10px] px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <button
          onClick={handleAdminLogout}
          className="bg-gray-800 hover:bg-red-600/20 hover:text-red-400 p-3 rounded-xl text-xs font-bold text-gray-400 transition-all cursor-pointer border border-gray-700/50 flex items-center justify-center gap-2"
        >
          <span>🚪</span> Admin Logout
        </button>
      </aside>

      {/* 💻 MAIN CONTENT AREA */}
      <main className="flex-1 p-6 sm:p-8 overflow-y-auto">
        {/* DASHBOARD OVERVIEW */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 max-w-6xl">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">System Dashboard</h1>
              <p className="text-xs text-gray-400 mt-0.5">Real-time overview of users, tickets, and media stats.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
                <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">Total Users</p>
                <p className="text-2xl font-black text-purple-400 mt-1">{users.length}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
                <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">VIP Members</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">{vipUsersCount}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
                <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">Standard Users</p>
                <p className="text-2xl font-black text-blue-400 mt-1">{standardUsersCount}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
                <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">Vault Videos</p>
                <p className="text-2xl font-black text-sky-400 mt-1">{totalMediaCount}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
                <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">Pending Tickets</p>
                <p className="text-2xl font-black text-amber-400 mt-1">{pendingTicketsCount}</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB COMPONENTS */}
        {activeTab === 'tickets' && <SupportTicketsTab />}
        {activeTab === 'users' && <AdminUsersTab users={users} fetchData={fetchData} />}
        {activeTab === 'messages' && <AdminMessagesTab users={users} />}
        {activeTab === 'codes' && <AccessCodesTab />}
        {activeTab === 'upload' && <AdminMediaTab />}
      </main>
    </div>
  );
}