import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, BarChart3, CalendarDays, Clapperboard, Flag, Headphones, KeyRound, LayoutDashboard, LogOut, MessageSquare, ShieldCheck, Users } from 'lucide-react';
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

  const vipUsersCount = users.filter(
    (u) => u.account_type?.toLowerCase() === 'vip'
  ).length;

  const guestUsersCount = users.filter(
    (u) => u.is_anonymous || u.account_type?.toLowerCase() === 'guest' || u.account_type?.toLowerCase() === 'anonymous' || !u.email
  ).length;

  const standardUsersCount = users.filter(
    (u) => 
      (u.account_type?.toLowerCase() === 'standard' || !u.account_type) && 
      !u.is_anonymous && 
      u.email && 
      u.account_type?.toLowerCase() !== 'vip' && 
      u.account_type?.toLowerCase() !== 'admin'
  ).length;

  const pendingTicketsCount = tickets.filter((t) => t.status === 'pending').length;

  const pieChartData = [
    { name: 'VIP Members', value: vipUsersCount, color: '#10b981' },
    { name: 'Standard Users', value: standardUsersCount, color: '#3b82f6' },
    { name: 'Guest Users', value: guestUsersCount, color: '#f59e0b' },
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
  const registeredOnlyCount = standardUsersCount + vipUsersCount;
  const vipConversionRate = registeredOnlyCount > 0 
    ? ((vipUsersCount / registeredOnlyCount) * 100).toFixed(1) 
    : 0;

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
      <aside className="z-20 flex w-full flex-shrink-0 flex-col gap-5 border-b border-white/10 bg-[#0b1323]/95 px-4 py-4 backdrop-blur-xl sm:px-6 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:justify-between lg:gap-8 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-5 lg:py-7">
        <div className="min-w-0">
          <div className="mb-5 flex items-center gap-3 px-1 lg:mb-8">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-400/25 bg-indigo-400/10 text-indigo-200">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-extrabold tracking-[.08em] text-white">JB PREMIUM HUB</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-400">Admin workspace</p>
            </div>
          </div>
          <p className="hidden px-3 pb-2 text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500 lg:block">Workspace</p>
          <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Admin workspace navigation">
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
                  className={`group relative flex min-h-11 shrink-0 items-center justify-between gap-2.5 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors sm:text-sm lg:w-full ${
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

      <main className="min-w-0 flex-1 px-4 py-7 sm:px-6 lg:px-9 lg:py-10">
        {activeTab === 'dashboard' && (
          <div className="mx-auto max-w-7xl space-y-7">
            <div>
              <h1 className="jbh-title">Workspace overview</h1>
              <p className="jbh-muted mt-2 text-sm">Activity, memberships and content at a glance.</p>
            </div>

            {/* 7 Metric Cards Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
              <div className="jbh-surface-soft p-4">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Total Users</p>
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
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">VIP Members</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">{vipUsersCount}</p>
              </div>

              <div className="jbh-surface-soft p-4">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Standard Users</p>
                <p className="text-2xl font-black text-blue-400 mt-1">{standardUsersCount}</p>
              </div>

              <div className="jbh-surface-soft p-4">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Guest Users</p>
                <p className="text-2xl font-black text-amber-400 mt-1">{guestUsersCount}</p>
              </div>

              <div className="jbh-surface-soft p-4">
                <p className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">Media items</p>
                <p className="text-2xl font-black text-sky-400 mt-1">{totalMediaCount}</p>
              </div>

              <div className="jbh-surface-soft col-span-2 p-4 sm:col-span-1">
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider">Pending Tickets</p>
                <p className="text-2xl font-black text-rose-400 mt-1">{pendingTicketsCount}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="jbh-surface flex flex-col justify-between p-5">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">User Tier Distribution</h3>
                  <p className="text-[11px] text-gray-400">Ratio of VIP vs Standard vs Guest Users</p>
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

                <div className="flex justify-around pt-2 border-t border-gray-800 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="text-gray-300 font-medium">VIP ({vipUsersCount})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    <span className="text-gray-300 font-medium">Standard ({standardUsersCount})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span className="text-gray-300 font-medium">Guest ({guestUsersCount})</span>
                  </div>
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
                  <span>VIP Upgrade Conversion Rate: <strong className="text-emerald-400 font-bold">{vipConversionRate}%</strong></span>
                  <span>Total Registered Accounts: <strong className="text-sky-400 font-bold">{users.length} Users</strong></span>
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