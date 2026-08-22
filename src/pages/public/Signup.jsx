import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    // 1. I-register ang user sa Supabase Auth
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

    // 2. Kapag success, gumawa ng random Access Code at I-send ang Welcome Message
    if (data?.user) {
      const generatedCode = 'VAULT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // 🟢 BAGONG DAGDAG: I-save ang Access Code sa database para maging VALID
      const { error: codeError } = await supabase.from('access_codes').insert([{
        code: generatedCode,
        status: 'active' // O 'unused', depende sa ginamit mong default status sa table mo
      }]);

      if (codeError) {
        console.error("Failed to save access code:", codeError.message);
      }

      // 🟢 I-send ang Welcome Message sa Inbox ng user
      const { error: msgError } = await supabase.from('admin_messages').insert([{
        user_id: data.user.id,
        title: '🎉 Welcome to Vault Hub!',
        content: `Hi ${fullName}! Thank you for registering. Your Standard Access Code is: ${generatedCode}. Use this to unlock exclusive media. Enjoy!`,
        is_read: false
      }]);

      if (msgError) {
        console.error("Failed to send welcome message:", msgError.message);
      }
    }

    alert('Signup Successful! Redirecting to Home...');
    navigate('/home');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
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
    </div>
  );
}