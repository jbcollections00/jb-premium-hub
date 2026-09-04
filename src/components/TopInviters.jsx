import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

export default function TopInviters() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      // Tinatawag nito yung ginawa nating SQL function kanina
      const { data, error } = await supabase.rpc('get_top_inviters');
      if (error) throw error;
      setLeaderboard(data || []);
    } catch (error) {
      console.error('Error fetching leaderboard:', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <span className="text-indigo-400 text-xs font-bold animate-pulse">Loading Leaderboard...</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-2xl max-w-md mx-auto">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-4">
        <span className="text-3xl">🏆</span>
        <div>
          <h2 className="text-lg font-black text-white tracking-wide">Top 10 Inviters</h2>
          <p className="text-[10px] text-slate-400">Registered accounts only. Guest invites are not counted.</p>
        </div>
      </div>

      {leaderboard.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-xs">
          Wala pang nakakapasok sa leaderboard. Magsimula nang mag-invite!
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((user, index) => (
            <div 
              key={user.inviter_id} 
              className="flex items-center justify-between p-3 bg-slate-950/50 rounded-xl border border-slate-800/80 hover:border-indigo-500/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`text-sm font-black w-6 text-center ${
                  index === 0 ? 'text-amber-400' : 
                  index === 1 ? 'text-slate-300' : 
                  index === 2 ? 'text-amber-700' : 'text-slate-500'
                }`}>
                  #{index + 1}
                </span>
                <span className="text-sm font-bold text-slate-200">
                  {user.full_name || 'Unknown User'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                <span className="text-indigo-400 font-black text-sm">{user.invite_count}</span>
                <span className="text-[10px] text-indigo-400/70 font-bold uppercase tracking-wider">Invites</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}