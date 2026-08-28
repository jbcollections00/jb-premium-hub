import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function Footer() {
  const [onlineNow, setOnlineNow] = useState(1);
  const [stats, setStats] = useState({
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    totalVisits: 0,
  });

  useEffect(() => {
    let channel;
    let isMounted = true;

    logSiteVisit();
    fetchAnalytics();

    const setupPresence = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        let presenceKey = user?.id;
        if (!presenceKey) {
          presenceKey = sessionStorage.getItem('jb_guest_id');
          if (!presenceKey) {
            presenceKey = 'guest_' + Math.random().toString(36).substring(2, 9);
            sessionStorage.setItem('jb_guest_id', presenceKey);
          }
        }

        const existingChannel = supabase.getChannels().find(c => c.topic === 'realtime:online-users');
        if (existingChannel) {
          await supabase.removeChannel(existingChannel);
        }

        if (!isMounted) return;

        channel = supabase
          .channel('online-users', {
            config: { presence: { key: presenceKey } },
          })
          .on('presence', { event: 'sync' }, () => {
            if (!isMounted || !channel) return;
            const state = channel.presenceState();
            const count = Object.keys(state).length;
            setOnlineNow(count > 0 ? count : 1);
          });

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && isMounted && channel) {
            await channel.track({ online_at: new Date().toISOString() });
          }
        });

      } catch (error) {
        console.error('Presence setup error:', error);
      }
    };

    setupPresence();

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const logSiteVisit = async () => {
    try {
      const hasVisited = sessionStorage.getItem('jb_visited');
      if (!hasVisited) {
        await supabase.from('site_visits').insert({});
        sessionStorage.setItem('jb_visited', 'true');
      }
    } catch (error) {
      console.error('Error logging visit:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { count: total } = await supabase
        .from('site_visits')
        .select('*', { count: 'exact', head: true });

      const { count: today } = await supabase
        .from('site_visits')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfToday);

      const { count: week } = await supabase
        .from('site_visits')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfWeek);

      const { count: month } = await supabase
        .from('site_visits')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth);

      setStats({
        today: today || 0,
        thisWeek: week || 0,
        thisMonth: month || 0,
        totalVisits: (total || 0).toLocaleString(),
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  return (
    <footer className="bg-slate-950 border-t border-slate-900 text-slate-400 text-xs py-8 px-3 md:px-8 mt-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Real-Time Visitor Counter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
          
          {/* Online Now */}
          <div className="bg-slate-900/60 border border-emerald-500/40 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-300 text-[11px] font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="truncate">Online Now</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-emerald-400 mt-1.5">
              {onlineNow}
            </div>
          </div>

          {/* Today */}
          <div className="bg-slate-900/60 border border-sky-500/40 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-300 text-[11px] font-medium">
              <svg className="w-3.5 h-3.5 text-sky-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
              </svg>
              <span className="truncate">Today</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-sky-400 mt-1.5">
              {stats.today}
            </div>
          </div>

          {/* This Week */}
          <div className="bg-slate-900/60 border border-purple-500/40 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-300 text-[11px] font-medium">
              <svg className="w-3.5 h-3.5 text-purple-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
              </svg>
              <span className="truncate">This Week</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-purple-400 mt-1.5">
              {stats.thisWeek}
            </div>
          </div>

          {/* This Month */}
          <div className="bg-slate-900/60 border border-amber-500/40 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-300 text-[11px] font-medium">
              <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
              </svg>
              <span className="truncate">This Month</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-amber-400 mt-1.5">
              {stats.thisMonth}
            </div>
          </div>

          {/* Total Visits */}
          <div className="bg-slate-900/60 border border-pink-500/40 rounded-xl p-3 shadow-sm col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5 text-slate-300 text-[11px] font-medium">
              <svg className="w-3.5 h-3.5 text-pink-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span className="truncate">Total Visits</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-pink-500 mt-1.5">
              {stats.totalVisits}
            </div>
          </div>

        </div>

        {/* Footer Navigation Links - Icons on Small Screens */}
        <div className="pt-2 flex flex-wrap justify-center items-center gap-3 sm:gap-8 text-xs sm:text-sm font-medium text-slate-300">
          
          <Link to="/terms" className="flex items-center gap-1.5 hover:text-white transition-colors bg-slate-900/40 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-lg border border-slate-800 sm:border-0">
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Terms of Service</span>
          </Link>

          <Link to="/privacy" className="flex items-center gap-1.5 hover:text-white transition-colors bg-slate-900/40 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-lg border border-slate-800 sm:border-0">
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Privacy Policy</span>
          </Link>

          <Link to="/dmca" className="flex items-center gap-1.5 hover:text-white transition-colors bg-slate-900/40 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-lg border border-slate-800 sm:border-0">
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
            <span>DMCA</span>
          </Link>

          <Link to="/support" className="flex items-center gap-1.5 hover:text-white transition-colors bg-slate-900/40 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-lg border border-slate-800 sm:border-0">
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span>Contact Support</span>
          </Link>

        </div>

        {/* Copyright */}
        <div className="text-slate-500 text-center text-xs">
          © 2026 JB Collections. All rights reserved.
        </div>

      </div>
    </footer>
  );
}