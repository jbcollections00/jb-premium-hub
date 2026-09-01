import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const navigate = useNavigate();

  // Handle standard user login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: '', text: '' });

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword,
    });

    if (error) {
      setLoading(false);
      if (error.message.toLowerCase().includes('email not confirmed')) {
        setMsg({
          type: 'unconfirmed',
          text: 'Email not confirmed yet. Please check your Inbox and Spam folder for the verification link.',
        });
      } else {
        setMsg({ type: 'error', text: error.message });
      }
    } else {
      setLoading(false);
      navigate('/home');
    }
  };

  // Handle guest login (Anonymous Authentication)
  const handleGuestLogin = async () => {
    setGuestLoading(true);
    setMsg({ type: '', text: '' });

    const { error } = await supabase.auth.signInAnonymously();

    if (error) {
      setGuestLoading(false);
      setMsg({ 
        type: 'error', 
        text: `Guest Access Error: ${error.message}. (Ensure Anonymous provider is enabled in Supabase)` 
      });
    } else {
      setGuestLoading(false);
      navigate('/home');
    }
  };

  // Handle resending unconfirmed account emails
  const handleResendConfirmation = async () => {
    if (!email.trim()) {
      setMsg({ type: 'error', text: 'Please enter your email address first.' });
      return;
    }

    setResending(true);
    setMsg({ type: '', text: '' });

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });

    setResending(false);

    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else {
      setMsg({
        type: 'success',
        text: '📩 New confirmation link sent! Check your Inbox and Spam folder.',
      });
    }
  };

  // Handle inline password reset link request
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setMsg({ type: 'error', text: 'Please enter your email address first.' });
      return;
    }

    setLoading(true);
    setMsg({ type: '', text: '' });

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else {
      setMsg({
        type: 'success',
        text: '🎉 Password reset link sent! Check your email inbox.',
      });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-8">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md w-full shadow-2xl space-y-6">
        
        {/* Logo & Header Section */}
        <div className="text-center">
          <img 
            src="/jb-logo.png" 
            alt="JB Logo" 
            className="w-16 h-16 mx-auto mb-3 object-contain drop-shadow-md"
          />
          <h2 className="text-2xl font-bold text-white">Welcome Back</h2>
          <p className="text-slate-400 text-xs mt-1">Log in to access your VIP status and vault</p>
        </div>

        {/* Dynamic Alert Banner */}
        {msg.text && (
          <div
            className={`text-xs p-3.5 rounded-xl text-center font-medium leading-relaxed ${
              msg.type === 'error'
                ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                : msg.type === 'unconfirmed'
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
                : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
            }`}
          >
            <p>{msg.text}</p>
            {msg.type === 'unconfirmed' && (
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={resending}
                className="mt-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer block mx-auto"
              >
                {resending ? 'Sending...' : 'Resend Confirmation Email'}
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {/* Email Address Field */}
          <div>
            <label className="text-slate-400 text-xs block mb-1">Email Address</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com" 
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Password Field with Eye Toggle */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-slate-400 text-xs">Password</label>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-[11px] text-blue-400 hover:underline cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'} 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3.5 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading || guestLoading || !email || !password}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer mt-2"
          >
            {loading ? 'Logging In...' : 'Log In'}
          </button>
        </form>

        {/* Divider */}
        <div className="relative flex items-center justify-center my-2">
          <div className="border-t border-slate-800 w-full"></div>
          <span className="bg-slate-900 px-3 text-[10px] text-slate-500 uppercase font-semibold absolute">
            Or
          </span>
        </div>

        {/* Guest Login Button */}
        <button
          type="button"
          onClick={handleGuestLogin}
          disabled={loading || guestLoading}
          className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <span>👤</span>
          {guestLoading ? 'Entering as Guest...' : 'Continue as Guest'}
        </button>

        <div className="text-center text-xs text-slate-400">
          Don't have an account?{' '}
          <Link to="/signup" className="text-blue-400 hover:underline font-semibold">
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}