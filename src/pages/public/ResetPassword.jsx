import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const navigate = useNavigate();

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

      // 3. Auto-redirect pabalik sa Login pagkatapos ng 2.5 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2500);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl max-w-md w-full shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 text-2xl mb-3">
            🔑
          </div>
          <h2 className="text-2xl font-bold text-white">Reset Password</h2>
          <p className="text-gray-400 text-sm mt-1">
            Enter your new password below to regain access.
          </p>
        </div>

        {/* Dynamic Success/Error Alert Banner */}
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
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
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
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer mt-2"
          >
            {loading ? 'Updating Password...' : 'Save New Password'}
          </button>
        </form>
      </div>
    </div>
  );
}