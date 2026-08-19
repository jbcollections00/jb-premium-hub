import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function ActivateCode() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const navigate = useNavigate();

  const handleActivate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: '', text: '' });

    // Kuhanin ang kasalukuyang user
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setMsg({ type: 'error', text: 'Kailangan mong mag-login muna.' });
      setLoading(false);
      return;
    }

    // 1. I-check kung valid at hindi pa nagagamit ang code
    const { data: codeData, error: codeError } = await supabase
      .from('access_codes')
      .select('*')
      .eq('code', code.trim())
      .eq('is_used', false)
      .single();

    if (codeError || !codeData) {
      setMsg({ type: 'error', text: 'Invalid or already used Access Code!' });
      setLoading(false);
      return;
    }

    // 2. Markahan na USED na ang code
    await supabase
      .from('access_codes')
      .update({ is_used: true, used_by: user.id })
      .eq('id', codeData.id);

    // 3. I-update ang profile ng user (is_activated = true)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ is_activated: true })
      .eq('id', user.id);

    if (profileError) {
      setMsg({ type: 'error', text: 'Failed to update activation status.' });
    } else {
      setMsg({ type: 'success', text: 'Account successfully activated! Redirecting...' });
      setTimeout(() => {
        navigate('/home');
      }, 2000);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl max-w-md w-full shadow-2xl text-center">
        <div className="w-16 h-16 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl border border-blue-500/30">
          🔑
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Activate VIP Access</h2>
        <p className="text-gray-400 text-sm mb-6">
          Enter your unique access code below to unlock premium vault contents.
        </p>

        {msg.text && (
          <div className={`p-3 rounded-xl mb-4 text-sm ${msg.type === 'error' ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-green-500/10 border border-green-500/30 text-green-400'}`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={handleActivate} className="flex flex-col gap-4">
          <input 
            type="text" 
            required 
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. VIP-JB-2026" 
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-center text-lg uppercase tracking-widest focus:outline-none focus:border-blue-500"
          />

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer"
          >
            {loading ? 'Verifying Code...' : 'Activate Account'}
          </button>
        </form>
      </div>
    </div>
  );
}