import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clapperboard, CreditCard, Headphones, KeyRound, LayoutDashboard, LogOut, MessageSquare, Users } from 'lucide-react';
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
import AdminBillingTab from './AdminBillingTab';
import './adminWorkspace.css';
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
    // <ProtectedRoute adminOnly> verifies the Supabase-authenticated admin role
    // before this component mounts. Do not trust a spoofable localStorage flag.
    fetchData();
    checkAndSendVIPExpirationAlerts();
    setupPresence();
  }, []);

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

  const handleAdminLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      localStorage.removeItem('isAdminAuthenticated');
      navigate('/admin-login', { replace: true });
    } catch (error) {
      console.error('Admin sign out failed:', error?.message || 'UNKNOWN');
      window.alert('Unable to sign out. Please try again.');
    }
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
  const adminUsersCount = profileCounts.admin;
  // Guest accounts stay in the database, but are excluded from the admin overview.
  const registeredProfileCount = users.length - profileCounts.guest;
  const pendingTicketsCount = tickets.filter((t) => t.status === 'pending').length;

  const pieChartData = [
    { name: 'VIP profiles', value: vipUsersCount, color: '#d4b5ff' },
    { name: 'Regular profiles', value: regularUsersCount, color: '#61c5ff' },
    { name: 'Admin profiles', value: adminUsersCount, color: '#65e6c6' },
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
      const registeredCount = dayUsers.filter(u => {
        const type = String(u.account_type || '').toLowerCase();
        return u.email && !u.is_anonymous && type !== 'guest' && type !== 'anonymous';
      }).length;

      result.push({ day: dayLabel, Registered: registeredCount });
    }
    return result;
  };

  const weeklyTrendData = getLast7DaysData();

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Overview' },
    { id: 'users', icon: Users, label: 'Users', count: registeredProfileCount },
    { id: 'billing', icon: CreditCard, label: 'Billing & memberships' },
    { id: 'messages', icon: MessageSquare, label: 'Messages' },
    { id: 'tickets', icon: Headphones, label: 'Support', badge: pendingTicketsCount },
    { id: 'codes', icon: KeyRound, label: 'Access codes' },
    { id: 'upload', icon: Clapperboard, label: 'Media manager' },
  ];

  const overviewCards = [
    { label: 'Registered profiles', value: registeredProfileCount, tone: 'indigo' },
    { label: 'Online now', value: onlineUserIds.size, tone: 'mint' },
    { label: 'VIP profiles', value: vipUsersCount, tone: 'violet' },
    { label: 'Regular profiles', value: regularUsersCount, tone: 'blue' },
    { label: 'Admin profiles', value: adminUsersCount, tone: 'sky' },
    { label: 'Media items', value: totalMediaCount, tone: 'cyan' },
    { label: 'Open tickets', value: pendingTicketsCount, tone: 'rose' },
  ];

  return (
    <div className="jbh-app jbh-admin flex min-h-screen flex-col text-slate-100 lg:flex-row">
      <aside className="jbh-admin-sidebar z-20 flex w-full flex-shrink-0 flex-col gap-4 border-b border-white/10 px-4 py-4 sm:px-6 lg:sticky lg:top-0 lg:h-screen lg:w-[278px] lg:justify-between lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="min-w-0">
          <div className="mb-5 flex items-center gap-3 px-1 lg:mb-8">
            <span className="jbh-admin-brand-mark flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl p-1.5">
              <img src="/jb-logo.png" alt="JB Collections logo" className="h-full w-full object-contain" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[13px] font-black tracking-[.1em] text-white">JB PREMIUM HUB</h2>
              <p className="mt-1 text-xs font-medium text-slate-300/75">Administration</p>
            </div>
          </div>
          <p className="hidden px-3 pb-3 text-[10px] font-bold uppercase tracking-[.19em] text-slate-400/70 lg:block">Workspace</p>
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
                  className={`jbh-admin-nav-item group flex min-h-10 shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors sm:text-sm lg:w-full ${
                    isActive ? 'jbh-admin-nav-active text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon size={18} className={isActive ? 'text-sky-200' : 'text-slate-400'} aria-hidden="true" />
                    <span className="whitespace-nowrap lg:truncate">{item.label}</span>
                  </span>
                  {item.badge > 0 && (
                    <span className="rounded-full bg-rose-400/20 px-2 py-0.5 text-[10px] font-bold text-rose-200">
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
          className="jbh-admin-signout flex min-h-10 w-fit shrink-0 items-center justify-center gap-2 self-end rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-200 transition-colors hover:text-white lg:w-full lg:self-auto"
        >
          <LogOut size={17} aria-hidden="true" /> Sign out
        </button>
      </aside>

      <main className="jbh-admin-main relative min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-9 lg:py-9">
        {activeTab === 'dashboard' && (
          <div className="relative mx-auto max-w-7xl space-y-6 lg:space-y-7">
            <header className="jbh-admin-hero relative overflow-hidden rounded-[26px] px-6 py-7 sm:px-8 sm:py-9">
              <div className="relative z-10">
                <p className="text-[11px] font-bold uppercase tracking-[.2em] text-sky-200">JB Premium Hub</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Dashboard</h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-blue-100/85">
                  Your community and content, all in one place.
                </p>
              </div>
              <div className="jbh-admin-hero-glow pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full" aria-hidden="true" />
            </header>

            <section aria-label="Dashboard metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
              {overviewCards.map((card) => (
                <div key={card.label} className={`jbh-admin-kpi jbh-admin-kpi-${card.tone} relative overflow-hidden rounded-[20px] p-4 sm:p-5`}>
                  <p className="relative z-10 text-[10px] font-bold uppercase leading-snug tracking-[.12em] text-slate-200/80 sm:text-[11px]">{card.label}</p>
                  <p className="relative z-10 mt-3 text-[28px] font-extrabold leading-none tracking-tight text-white sm:text-3xl">
                    {card.value.toLocaleString()}
                  </p>
                </div>
              ))}
            </section>

            <button type="button" onClick={() => setActiveTab('billing')}
              className="jbh-admin-panel flex w-full flex-wrap items-center justify-between gap-4 rounded-2xl p-5 text-left transition-colors hover:border-sky-300/50">
              <div>
                <p className="text-base font-extrabold text-white">Billing & memberships</p>
                <p className="mt-1 text-sm text-slate-300">Verified PayMongo payments, current access, pending orders and activity.</p>
              </div>
              <span className="jbh-admin-primary rounded-xl px-5 py-2.5 text-sm">View billing</span>
            </button>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <section className="jbh-admin-panel flex flex-col justify-between rounded-[24px] p-5 sm:p-6">
                <div>
                  <h2 className="text-base font-extrabold text-white">Account profiles</h2>
                  <p className="mt-1 text-xs text-slate-300/75">Registered account categories</p>
                </div>
                <div className="my-4 flex h-56 items-center justify-center">
                  {registeredProfileCount > 0 && pieChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieChartData} innerRadius={61} outerRadius={87}
                          paddingAngle={3} stroke="rgba(255,255,255,.14)" dataKey="value">
                          {pieChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#1b2b4d', border: '1px solid #58729e', color: '#fff', borderRadius: '12px', fontSize: '12px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-slate-400">No registered profile data yet</p>
                  )}
                </div>
                <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-white/15 pt-4 text-xs">
                  {pieChartData.map((entry) => (
                    <span key={entry.name} className="inline-flex items-center gap-2 text-slate-200">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      {entry.name.replace(" profiles", "")} ({entry.value})
                    </span>
                  ))}
                </div>
              </section>

              <section className="jbh-admin-panel flex flex-col justify-between rounded-[24px] p-5 sm:p-6 xl:col-span-2">
                <div>
                  <h2 className="text-base font-extrabold text-white">New registrations</h2>
                  <p className="mt-1 text-xs text-slate-300/75">Registered accounts · Last 7 days</p>
                </div>
                <div className="my-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyTrendData} margin={{ left: -20, right: 8 }}>
                      <XAxis dataKey="day" stroke="#adbbd4" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#adbbd4" fontSize={12} allowDecimals={false} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#1b2b4d', border: '1px solid #58729e', color: '#fff', borderRadius: '12px', fontSize: '12px' }} />
                      <Bar dataKey="Registered" name="Registrations" fill="#67c6ff" radius={[7, 7, 0, 0]} maxBarSize={52} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/15 pt-4 text-xs text-slate-300/80">
                  <span>Weekly registration activity</span>
                  <span>Registered: <strong className="font-extrabold text-sky-200">{registeredProfileCount.toLocaleString()}</strong></span>
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'events' && <AdminEventControl />}
        {activeTab === 'billing' && <AdminBillingTab />}
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