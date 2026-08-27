import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [is18Plus, setIs18Plus] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Live Field Validation Logic
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const isEmailValid = emailRegex.test(email.trim());
  const isPasswordValid = password.trim().length >= 6;
  const isNameValid = fullName.trim().length >= 2;

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

    // Create Supabase Auth Account
    const { error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: trimmedPassword,
      options: {
        data: { full_name: trimmedName, email: trimmedEmail },
      },
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    setIsSubmitted(true);
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
          <h2 className="text-2xl font-bold text-white">Create an Account</h2>
          <p className="text-slate-400 text-xs mt-1">Sign up to unlock immediate access to the vault</p>
        </div>

        {/* Confirmation Screen with Spam Instructions */}
        {isSubmitted ? (
          <div className="text-center space-y-4 pt-2">
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-2xl">
              📩
            </div>
            
            <div>
              <h3 className="font-bold text-white text-lg">Check Your Inbox</h3>
              <p className="text-xs text-slate-300 mt-1">
                We sent a confirmation link to <span className="font-bold text-emerald-400">{email}</span>.
              </p>
            </div>

            {/* Spam Folder Guidance Box */}
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl text-left space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-sm">⚠️</span>
                <p className="text-xs font-bold text-amber-300">Check your Spam or Junk folder</p>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Verification emails frequently land in <span className="font-semibold text-amber-400">Spam</span>. If you don't see it in your main inbox:
              </p>
              <ol className="text-[11px] text-slate-300 space-y-1.5 list-decimal list-inside pl-1">
                <li>Open your <span className="font-semibold text-white">Spam / Junk / Social</span> folder.</li>
                <li>Find the email titled <span className="font-semibold text-white">"Confirm your mail"</span>.</li>
                <li>Click <span className="font-semibold text-emerald-400">"Report as Not Spam"</span> or move it to your main inbox—otherwise, email providers disable the verification link inside.</li>
              </ol>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              <Link 
                to="/login" 
                className="block w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-3 rounded-xl transition-all"
              >
                I Confirmed My Email → Go to Login
              </Link>
              <button 
                type="button"
                onClick={() => setIsSubmitted(false)}
                className="text-xs text-slate-400 hover:text-white underline cursor-pointer block mx-auto pt-1"
              >
                Entered wrong email? Click here to fix it
              </button>
            </div>
          </div>
        ) : (
          <>
            {errorMsg && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs p-3 rounded-xl text-center">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSignup} className="space-y-4">
              {/* Full Name Field */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400 text-xs">Full Name</label>
                  {fullName && (
                    <span className={`text-[10px] ${isNameValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isNameValid ? '✓ Valid' : 'Min 2 chars'}
                    </span>
                  )}
                </div>
                <input 
                  type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="Juan Dela Cruz" 
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Email Address Field */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400 text-xs">Email Address</label>
                  {email && (
                    <span className={`text-[10px] ${isEmailValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isEmailValid ? '✓ Valid Email' : 'Invalid format'}
                    </span>
                  )}
                </div>
                <input 
                  type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com" 
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Password Field with Eye Toggle */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400 text-xs">Password</label>
                  {password && (
                    <span className={`text-[10px] ${isPasswordValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isPasswordValid ? '✓ Strong' : 'Min 6 chars'}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    required value={password} onChange={(e) => setPassword(e.target.value)}
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

              {/* 18+ Verification Checkbox */}
              <div className="flex items-start gap-2.5 pt-1">
                <input 
                  type="checkbox" 
                  id="ageCheck" 
                  required 
                  checked={is18Plus} 
                  onChange={(e) => setIs18Plus(e.target.checked)}
                  className="mt-0.5 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="ageCheck" className="text-xs text-slate-300 cursor-pointer leading-tight">
                  I confirm I am <span className="text-amber-400 font-bold">18+ years of age</span> and agree to the Terms of Service.
                </label>
              </div>

              <button 
                type="submit" 
                disabled={loading || !is18Plus || !isEmailValid || !isPasswordValid || !isNameValid}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer mt-2"
              >
                {loading ? 'Creating Account...' : 'Create Account & Start Watching'}
              </button>
            </form>

            <div className="text-center text-xs text-slate-400">
              Already have an account? <Link to="/login" className="text-blue-400 hover:underline font-semibold">Log In</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}