import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const POPUNDER_AD_URL = "https://deeprootedpressure.com/vja5sy3m?key=fc8ea4a621cb34f209a9fa31d4b85bea";

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [is18Plus, setIs18Plus] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasTriggeredSignupAd, setHasTriggeredSignupAd] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Dynamic Injection ng Adsterra Popunder Script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://deeprootedpressure.com/fb/53/10/fb5310e480b539e2e359b7186685fb7c.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // Save referral code from URL
  useEffect(() => {
    const refFromUrl = searchParams.get('ref');
    if (refFromUrl) {
      localStorage.setItem('jb_ref_code', refFromUrl);
    }
  }, [searchParams]);

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const isEmailValid = emailRegex.test(email.trim());
  const isPasswordValid = password.trim().length >= 6;
  const isNameValid = fullName.trim().length >= 2;

  const activeRefCode = searchParams.get('ref') || localStorage.getItem('jb_ref_code');

  const handleSignup = async (e) => {
    e.preventDefault();

    if (!is18Plus) {
      setErrorMsg('You must be 18+ years old to register.');
      return;
    }

    // 1st Click: Trigger Popunder Ad
    if (!hasTriggeredSignupAd) {
      window.open(POPUNDER_AD_URL, "_blank");
      setHasTriggeredSignupAd(true);
      return;
    }

    // 2nd Click: Submit Signup
    setLoading(true);
    setErrorMsg('');

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: trimmedPassword,
        options: {
          data: {
            full_name: trimmedName,
          },
        },
      });

      if (error) throw error;

      const newUser = data?.user;

      if (newUser) {
        const profileData = {
          id: newUser.id,
          full_name: trimmedName,
          email: trimmedEmail,
        };

        if (activeRefCode && activeRefCode !== newUser.id) {
          profileData.referred_by = activeRefCode;
        }

        const { error: profileError } = await supabase.from('profiles').upsert(profileData);
        if (profileError) console.error("Error creating profile:", profileError.message);

        if (activeRefCode) {
          localStorage.removeItem('jb_ref_code');
        }
      }

      navigate('/home');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-8 font-sans text-white">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md w-full shadow-2xl space-y-6">
        
        {/* Logo & Header */}
        <div className="text-center">
          <img 
            src="/jb-logo.png" 
            alt="JB Logo" 
            className="w-16 h-16 mx-auto mb-3 object-contain drop-shadow-md"
          />
          <h2 className="text-2xl font-bold text-white">Create an Account</h2>
          <p className="text-slate-400 text-xs mt-1">
            Sign up for instant access to standard media content
          </p>

          {activeRefCode && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-400 text-[11px] font-semibold">
              🎁 Invited by a friend (Ref: Validated)
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs p-3 rounded-xl text-center font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-slate-400 text-xs font-semibold uppercase">Full Name</label>
              {fullName && (
                <span className={`text-[10px] ${isNameValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isNameValid ? '✓ Valid' : 'Min 2 chars'}
                </span>
              )}
            </div>
            <input 
              type="text" 
              required 
              value={fullName} 
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Juan Dela Cruz" 
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-slate-400 text-xs font-semibold uppercase">Email Address</label>
              {email && (
                <span className={`text-[10px] ${isEmailValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isEmailValid ? '✓ Valid Email' : 'Invalid format'}
                </span>
              )}
            </div>
            <input 
              type="email" 
              required 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com" 
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-slate-400 text-xs font-semibold uppercase">Password</label>
              {password && (
                <span className={`text-[10px] ${isPasswordValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isPasswordValid ? '✓ Strong' : 'Min 6 chars'}
                </span>
              )}
            </div>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'} 
                required 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500 pr-10"
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

          <div className="flex items-start gap-2.5 pt-1">
            <input 
              type="checkbox" 
              id="ageCheck" 
              required 
              checked={is18Plus} 
              onChange={(e) => setIs18Plus(e.target.checked)}
              className="mt-0.5 rounded bg-slate-950 border-slate-800 text-red-600 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="ageCheck" className="text-xs text-slate-300 cursor-pointer leading-tight">
              I confirm I am <span className="text-amber-400 font-bold">18+ years of age</span> and agree to the Terms of Service.
            </label>
          </div>

          <button 
            type="submit" 
            disabled={loading || !is18Plus || !isEmailValid || !isPasswordValid || !isNameValid}
            className="w-full bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-red-950/50 mt-2"
          >
            {loading ? 'Creating Account...' : 'Sign Up & Watch Now'}
          </button>
        </form>

        <div className="text-center text-xs text-slate-400">
          Already have an account? <Link to="/login" className="text-red-500 hover:underline font-semibold">Log In</Link>
        </div>

      </div>
    </div>
  );
}