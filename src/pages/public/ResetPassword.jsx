import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const navigate = useNavigate();

  // 🛡️ Guard: Siguraduhing may valid session mula sa recovery email
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMsg({
          type: 'error',
          text: 'This reset link has expired. Please request a new one.',
        });
      }
    };
    checkSession();
  }, []);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });

    // 1. Password Checks
    if (password.length < 6) {
      setMsg({ type: 'error', text: 'Password must be at least 6 characters long.' });
      return;
    }

    if (password !== confirmPassword) {
      setMsg({ type: 'error', text: 'Passwords do not match. Please try again.' });
      return;
    }

    setLoading(true);

    // 2. Update Password sa Supabase Auth
    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setMsg({ type: 'error', text: error.message });
      setLoading(false);
    } else {
      setMsg({
        type: 'success',
        text: '🎉 Password updated successfully! Redirecting to login...',
      });

      // 3. Auto-redirect pabalik sa Login
      setTimeout(() => {
        navigate('/login');
      }, 2500);
    }
  };

  return (
    <div className="jbh-auth">
      <div className="jbh-auth-card">
        <div className="text-center mb-6">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-400/25 bg-indigo-400/10 text-2xl text-indigo-300">
            🔑
          </div>
          <h2 className="text-2xl font-bold text-white">Reset Password</h2>
          <p className="text-gray-400 text-sm mt-1">
            Enter your new password below to regain access.
          </p>
        </div>

        {/* Dynamic Alert Banner */}
        {msg.text && (
          <div
            className={`text-sm p-3 rounded-xl mb-4 text-center font-medium ${
              msg.type === 'error'
                ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                : 'bg-green-500/10 border border-green-500/30 text-green-400'
            }`}
          >
            {msg.text}
          </div>
        )}

        <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="jbh-field text-sm"
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Confirm New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-type new password"
              className="jbh-field text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="jbh-btn mt-2 w-full"
          >
            {loading ? 'Updating Password...' : 'Save New Password'}
          </button>
        </form>
      </div>
    </div>
  );
}