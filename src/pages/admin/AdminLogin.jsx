import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import './adminWorkspace.css';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleAdminLogin = async (e) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      setError('Please enter your admin email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const {
        data: { user },
        error: signInError,
      } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) throw signInError;

      if (!user?.id) {
        throw new Error('Unable to verify this account.');
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, account_type')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      const role = (profile?.role || '').toLowerCase();
      const accountType = (profile?.account_type || '').toLowerCase();

      const isAdmin = role === 'admin' || accountType === 'admin';

      if (!isAdmin) {
        // Do not leave a non-admin account signed in through the admin portal.
        await supabase.auth.signOut();
        localStorage.removeItem('isAdminAuthenticated');

        setError('Access denied. This account does not have admin permission.');
        return;
      }

      // Convenience flag only. Real authorization must still be enforced by
      // Supabase RLS / database policies using the authenticated account.
      localStorage.setItem('isAdminAuthenticated', 'true');

      navigate('/admin-vault-secret', { replace: true });
    } catch (err) {
      console.error('Admin login error:', err);
      localStorage.removeItem('isAdminAuthenticated');

      setError(
        err?.message === 'Invalid login credentials'
          ? 'Invalid admin email or password.'
          : err?.message || 'Unable to authenticate admin account.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="jbh-admin jbh-admin-login-shell flex min-h-screen items-center justify-center px-4 py-10">
      <div className="jbh-admin-login-card jbh-admin-page w-full max-w-md rounded-3xl p-7 text-center shadow-2xl sm:p-10">
        <div className="jbh-admin-brand-mark mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[22px] p-2">
          <img src="/jb-logo.png" alt="JB Collections" className="h-full w-full object-contain" />
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">
          Admin sign in
        </h2>

        <p className="text-gray-400 text-xs mb-6">
          Secure administration for authorized team members.
        </p>

        {error && (
          <div
            role="alert"
            className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-xl mb-4"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="flex flex-col gap-4">
          <div className="text-left">
            <label
              htmlFor="admin-email"
              className="block text-xs font-semibold text-gray-400 mb-1.5"
            >
              Admin Email
            </label>

            <input
              id="admin-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              disabled={loading}
              className="jbh-admin-input w-full px-4 py-3 text-sm disabled:opacity-60"
            />
          </div>

          <div className="text-left">
            <label
              htmlFor="admin-password"
              className="block text-xs font-semibold text-gray-400 mb-1.5"
            >
              Password
            </label>

            <input
              id="admin-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              disabled={loading}
              className="jbh-admin-input w-full px-4 py-3 text-sm disabled:opacity-60"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="jbh-admin-primary w-full disabled:opacity-60"
          >
            {loading ? 'Authenticating...' : 'Authenticate Admin'}
          </button>
        </form>
      </div>
    </div>
  );
}
