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

    // 1. Log visit and fetch analytics
    logSiteVisit();
    fetchAnalytics();

    // 2. Setup Realtime Presence
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

        // Siguraduhing lilinisin muna ang anumang umiiral na channel sa pangalang ito
        const existingChannel = supabase.getChannels().find(c => c.topic === 'realtime:online-users');
        if (existingChannel) {
          await supabase.removeChannel(existingChannel);
        }

        if (!isMounted) return;

        // Gumawa ng bagong channel at i-chain ang listener BAGO mag-subscribe
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

        // Huli nating tatawagin ang subscribe
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
    <footer className="bg-slate-950 border-t border-slate-900 text-slate-400 text-xs py-8 px-4 md:px-8 mt-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Real-Time Visitor Counter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          
          <div className="bg-slate-900/60 border border-emerald-500/40 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-300 text-[11px] font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Online Now
            </div>
            <div className="text-xl font-bold text-emerald-400 mt-2">
              {onlineNow}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-sky-500/40 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-300 text-[11px] font-medium">
              <span>📅</span> Today
            </div>
            <div className="text-xl font-bold text-sky-400 mt-2">
              {stats.today}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-purple-500/40 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-300 text-[11px] font-medium">
              <span>📅</span> This Week
            </div>
            <div className="text-xl font-bold text-purple-400 mt-2">
              {stats.thisWeek}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-amber-500/40 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-slate-300 text-[11px] font-medium">
              <span>📅</span> This Month
            </div>
            <div className="text-xl font-bold text-amber-400 mt-2">
              {stats.thisMonth}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-pink-500/40 rounded-xl p-3 shadow-sm col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5 text-slate-300 text-[11px] font-medium">
              <span>📊</span> Total Visits
            </div>
            <div className="text-xl font-bold text-pink-500 mt-2">
              {stats.totalVisits}
            </div>
          </div>

        </div>

        {/* Navigation Links */}
        <div className="pt-2 flex flex-wrap justify-center items-center gap-6 sm:gap-8 text-sm font-medium text-slate-300">
          <Link to="/terms" className="hover:text-white transition-colors">
            Terms of Service
          </Link>
          <Link to="/privacy" className="hover:text-white transition-colors">
            Privacy Policy
          </Link>
          <Link to="/dmca" className="hover:text-white transition-colors">
            DMCA
          </Link>
          <Link to="/support" className="hover:text-white transition-colors">
            Contact Support
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