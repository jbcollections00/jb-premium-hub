import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

// STEP 307D: Preserve existing authentication, login redirect and reset logic.
// Only add display of the signup confirmation message already passed by Signup.
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const navigate = useNavigate();
  const location = useLocation();
  const signupMessage = typeof location.state?.signupMessage === 'string'
    ? location.state.signupMessage
    : '';

  const handleLogin = async (e) => {
    e.preventDefault();

    setLoading(true);
    setMsg({ type: '', text: '' });

    const trimmedEmail = email.trim().toLowerCase();
    const loginPassword = password;

    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: loginPassword,
    });

    if (error) {
      setLoading(false);

      if (error.message.toLowerCase().includes('email not confirmed')) {
        setMsg({
          type: 'unconfirmed',
          text: 'Email not confirmed yet. Please check your Inbox and Spam folder for the verification link.',
        });
      } else {
        setMsg({
          type: 'error',
          text: error.message,
        });
      }

      return;
    }

    setLoading(false);
    const requestedPath = location.state?.from;
    const safeDestination =
      typeof requestedPath === 'string' &&
      requestedPath.startsWith('/') &&
      !requestedPath.startsWith('//') &&
      !requestedPath.startsWith('/\\') &&
      !requestedPath.startsWith('/login')
        ? requestedPath
        : '/home';
    navigate(safeDestination, { replace: true });
  };

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
        text: 'New confirmation link sent! Check your Inbox and Spam folder.',
      });
    }
  };

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
        text: 'Password reset link sent! Check your email inbox.',
      });
    }

    setLoading(false);
  };

  return (
    <div className="jbh-auth">
      <div className="jbh-auth-card space-y-6">
        <div className="text-center">
          <img
            src="/jb-logo.png"
            alt="JB Logo"
            className="mx-auto mb-4 h-16 w-16 object-contain"
          />
          <h2 className="text-3xl font-extrabold tracking-tight text-white">Welcome back</h2>
          <p className="mt-2 text-sm text-slate-400">Sign in to continue to JB Premium Hub.</p>
        </div>

        {!msg.text && signupMessage && (
          <div role="status" className="text-xs p-3.5 rounded-xl text-center font-medium leading-relaxed bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            {signupMessage}
          </div>
        )}

        {msg.text && (
          <div
            role={msg.type === 'error' ? 'alert' : 'status'}
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
          <div>
            <label htmlFor="jb-login-email" className="text-slate-400 text-xs block mb-1">Email Address</label>
            <input
              id="jb-login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="jbh-field text-sm"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label htmlFor="jb-login-password" className="text-slate-400 text-xs">Password</label>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="cursor-pointer text-xs font-semibold text-indigo-300 hover:text-white"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <input
                id="jb-login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="jbh-field pr-20 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3.5 text-slate-400 hover:text-white text-xs cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="jbh-btn mt-2 w-full"
          >
            {loading ? 'Logging In...' : 'Log In'}
          </button>
        </form>

        <div className="text-center text-xs text-slate-400">
          Don't have an account?{' '}
          <Link to="/signup" className="font-semibold text-indigo-300 hover:text-white">
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}
