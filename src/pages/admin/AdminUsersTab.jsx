import React from 'react';
import { supabase } from '../../services/supabaseClient';

export default function AdminUsersTab({ users, fetchData }) {

  const handleToggleUserTier = async (userId, currentType) => {
    const isVip = currentType?.toLowerCase() === 'vip';
    const newType = isVip ? 'standard' : 'vip';

    const { error } = await supabase
      .from('profiles')
      .update({ account_type: newType, is_activated: newType === 'vip' })
      .eq('id', userId);

    if (error) alert('Failed to update user tier: ' + error.message);
    else fetchData();
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("⚠️ BABALA: Sigurado ka bang gusto mong burahin ang user na ito? Hindi na ito mababawi.")) return;

    // Buburahin ang user profile sa database
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    
    if (error) {
      alert("Error deleting user: " + error.message);
    } else {
      alert("User successfully deleted!");
      fetchData(); // I-refresh ang listahan
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
      {users.length === 0 ? (
        <p className="text-gray-500 text-sm text-center">Wala pang registered users.</p>
      ) : (
        users.map((u) => {
          const isVip = u.account_type?.toLowerCase() === 'vip' || u.is_activated;
          return (
            <div key={u.id} className="bg-gray-800/50 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center border border-gray-800 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-white">{u.full_name || u.email || 'No Name'}</p>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${isVip ? 'bg-amber-500 text-black' : 'bg-blue-600/30 text-blue-400 border border-blue-500/30'}`}>
                    {isVip ? 'VIP' : 'STANDARD'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">ID: {u.id}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Watch Tokens: <b className="text-amber-400">{u.watch_tokens || 0}</b> | Daily Views Used: <b className="text-white">{u.daily_views_count || 0}/5</b>
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleToggleUserTier(u.id, u.account_type)}
                  className={`text-xs px-3 py-2 rounded-xl font-bold cursor-pointer transition-all ${
                    isVip ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-600 hover:text-white' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white'
                  }`}
                >
                  {isVip ? 'Demote' : 'Promote 👑'}
                </button>
                
                {/* 🟢 BAGONG DELETE BUTTON */}
                <button
                  onClick={() => handleDeleteUser(u.id)}
                  className="bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white text-xs px-3 py-2 rounded-xl font-bold transition-all border border-gray-600 hover:border-red-600"
                >
                  Delete 🗑️
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}