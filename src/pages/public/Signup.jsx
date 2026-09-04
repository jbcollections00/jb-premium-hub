import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [is18Plus, setIs18Plus] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 1. I-save ang referral code mula sa URL papuntang localStorage para hindi mawala[cite: 6]
  useEffect(() => {
    const refFromUrl = searchParams.get('ref');
    if (refFromUrl) {
      localStorage.setItem('jb_ref_code', refFromUrl);
    }
  }, [searchParams]);

  // Field validation[cite: 6]
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

    setLoading(true);
    setErrorMsg('');

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    try {
      // 1. Create Supabase Auth Account[cite: 6]
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
        // 2. I-setup ang profile data para sa database
        const profileData = {
          id: newUser.id,
          full_name: trimmedName,
          email: trimmedEmail,
        };

        // 3. I-link sa Referrer kung pumasok gamit ang referral link at valid ito
        if (activeRefCode && activeRefCode !== newUser.id) {
          profileData.referred_by = activeRefCode;
        }

        const { error: profileError } = await supabase.from('profiles').upsert(profileData);
        if (profileError) console.error("Error creating profile:", profileError.message);

        // Linisin ang storage pagkatapos magamit[cite: 6]
        if (activeRefCode) {
          localStorage.removeItem('jb_ref_code');
        }
      }

      // 4. Immediate redirect to /home[cite: 6]
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

          {/* Referral Badge Notification[cite: 6] */}
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
          {/* Full Name Field[cite: 6] */}
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

          {/* Email Address Field[cite: 6] */}
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

          {/* Password Field with Toggle[cite: 6] */}
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

          {/* 18+ Verification Checkbox[cite: 6] */}
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

          {/* Submit Button[cite: 6] */}
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