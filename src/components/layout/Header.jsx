import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreditCard, LogOut, MessageCircle } from 'lucide-react';
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

  const navClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-transparent px-2.5 py-2 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-700 hover:bg-white/5 hover:text-white sm:px-3';

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/95 px-3 py-3 text-white shadow-lg backdrop-blur-xl sm:px-5">
      <Link to="/home" className="flex min-w-0 items-center gap-3" aria-label="JB Premium Hub Home">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 p-0.5">
          <span className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-900 p-1.5">
            <img src="/logo.png" alt="JB Premium Hub" className="h-full w-full object-contain" />
          </span>
        </span>
        <span className="hidden min-w-0 flex-col sm:flex">
          <span className="text-lg font-extrabold tracking-tight">
            <span className="text-blue-400">JB</span> PREMIUM <span className="text-purple-400">HUB</span>
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-400">Media Gallery & Memberships</span>
        </span>
      </Link>

      <nav className="flex shrink-0 items-center gap-0.5 sm:gap-2" aria-label="User navigation">
        <Link to="/profile" className={navClass} title="Profile" aria-label="Profile">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-xs font-extrabold text-white">{userInitial}</span>
          <span className="hidden md:inline">Profile</span>
        </Link>

        <Link to="/subscribe" className={navClass} title="Membership plans" aria-label="Membership plans">
          <CreditCard size={19} aria-hidden="true" />
          <span className="hidden md:inline">Plans</span>
        </Link>

        <Link to="/messages" className={navClass} title="Messages" aria-label={`Messages${messageCount ? `, ${messageCount} unread` : ''}`}>
          <span className="relative inline-flex">
            <MessageCircle size={20} aria-hidden="true" />
            {messageCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-slate-950 bg-red-600 px-0.5 text-[9px] font-bold text-white">
                {messageCount > 99 ? '99+' : messageCount}
              </span>
            )}
          </span>
          <span className="hidden md:inline">Messages</span>
        </Link>

        <button type="button" disabled={loggingOut} onClick={handleLogout} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50 sm:px-3" title="Logout" aria-label="Logout">
          <LogOut size={19} aria-hidden="true" />
          <span className="hidden md:inline">Logout</span>
        </button>
      </nav>
    </header>
  );
}
