import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, CalendarDays, Clapperboard, Flag, Headphones, KeyRound, LayoutDashboard, LogOut, MessageSquare, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';

import SupportTicketsTab from './SupportTicketsTab';
import AccessCodesTab from './AccessCodesTab';
import AdminUsersTab from './AdminUsersTab';
import AdminMessagesTab from './AdminMessagesTab'; 
import AdminMediaTab from './AdminMediaTab';
import ChatReports from './ChatReports';
import ChatAnalytics from './ChatAnalytics';
import AdminEventControl from '../../components/admin/AdminEventControl';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [users, setUsers] = useState([]);
  const [totalMediaCount, setTotalMediaCount] = useState(0);
  const [tickets, setTickets] = useState([]);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());

  const navigate = useNavigate();

  useEffect(() => {
    const isAdmin = localStorage.getItem('isAdminAuthenticated');
    if (!isAdmin) {
      navigate('/admin-login');
      return;
    }
    
    fetchData();
    checkAndSendVIPExpirationAlerts();
    setupPresence();
  }, [navigate]);

  // Realtime Presence for Live Online Users
  const setupPresence = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const existingChannel = supabase
      .getChannels()
      .find((c) => c.topic === "realtime:online-users");
    if (existingChannel) {
      await supabase.removeChannel(existingChannel);
    }

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
  };

  const fetchData = async () => {
    // Fetch ALL users by chunking (bypasses default 1000 row limit)
    try {
      let allUsers = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: chunk, error } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
          console.error("Error fetching users chunk:", error.message);
          break;
        }

        if (chunk && chunk.length > 0) {
          allUsers = [...allUsers, ...chunk];
          if (chunk.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      setUsers(allUsers);
    } catch (err) {
      console.error("Error in chunked users fetch:", err);
    }

    // Exact count for Vault Videos
    const { count: mediaCount, error: mediaError } = await supabase
      .from('media')
      .select('id', { count: 'exact', head: true });

    if (mediaError) {
      console.error("Error fetching media count:", mediaError.message);
    } else if (mediaCount !== null) {
      setTotalMediaCount(mediaCount);
    }

    // Fetch Support Tickets
    const { data: ticketsData, error: ticketsError } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (ticketsError) {
      console.error("Error fetching tickets:", ticketsError.message);
    } else if (ticketsData) {
      setTickets(ticketsData || []);
    }
  };

  const checkAndSendVIPExpirationAlerts = async () => {
    try {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

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

        if (daysRemaining >= 1 && daysRemaining <= 5) {
          const { data: existingAlerts } = await supabase
            .from('admin_messages')
            .select('id, created_at')
            .eq('user_id', code.used_by)
            .gte('created_at', `${todayStr}T00:00:00.000Z`)
            .like('title', '%VIP Access Expiring%');

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

  // Profile categories are not the same as paid billing entitlements.
  // Keep them separate, mutually exclusive, and exhaustive for this dashboard.
  const profileCounts = users.reduce((counts, user) => {
    const type = String(user.account_type || "").toLowerCase();
    const role = String(user.role || "").toLowerCase();
    if (user.is_anonymous || !user.email || type === 'guest' || type === 'anonymous') counts.guest += 1;
    else if (type === 'admin' || role === 'admin') counts.admin += 1;
    else if (type === 'vip') counts.vip += 1;
    else if (type === 'standard' || !type) counts.regular += 1;
    else counts.other += 1;
    return counts;
  }, { vip: 0, regular: 0, guest: 0, admin: 0, other: 0 });

  const vipUsersCount = profileCounts.vip;
  const regularUsersCount = profileCounts.regular;
  const guestUsersCount = profileCounts.guest;
  const adminUsersCount = profileCounts.admin;
  const pendingTicketsCount = tickets.filter((t) => t.status === 'pending').length;

  const pieChartData = [
    { name: 'VIP profiles', value: vipUsersCount, color: '#a78bfa' },
    { name: 'Regular profiles', value: regularUsersCount, color: '#6366f1' },
    { name: 'Guest profiles', value: guestUsersCount, color: '#f59e0b' },
    { name: 'Admin profiles', value: adminUsersCount, color: '#38bdf8' },
    { name: 'Other profiles', value: profileCounts.other, color: '#94a3b8' },
  ].filter(item => item.value > 0);

  const getLast7DaysData = () => {
    const result = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(now.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });

      const dayUsers = users.filter(u => u.created_at && u.created_at.startsWith(dateString));
      const registeredCount = dayUsers.filter(u => u.email && !u.is_anonymous).length;
      const guestCount = dayUsers.filter(u => u.is_anonymous || !u.email).length;

      result.push({
        day: dayLabel,
        Registered: registeredCount,
        Guests: guestCount,
      });
    }
    return result;
  };

  const weeklyTrendData = getLast7DaysData();

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'events', icon: CalendarDays, label: 'Events' },
    { id: 'tickets', icon: Headphones, label: 'Support', badge: pendingTicketsCount },
    { id: 'users', icon: Users, label: 'Users', count: users.length },
    { id: 'messages', icon: MessageSquare, label: 'Messages' },
    { id: 'chat-reports', icon: Flag, label: 'Chat reports' },
    { id: 'chat-analytics', icon: BarChart3, label: 'Chat analytics' },
    { id: 'codes', icon: KeyRound, label: 'Access codes' },
    { id: 'upload', icon: Clapperboard, label: 'Media manager' },
  ];

  return (
    <div className="jbh-app jbh-admin flex min-h-screen flex-col text-slate-100 lg:flex-row">
      <aside className="jbh-admin-sidebar z-20 flex w-full flex-shrink-0 flex-col gap-3 border-b border-white/10 bg-[#0b1323]/95 px-4 py-3 backdrop-blur-xl sm:px-6 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:justify-between lg:gap-4 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-5 lg:py-5">
        <div className="min-w-0">
          <div className="mb-4 flex items-center gap-3 px-1 lg:mb-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-400/25 bg-indigo-400/10 text-indigo-200">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-extrabold tracking-[.08em] text-white">JB PREMIUM HUB</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-400">Admin workspace</p>
            </div>
          </div>
          <p className="hidden px-3 pb-2 text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500 lg:block">Workspace</p>
          <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Admin workspace navigation">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  title={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group relative flex min-h-10 shrink-0 items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors sm:text-sm lg:w-full ${
                    isActive
                      ? 'border-indigo-400/25 bg-indigo-400/15 text-indigo-100'
                      : 'border-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon size={18} className={isActive ? 'text-indigo-300' : 'text-slate-400'} aria-hidden="true" />
                    <span className="whitespace-nowrap lg:truncate">{item.label}</span>
                  </span>
                  {item.badge > 0 && (
                    <span className="rounded-full border border-indigo-400/25 bg-indigo-400/15 px-2 py-0.5 text-[10px] font-bold text-indigo-200">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
        <button
          type="button"
          onClick={handleAdminLogout}
          title="Sign out of admin"
          className="jbh-btn-quiet hidden w-full items-center justify-center gap-2 text-sm font-semibold lg:inline-flex"
        >
          <LogOut size={17} aria-hidden="true" />
          Sign out
        </button>
        <button type="button" onClick={handleAdminLogout}
          className="jbh-btn-quiet inline-flex w-fit items-center gap-2 self-end text-xs lg:hidden">
          <LogOut size={16} aria-hidden="true" /> Sign out
        </button>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
        {activeTab === 'dashboard' && (
          <div className="mx-auto max-w-7xl space-y-7">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Overview</h1>
              <p className="jbh-muted mt-2 text-sm">Manage your members, content, and community.</p>
            </div>

            {/* Account-profile overview (not a billing/subscription report) */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-4">
              <div className="jbh-surface-soft p-4">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Total profiles</p>
                <p className="text-2xl font-black text-purple-400 mt-1">{users.length}</p>
              </div>

              <div className="jbh-surface-soft p-4">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Online Now</p>
                <p className="text-2xl font-black text-emerald-400 mt-1 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {onlineUserIds.size}
                </p>
              </div>

              <div className="jbh-surface-soft p-4">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">VIP profiles</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">{vipUsersCount}</p>
              </div>

              <div className="jbh-surface-soft p-4">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Regular profiles</p>
                <p className="text-2xl font-black text-blue-400 mt-1">{regularUsersCount}</p>
              </div>

              <div className="jbh-surface-soft p-4">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Guest profiles</p>
                <p className="text-2xl font-black text-amber-400 mt-1">{guestUsersCount}</p>
              </div>
              <div className="jbh-surface-soft p-4">
                <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Admin profiles</p>
                <p className="mt-1 text-2xl font-black text-sky-300">{adminUsersCount}</p>
              </div>

              <div className="jbh-surface-soft p-4">
                <p className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">Media items</p>
                <p className="text-2xl font-black text-sky-400 mt-1">{totalMediaCount}</p>
              </div>

              <div className="jbh-surface-soft p-4">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Pending Tickets</p>
                <p className="text-2xl font-black text-rose-400 mt-1">{pendingTicketsCount}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="jbh-surface flex flex-col justify-between p-5">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Account profile mix</h3>
                  <p className="text-[11px] text-gray-400">Profile labels, not verified paid plans</p>
                </div>

                <div className="h-52 my-2 flex items-center justify-center">
                  {users.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '12px', fontSize: '12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-xs text-gray-500">No user data available</p>
                  )}
                </div>

                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-white/10 pt-4 text-xs">
                  {pieChartData.map((entry) => (
                    <span key={entry.name} className="inline-flex items-center gap-2 text-slate-300">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                      {entry.name.replace(" profiles", "")} ({entry.value})
                    </span>
                  ))}
                </div>
              </div>

              <div className="jbh-surface flex flex-col justify-between p-5 lg:col-span-2">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Weekly Registration & Guest Activity</h3>
                  <p className="text-[11px] text-gray-400">New user signups and guest logins over the last 7 days</p>
                </div>

                <div className="h-56 my-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyTrendData}>
                      <XAxis dataKey="day" stroke="#6b7280" fontSize={12} tickLine={false} />
                      <YAxis stroke="#6b7280" fontSize={12} allowDecimals={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '12px', fontSize: '12px' }}
                      />
                      <Bar dataKey="Registered" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Guests" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-800 text-xs text-gray-400">
                  <span>Registration trend — last 7 days</span>
                  <span>Account profiles: <strong className="font-bold text-sky-300">{users.length}</strong></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'events' && <AdminEventControl />}
        {activeTab === 'tickets' && <SupportTicketsTab supabase={supabase} />}
        {activeTab === 'users' && <AdminUsersTab users={users} fetchData={fetchData} />}
        {activeTab === 'messages' && <AdminMessagesTab users={users} />}
        {activeTab === 'chat-reports' && <ChatReports />}
        {activeTab === 'chat-analytics' && <ChatAnalytics />}
        {activeTab === 'codes' && <AccessCodesTab />}
        {activeTab === 'upload' && <AdminMediaTab />}
      </main>
    </div>
  );
}