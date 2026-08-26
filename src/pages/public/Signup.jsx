import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showModal, setShowModal] = useState(false);
  
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    // 1. Register the user in Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    // 2. On success, generate a Standard Access Code (No Expiration)
    if (data?.user) {
      const generatedCode = 'VAULT-' + Math.random().toString(36).substring(2, 8).toUpperCase();

      // Save the Access Code to the database WITHOUT an expires_at value
      const { error: codeError } = await supabase.from('access_codes').insert([{
        code: generatedCode,
        type: 'STANDARD',
        is_used: false,
        duration_days: 30
      }]);

      if (codeError) {
        console.error("🚨 CRITICAL: Failed to save access code to DB:", codeError.message);
        setErrorMsg("Account created, but we couldn't generate your code. Please contact Admin.");
      }

      // 3. Send the Welcome Message
      const messageContent = `Hi ${fullName || 'User'}! Thank you for registering.

🔑 Your Standard Access Code is: ${generatedCode}

Go to your Profile page and enter this code to activate your 30-day Standard Access whenever you're ready!`;

      const { error: msgError } = await supabase.from('admin_messages').insert([{
        user_id: data.user.id,
        title: '🎉 Welcome to JB PREMIUM HUB!',
        message: messageContent,
        content: messageContent,
        is_read: false,
        send_to_all: false
      }]);

      if (msgError) {
        console.error("Failed to send welcome message:", msgError.message);
      }
    }

    setLoading(false);
    setShowModal(true); // Open Success Modal
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 relative">
      <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl max-w-md w-full shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-2 text-center">Create an Account</h2>
        <p className="text-gray-400 text-sm mb-6 text-center">Sign up to unlock exclusive vault media</p>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-xl mb-4 text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Full Name</label>
            <input 
              type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
              placeholder="Juan Dela Cruz" 
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Email Address</label>
            <input 
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com" 
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Password</label>
            <input 
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" 
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <button 
            type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer mt-2"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-400">
          Already have an account? <Link to="/login" className="text-blue-400 hover:underline font-semibold">Log In</Link>
        </div>
      </div>

      {/* 🔔 SUCCESS POPUP MODAL WITH ENGLISH INSTRUCTIONS */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto text-3xl">
              📩
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-extrabold text-white">Account Created Successfully!</h3>
              <p className="text-xs text-gray-400">
                Follow these simple steps to retrieve and activate your code:
              </p>
            </div>

            {/* 📌 STEP-BY-STEP INSTRUCTION BOX */}
            <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 text-left space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-5 h-5 bg-blue-600 text-white rounded-full text-[10px] font-bold shrink-0 mt-0.5">
                  1
                </span>
                <p className="text-xs text-gray-300">
                  Click <span className="text-blue-400 font-bold">Open Messages</span> to copy your <span className="text-amber-400 font-bold">Standard Access Code</span>[cite: 6].
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-5 h-5 bg-blue-600 text-white rounded-full text-[10px] font-bold shrink-0 mt-0.5">
                  2
                </span>
                <p className="text-xs text-gray-300">
                  Go to your <span className="text-blue-400 font-bold">Profile Page</span>[cite: 6].
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-5 h-5 bg-blue-600 text-white rounded-full text-[10px] font-bold shrink-0 mt-0.5">
                  3
                </span>
                <p className="text-xs text-gray-300">
                  Paste the code into the <span className="text-emerald-400 font-bold">Redeem Access Code</span> section to activate your 30-day standard access!
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/messages')}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl transition-all shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              Open Messages & Copy Code 💬
            </button>
          </div>
        </div>
      )}
    </div>
  );
}