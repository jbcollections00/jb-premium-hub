import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

export default function EventPopup() {
  const [activeEvent, setActiveEvent] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkActiveEvent();
  }, []);

  const checkActiveEvent = async () => {
    // Check kung na-close na ng user ang popup sa session na ito
    const hasSeenPopup = sessionStorage.getItem('jb_event_popup_seen');

    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (data && !hasSeenPopup) {
      setActiveEvent(data);
      setIsOpen(true);
    }
  };

  const handleClose = () => {
    sessionStorage.setItem('jb_event_popup_seen', 'true');
    setIsOpen(false);
  };

  const handleGoToContest = () => {
    sessionStorage.setItem('jb_event_popup_seen', 'true');
    setIsOpen(false);
    navigate('/contest');
  };

  if (!isOpen || !activeEvent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl relative">
        
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 bg-slate-950/70 hover:bg-slate-950 text-slate-300 hover:text-white w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer border border-slate-800"
        >
          ✕
        </button>

        {/* Clickable Event Banner / Image */}
        <div 
          onClick={handleGoToContest}
          className="cursor-pointer group relative overflow-hidden bg-slate-950"
        >
          <img
            src={activeEvent.banner_url || "/contest-banner-placeholder.png"}
            alt={activeEvent.title}
            className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
          
          <span className="absolute bottom-2 left-4 bg-amber-500 text-slate-950 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shadow">
            🔥 Active Event
          </span>
        </div>

        {/* Modal Details & Action Button */}
        <div className="p-5 space-y-4">
          <div>
            <h3 className="text-xl font-extrabold text-white leading-tight">
              {activeEvent.title}
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              {activeEvent.description || "Join our special referral challenge now and win free VIP access passes!"}
            </p>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs flex justify-between items-center">
            <span className="text-slate-400">Prize Pool:</span>
            <span className="text-emerald-400 font-bold">🎉 +{activeEvent.reward_vip_days || 14} Days VIP FREE</span>
          </div>

          <button
            onClick={handleGoToContest}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs py-3 rounded-xl transition-all shadow-lg shadow-amber-950/40 uppercase tracking-wider cursor-pointer"
          >
            🚀 View Contest Details & Join
          </button>
        </div>

      </div>
    </div>
  );
}