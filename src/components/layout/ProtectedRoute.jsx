import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function ProtectedRoute({ adminOnly = false }) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const verifyAccess = async (sessionFromEvent = null) => {
      if (!isMounted) return;

      setLoading(true);

      try {
        let session = sessionFromEvent;

        if (!session) {
          const {
            data: { session: currentSession },
            error: sessionError,
          } = await supabase.auth.getSession();

          if (sessionError) throw sessionError;
          session = currentSession;
        }

        if (!isMounted) return;

        if (!session?.user) {
          setIsAuthenticated(false);
          setIsAdmin(false);
          return;
        }

        setIsAuthenticated(true);

        // Normal authenticated user route: no admin lookup needed.
        if (!adminOnly) {
          setIsAdmin(false);
          return;
        }

        // Admin route: keep loading until the profile check is complete.
        // This prevents temporary non-admin redirects during auth refreshes.
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('account_type, role')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!isMounted) return;

        const role = (profile?.role || '').toLowerCase();
        const accountType = (profile?.account_type || '').toLowerCase();

        const hasAdminAccess =
          role === 'admin' ||
          accountType === 'admin';

        setIsAdmin(hasAdminAccess);
      } catch (error) {
        console.error('Auth verification error:', error);

        if (!isMounted) return;

        setIsAuthenticated(false);
        setIsAdmin(false);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Initial verification.
    verifyAccess();

    // Keep access in sync with Supabase auth changes.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT' || !session?.user) {
        setIsAuthenticated(false);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Never reset isAdmin to false before the profile lookup finishes.
      verifyAccess(session);
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [adminOnly]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="animate-pulse text-xs text-slate-400 font-medium">
            Verifying Account...
          </p>
        </div>
      </div>
    );
  }

  // Not logged in -> Login.
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated but not admin -> Home.
  if (adminOnly && !isAdmin) {
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
}
