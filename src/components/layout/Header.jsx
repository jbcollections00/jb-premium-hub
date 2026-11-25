import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { CreditCard, Home, LogOut, MessageCircle, UserRound } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

// STEP 307B: Header preserves profile, admin-announcement unread count,
// Supabase Realtime messages, and logout. The obsolete For You navigation is
// removed and replaced with the subscription/plans entry point.
export default function Header() {
  const navigate = useNavigate();
  const [messageCount, setMessageCount] = useState(0);
  const [userInitial, setUserInitial] = useState('U');
  const [loggingOut, setLoggingOut] = useState(false);

  const fetchMessageCount = useCallback(async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        setMessageCount(0);
        setUserInitial('U');
        return;
      }

      const userId = session.user.id;
      const email = session.user.email || '';
      setUserInitial(email ? email.charAt(0).toUpperCase() : 'U');

      const { data: visibleMessages, error: messagesError } = await supabase
        .from('admin_messages')
        .select('id')
        .or(`user_id.eq.${userId},and(send_to_all.eq.true,user_id.is.null)`);
      if (messagesError) throw messagesError;

      const messageIds = (visibleMessages || []).map((message) => message.id);
      if (messageIds.length === 0) {
        setMessageCount(0);
        return;
      }

      const { data: statuses, error: statusError } = await supabase
        .from('user_message_status')
        .select('message_id, is_read, is_deleted')
        .eq('user_id', userId)
        .in('message_id', messageIds);
      if (statusError) throw statusError;

      const statusMap = new Map((statuses || []).map((status) => [status.message_id, status]));
      const unreadCount = messageIds.reduce((count, messageId) => {
        const status = statusMap.get(messageId);
        return count + (!status?.is_deleted && !status?.is_read ? 1 : 0);
      }, 0);
      setMessageCount(unreadCount);
    } catch (error) {
      console.error('Header unread count unavailable:', error);
      setMessageCount(0);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let userStatusChannel = null;
    const adminMessagesChannel = supabase
      .channel('header_admin_messages')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'admin_messages',
      }, () => { if (active) void fetchMessageCount(); })
      .subscribe();

    const attachUserChannel = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active || !session?.user?.id) return;
      userStatusChannel = supabase
        .channel(`header_user_message_status_${session.user.id}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'user_message_status',
          filter: `user_id=eq.${session.user.id}`,
        }, () => { if (active) void fetchMessageCount(); })
        .subscribe();
    };

    const onMessagesUpdated = () => { if (active) void fetchMessageCount(); };
    window.addEventListener('messagesUpdated', onMessagesUpdated);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      if (!active) return;
      // Run the asynchronous query after the auth callback completes.
      setTimeout(() => { if (active) void fetchMessageCount(); }, 0);
    });

    void fetchMessageCount();
    void attachUserChannel();

    return () => {
      active = false;
      window.removeEventListener('messagesUpdated', onMessagesUpdated);
      subscription?.unsubscribe();
      void supabase.removeChannel(adminMessagesChannel);
      if (userStatusChannel) void supabase.removeChannel(userStatusChannel);
    };
  }, [fetchMessageCount]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Sign out failed:', error);
      setLoggingOut(false);
    }
  };


  const navClass = ({ isActive }) =>
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ' +
    (isActive
      ? 'bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-400/25'
      : 'text-slate-300 hover:bg-white/5 hover:text-white');

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a1120]/90 text-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-6">
        <Link to="/home" className="group flex min-w-0 items-center gap-2.5" aria-label="JB Premium Hub home">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-400/20 bg-slate-900/80 p-1 shadow-[0_0_24px_rgba(99,102,241,0.12)]">
            <img src="/jb-logo.png" alt="" className="h-full w-full object-contain" />
          </span>
          <span className="hidden flex-col sm:flex">
            <span className="text-sm font-black tracking-[.11em] text-slate-100 md:text-base">
              JB <span className="text-indigo-300">PREMIUM</span> HUB
            </span>
            <span className="text-[10px] font-medium tracking-[.08em] text-slate-400">
              Your media. Your membership.
            </span>
          </span>
        </Link>

        <nav className="flex min-w-0 items-center gap-0.5 sm:gap-1" aria-label="Main navigation">
          <NavLink to="/home" className={navClass} title="Home" aria-label="Home">
            <Home size={18} aria-hidden="true" />
            <span className="hidden lg:inline">Home</span>
          </NavLink>
          <NavLink to="/subscribe" className={navClass} title="Plans" aria-label="Plans">
            <CreditCard size={18} aria-hidden="true" />
            <span className="hidden lg:inline">Plans</span>
          </NavLink>
          <NavLink to="/messages" className={navClass}
            title="Messages" aria-label={messageCount ? `Messages, ${messageCount} unread` : 'Messages'}>
            <span className="relative inline-flex">
              <MessageCircle size={19} aria-hidden="true" />
              {messageCount > 0 && (
                <span className="absolute -right-2.5 -top-2.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-[#0a1120] bg-indigo-500 px-1 text-[9px] font-bold text-white">
                  {messageCount > 99 ? '99+' : messageCount}
                </span>
              )}
            </span>
            <span className="hidden lg:inline">Messages</span>
          </NavLink>
          <NavLink to="/profile" className={navClass} title="My account" aria-label="My account">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-500/15 text-xs font-bold text-indigo-200">
              {userInitial || <UserRound size={16} aria-hidden="true" />}
            </span>
            <span className="hidden lg:inline">Account</span>
          </NavLink>
          <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" aria-hidden="true" />
          <button type="button" disabled={loggingOut} onClick={handleLogout}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-2.5 py-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50 sm:px-3"
            title="Sign out" aria-label="Sign out">
            <LogOut size={18} aria-hidden="true" />
            <span className="hidden lg:inline text-sm font-semibold">Sign out</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
