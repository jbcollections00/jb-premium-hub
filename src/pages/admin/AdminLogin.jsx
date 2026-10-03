import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 border border-red-900/50 p-8 rounded-2xl max-w-md w-full shadow-2xl text-center">
        <div className="w-16 h-16 bg-red-600/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl border border-red-500/30">
          🛡️
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">
          Admin Security Portal
        </h2>

        <p className="text-gray-400 text-xs mb-6">
          Restricted Access • Registered Admin Accounts Only
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
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-red-500 disabled:opacity-60"
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
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-red-500 disabled:opacity-60"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Authenticating...' : 'Authenticate Admin'}
          </button>
        </form>
      </div>
    </div>
  );
}
