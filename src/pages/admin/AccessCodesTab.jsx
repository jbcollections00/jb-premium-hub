import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';

export default function AccessCodesTab() {
  const [codes, setCodes] = useState([]);
  const [newCode, setNewCode] = useState('');
  const [codeType, setCodeType] = useState('VIP'); // 'VIP' or 'STANDARD'
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCodes();
  }, []);

  const fetchCodes = async () => {
    // 1. Fetch all access codes
    const { data: codesData, error: codesError } = await supabase
      .from('access_codes')
      .select('*')
      .order('created_at', { ascending: false });

    // 2. Fetch profiles table to match user ID to Email/Name
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*');

    if (!codesError && codesData) {
      const userMap = {};
      if (profilesData) {
        profilesData.forEach((profile) => {
          userMap[profile.id] = profile.email || profile.full_name || profile.id;
        });
      }

      const updatedCodes = codesData.map((item) => ({
        ...item,
        used_by_email: userMap[item.used_by] || item.used_by || 'Unknown User'
      }));

      setCodes(updatedCodes);
    }
  };

  const handleGenerateCode = async (e) => {
    e.preventDefault();
    setLoading(true);

    const prefix = codeType === 'VIP' ? 'VIP' : 'STD';
    const codeToCreate = newCode.trim()
      ? newCode.trim().toUpperCase()
      : `${prefix}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const { error } = await supabase
      .from('access_codes')
      .insert([{ code: codeToCreate, type: codeType, is_used: false }]);

    if (error) {
      alert("Error: " + error.message);
    } else {
      setNewCode('');
      fetchCodes();
    }

    setLoading(false);
  };

  const handleDeleteCode = async (id, codeName) => {
    const confirmDelete = window.confirm(`Sigurado ka bang gusto mong burahin ang code na "${codeName}"?`);
    if (!confirmDelete) return;

    const { error } = await supabase
      .from('access_codes')
      .delete()
      .eq('id', id);

    if (error) {
      alert("Failed to delete code: " + error.message);
    } else {
      fetchCodes();
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6 text-white">Access Code Generator</h1>

      {/* Generator Form */}
      <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-xl mb-8">
        <form onSubmit={handleGenerateCode} className="flex flex-col sm:flex-row gap-3">
          {/* Code Type Selector */}
          <select
            value={codeType}
            onChange={(e) => setCodeType(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-white font-bold focus:outline-none focus:border-red-500 cursor-pointer"
          >
            <option value="VIP">👑 VIP Code</option>
            <option value="STANDARD">👤 STANDARD Code</option>
          </select>

          <input
            type="text"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="e.g. VIP-GOLD-99 (or leave blank)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white uppercase focus:outline-none focus:border-red-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-red-600 hover:bg-red-500 disabled:bg-gray-800 text-white font-semibold px-6 py-3 rounded-xl transition-all cursor-pointer shrink-0"
          >
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </form>
      </div>

      {/* Codes List */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3 max-w-xl">
        <h2 className="text-lg font-bold text-gray-300 mb-4">Generated Access Codes ({codes.length})</h2>
        
        {codes.length === 0 ? (
          <p className="text-gray-500 text-sm">No access codes generated yet.</p>
        ) : (
          codes.map((c) => (
            <div 
              key={c.id} 
              className="bg-gray-800/50 p-4 rounded-xl flex justify-between items-center border border-gray-800 hover:border-gray-700 transition-all"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-mono font-bold text-yellow-400 text-lg tracking-wider">{c.code}</p>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded ${c.type === 'STANDARD' ? 'bg-blue-900/60 text-blue-400 border border-blue-800' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                    {c.type || 'VIP'}
                  </span>
                </div>
                
                {c.is_used && (
                  <p className="text-xs text-gray-400 mt-1">
                    👤 Used by:{' '}
                    <span className="text-blue-400 font-semibold">
                      {c.used_by_email}
                    </span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-3 py-1 rounded-full font-semibold ${
                    c.is_used 
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                      : 'bg-green-500/20 text-green-400 border border-green-500/30'
                  }`}
                >
                  {c.is_used ? 'USED' : 'AVAILABLE'}
                </span>

                <button
                  onClick={() => handleDeleteCode(c.id, c.code)}
                  title="Delete Access Code"
                  className="bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white p-2 rounded-lg border border-red-500/20 transition-all text-xs cursor-pointer"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}