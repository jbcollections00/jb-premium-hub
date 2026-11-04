import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

/**
 * Phase 2A UI routing gate only, not a security boundary.
 * Backend RLS and private R2 objects must be implemented before launch.
 * The admin bypass ONLY trusts auth.app_metadata, not editable profile fields.
 */
export default function SubscriptionRoute() {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, allowed: false, error: '' });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, allowed: false, error: '' });
    async function check() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        const user = userData?.user;
        if (!user) {
          if (alive) setState({ loading: false, allowed: false, error: '' });
          return;
        }
        const appRole = String(user.app_metadata?.role || '').toLowerCase();
        if (appRole === 'admin') {
          if (alive) setState({ loading: false, allowed: true, error: '' });
          return;
        }
        const { data, error } = await supabase.rpc('jb_billing_my_access');
        if (error) throw error;
        const access = Array.isArray(data) ? data[0] : data;
        if (alive) setState({ loading: false, allowed: access?.can_view_albums === true, error: '' });
      } catch (error) {
        console.error('Subscription access lookup failed:', error);
        if (alive) setState({ loading: false, allowed: false, error: 'Unable to verify your subscription. Please try again.' });
      }
    }
    check();
    return () => { alive = false; };
  }, [location.pathname]);

  if (state.loading) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Checking subscription…</div>;
  if (state.error) return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-4 p-6">
      <p role="alert">{state.error}</p>
      <button className="bg-blue-600 rounded-lg px-4 py-2" onClick={() => window.location.reload()}>Retry</button>
      <a className="underline" href="/profile">Go to profile</a>
    </main>
  );
  if (!state.allowed) return <Navigate to="/subscribe" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}
