import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const navigate = useNavigate();

  // Function para sa normal login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: '', text: '' });

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setMsg({ type: 'error', text: error.message });
      setLoading(false);
    } else {
      navigate('/home');
    }
  };

  // Function para sa Forgot Password
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setMsg({ type: 'error', text: 'Please enter your email address first.' });
      return;
    }

    setLoading(true);
    setMsg({ type: '', text: '' });

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else {
      setMsg({
        type: 'success',
        text: '🎉 Password reset link sent! Please check your email inbox.',
      });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl max-w-md w-full shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-2 text-center">Welcome Back</h2>
        <p className="text-gray-400 text-sm mb-6 text-center">Log in to access your VIP status</p>

        {/* Dynamic Success or Error Banner */}
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

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Email Address</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com" 
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-gray-400 text-xs">Password</label>
              {/* FORGOT PASSWORD BUTTON */}
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs text-blue-400 hover:underline cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>
            <input 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" 
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer mt-2"
          >
            {loading ? 'Please wait...' : 'Log In'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-400">
          Don't have an account?{' '}
          <Link to="/signup" className="text-blue-400 hover:underline font-semibold">
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}