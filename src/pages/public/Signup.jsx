import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

// STEP 307D: Public, non-adult registration UI.
// Keep Supabase signup, profile-trigger ownership, referral metadata and
// email verification behavior. Terms acceptance replaces the old 18+ gate.
function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

function getFriendlySignupError(error) {
  const message = error?.message || '';
  const lower = message.toLowerCase();

  if (lower.includes('already registered')) {
    return 'This email address is already registered.';
  }
  if (lower.includes('username') && /(duplicate|unique|already)/.test(lower)) {
    return 'That username is already taken.';
  }
  if (lower.includes('database error')) {
    return 'Unable to create the account. The username may already be taken. Please try another username.';
  }
  return message || 'Unable to create account.';
}

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlReferral = searchParams.get('ref');
  const [savedReferral, setSavedReferral] = useState(() => {
    try {
      return localStorage.getItem('jb_ref_code');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!urlReferral) return;
    try {
      localStorage.setItem('jb_ref_code', urlReferral);
    } catch {
      // Browser storage can be unavailable; URL referral is still honored.
    }
    setSavedReferral(urlReferral);
  }, [urlReferral]);

  const activeRefCode = urlReferral || savedReferral || null;
  const cleanName = fullName.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = normalizeUsername(username);
  const isNameValid = cleanName.length >= 2;
  const isUsernameValid = /^[a-z0-9._-]{3,30}$/.test(cleanUsername);
  const isEmailValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanEmail);
  const isPasswordValid = password.trim().length >= 6;
  const canSubmit = !loading && acceptedTerms && isNameValid && isUsernameValid && isEmailValid && isPasswordValid;
  const usernamePreview = useMemo(() => cleanUsername ? `@${cleanUsername}` : '@username', [cleanUsername]);

  const handleUsernameChange = (event) => {
    const value = event.target.value.replace(/^@/, '').toLowerCase()
      .replace(/[^a-z0-9._-]/g, '').slice(0, 30);
    setUsername(value);
    setErrorMsg('');
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    setErrorMsg('');

    if (!acceptedTerms) {
      setErrorMsg('Please accept the Terms of Service and Privacy Policy.');
      return;
    }
    if (!isNameValid) {
      setErrorMsg('Full name must be at least 2 characters.');
      return;
    }
    if (!isUsernameValid) {
      setErrorMsg('Username must be 3–30 characters and use only letters, numbers, dot, underscore or hyphen.');
      return;
    }
    if (!isEmailValid) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!isPasswordValid) {
      setErrorMsg('Password must contain at least 6 characters.');
      return;
    }

    try {
      setLoading(true);
      // public.handle_new_user() creates public.profiles automatically.
      // Do not insert profiles directly from the browser.
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password.trim(),
        options: {
          data: {
            full_name: cleanName,
            username: cleanUsername,
            referral_code: activeRefCode || null,
          },
        },
      });
      if (error) throw error;
      if (!data?.user) throw new Error('Account was not created.');

      // Keep referral localStorage intact until a trusted backend processes it.
      if (data.session) {
        navigate('/home', { replace: true });
      } else {
        navigate('/login', {
          replace: true,
          state: { signupMessage: 'Account created. Please confirm your email before logging in.' },
        });
      }
    } catch (error) {
      console.error('Signup error:', error);
      setErrorMsg(getFriendlySignupError(error));
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'jbh-field text-sm';

  return (
    <div className="jbh-auth">
      <div className="jbh-auth-card space-y-6">
        <div className="text-center">
          <img src="/jb-logo.png" alt="JB Premium Hub logo" className="mx-auto mb-4 h-16 w-16 object-contain" />
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Create your account</h1>
          <p className="mt-2 text-sm text-slate-400">Join JB Premium Hub and discover more.</p>
          {activeRefCode && (
            <p className="mt-3 inline-flex rounded-full border border-indigo-400/25 bg-indigo-400/10 px-3 py-1 text-[11px] font-semibold text-indigo-200">
              Referral detected
            </p>
          )}
        </div>

        {errorMsg && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-center text-xs text-rose-300">{errorMsg}</div>}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label htmlFor="jb-signup-name" className="mb-1 block text-xs font-semibold uppercase text-slate-400">Full Name</label>
            <input id="jb-signup-name" type="text" required autoComplete="name" maxLength={100} value={fullName}
              onChange={(e) => { setFullName(e.target.value); setErrorMsg(''); }}
              placeholder="Juan Dela Cruz" className={inputClass} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label htmlFor="jb-signup-username" className="text-xs font-semibold uppercase text-slate-400">Username</label>
              <span className="text-[11px] text-slate-500">{usernamePreview}</span>
            </div>
            <input id="jb-signup-username" type="text" required autoComplete="username" minLength={3} maxLength={30}
              value={username} onChange={handleUsernameChange} placeholder="juandelacruz" spellCheck={false} className={inputClass} />
            <p className="mt-1 text-[11px] text-slate-500">3–30 characters: letters, numbers, dot, underscore or hyphen. This is your public username.</p>
          </div>
          <div>
            <label htmlFor="jb-signup-email" className="mb-1 block text-xs font-semibold uppercase text-slate-400">Email Address</label>
            <input id="jb-signup-email" type="email" required autoComplete="email" value={email}
              onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
              placeholder="user@example.com" className={inputClass} />
          </div>
          <div>
            <label htmlFor="jb-signup-password" className="mb-1 block text-xs font-semibold uppercase text-slate-400">Password</label>
            <div className="relative">
              <input id="jb-signup-password" type={showPassword ? 'text' : 'password'} required autoComplete="new-password"
                value={password} onChange={(e) => { setPassword(e.target.value); setErrorMsg(''); }}
                placeholder="At least 6 characters" className={`${inputClass} pr-16`} />
              <button type="button" onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-300 hover:text-white"
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="flex items-start gap-2.5 pt-1">
            <input id="jb-accept-terms" type="checkbox" required checked={acceptedTerms}
              onChange={(e) => { setAcceptedTerms(e.target.checked); setErrorMsg(''); }}
              className="mt-0.5 cursor-pointer rounded border-slate-700 bg-slate-950 text-blue-600" />
            <label htmlFor="jb-accept-terms" className="text-xs leading-relaxed text-slate-300">
              I agree to the <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">Terms of Service</Link> and{' '}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">Privacy Policy</Link>.
            </label>
          </div>
          <button type="submit" disabled={!canSubmit}
            className="jbh-btn w-full">
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
        <p className="text-center text-xs text-slate-400">Already have an account?{' '}
          <Link to="/login" className="font-semibold text-indigo-300 hover:text-white">Log in</Link>
        </p>
      </div>
    </div>
  );
}
