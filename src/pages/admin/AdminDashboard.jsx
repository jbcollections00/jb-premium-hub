import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import AdminEventControl from '../../components/admin/AdminEventControl';

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
    checkAndSendVIPExpirationAlerts();
  }, [navigate]);

  const fetchData = async () => {
    const { data: usersData, error: usersError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error("Error fetching users:", usersError.message);
    } else if (usersData) {
      setUsers(usersData);
    }

    const { count: mediaCount, error: mediaError } = await supabase
      .from('media')
      .select('id', { count: 'exact', head: true });

    if (mediaError) {
      console.error("Error fetching media count:", mediaError.message);
    } else if (mediaCount !== null) {
      setTotalMediaCount(mediaCount);
    }

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
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'events', icon: '🏆', label: 'Contest & Events' },
    { id: 'tickets', icon: '🎧', label: 'Support Tickets', badge: pendingTicketsCount },
    { id: 'users', icon: '👥', label: 'Users', count: users.length },
    { id: 'messages', icon: '💬', label: 'Send Messages' },
    { id: 'codes', icon: '🔑', label: 'Access Codes' },
    { id: 'upload', icon: '📤', label: 'Bulk Upload & Media' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <aside className="w-16 md:w-64 bg-gray-900 border-r border-gray-800 flex flex-col justify-between p-2 md:p-4 shrink-0 transition-all duration-300">
        <div>
          <div className="flex items-center justify-center md:justify-start gap-2 mb-8 px-1 md:px-2">
            <span className="text-2xl shrink-0">🛡️</span>
            <div className="hidden md:block overflow-hidden">
              <h2 className="font-bold text-base text-red-500 leading-tight truncate">Vault Control</h2>
              <p className="text-[10px] text-gray-500 truncate">Admin Portal v2.0</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={`${item.label}${item.count !== undefined ? ` (${item.count})` : ''}`}
                  className={`p-3 rounded-xl font-medium text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center md:justify-between relative ${
                    isActive
                      ? 'bg-red-600 text-white font-bold shadow-lg shadow-red-600/20'
                      : 'text-gray-400 hover:bg-gray-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <span className="text-lg shrink-0">{item.icon}</span>
                    <span className="hidden md:inline truncate">
                      {item.label} {item.count !== undefined ? `(${item.count})` : ''}
                    </span>
                  </div>

                  {item.badge > 0 && (
                    <>
                      <span className="hidden md:inline bg-amber-500 text-black font-black text-[10px] px-2 py-0.5 rounded-full ml-1 shrink-0">
                        {item.badge}
                      </span>
                      <span className="md:hidden absolute top-1 right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-gray-900"></span>
                    </>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <button
          onClick={handleAdminLogout}
          title="Admin Logout"
          className="bg-gray-800 hover:bg-red-600/20 hover:text-red-400 p-3 rounded-xl text-xs font-bold text-gray-400 transition-all cursor-pointer border border-gray-700/50 flex items-center justify-center gap-2"
        >
          <span className="text-base shrink-0">🚪</span>
          <span className="hidden md:inline truncate">Admin Logout</span>
        </button>
      </aside>

      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-6 max-w-6xl">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">System Dashboard & Analytics</h1>
              <p className="text-xs text-gray-400 mt-0.5">Real-time overview of users, growth metrics, and vault stats.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
                <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">Guest Users</p>
                <p className="text-2xl font-black text-amber-400 mt-1">{guestUsersCount}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
                <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">Vault Videos</p>
                <p className="text-2xl font-black text-sky-400 mt-1">{totalMediaCount}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
                <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider">Pending Tickets</p>
                <p className="text-2xl font-black text-rose-400 mt-1">{pendingTicketsCount}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl flex flex-col justify-between">
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

              <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl lg:col-span-2 flex flex-col justify-between">
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
                  <span>Registered Accounts: <strong className="text-sky-400 font-bold">{users.length} Users</strong></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'events' && <AdminEventControl />}
        {activeTab === 'tickets' && <SupportTicketsTab supabase={supabase} />}
        {activeTab === 'users' && <AdminUsersTab users={users} fetchData={fetchData} />}
        {activeTab === 'messages' && <AdminMessagesTab users={users} />}
        {activeTab === 'codes' && <AccessCodesTab />}
        {activeTab === 'upload' && <AdminMediaTab />}
      </main>
    </div>
  );
}