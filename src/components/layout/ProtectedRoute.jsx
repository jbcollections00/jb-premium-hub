import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function ProtectedRoute({ adminOnly = false }) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initialCheck = async () => {
      try {
        setLoading(true);

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!mounted) return;

        if (!session?.user) {
          setIsAuthenticated(false);
          setIsAdmin(false);
          return;
        }

        setIsAuthenticated(true);

        // Normal protected user routes do not need an admin profile lookup.
        if (!adminOnly) {
          setIsAdmin(false);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, account_type')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!mounted) return;

        const role = (profile?.role || '').toLowerCase();
        const accountType = (profile?.account_type || '').toLowerCase();

        setIsAdmin(role === 'admin' || accountType === 'admin');
      } catch (error) {
        console.error('ProtectedRoute initial auth check failed:', error);

        if (mounted) {
          setIsAuthenticated(false);
          setIsAdmin(false);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initialCheck();

    // IMPORTANT:
    // Do NOT re-run the admin profile query for every auth event.
    // Supabase can emit SIGNED_IN / TOKEN_REFRESHED more than once,
    // which previously caused the "Verifying Account..." loop.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !session?.user) {
        setIsAuthenticated(false);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Keep the current page stable on SIGNED_IN / TOKEN_REFRESHED.
      // The admin role was already verified on mount.
      setIsAuthenticated(true);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [adminOnly]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          <p className="animate-pulse text-xs text-slate-400 font-medium">
            Verifying Account...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
}
