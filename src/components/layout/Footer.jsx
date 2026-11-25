import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function Footer() {
  const [onlineNow, setOnlineNow] = useState(0);
  const [stats, setStats] = useState({
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    totalVisits: 0,
  });

  useEffect(() => {
    let channel;
    let isMounted = true;

    const initializeFooter = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user?.id) {
          await logSiteVisit(user.id);
        }

        if (!user?.id || !isMounted) {
          setOnlineNow(0);
          return;
        }

        if (isMounted) {
          await fetchAnalytics();
        }

        const existingChannel = supabase
          .getChannels()
          .find((c) => c.topic === "realtime:online-users");

        if (existingChannel) {
          await supabase.removeChannel(existingChannel);
        }

        if (!isMounted) return;

        channel = supabase
          .channel("online-users", {
            config: {
              presence: { key: user.id },
            },
          })
          .on("presence", { event: "sync" }, () => {
            if (!isMounted || !channel) return;

            const state = channel.presenceState();
            const uniqueAccountCount = Object.keys(state).length;
            setOnlineNow(uniqueAccountCount);
          });

        channel.subscribe(async (status) => {
          if (status === "SUBSCRIBED" && isMounted && channel) {
            await channel.track({
              user_id: user.id,
              online_at: new Date().toISOString(),
            });
          }
        });
      } catch (error) {
        console.error("Footer initialization error:", error);
        if (isMounted) setOnlineNow(0);
      }
    };

    void initializeFooter();

    return () => {
      isMounted = false;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, []);

  const logSiteVisit = async (userId) => {
    if (!userId) return;

    const storageKey = `jb_visited_${userId}`;
    const hasVisited = sessionStorage.getItem(storageKey);

    if (hasVisited) return;

    sessionStorage.setItem(storageKey, "pending");

    try {
      const { error } = await supabase.rpc("log_site_visit");

      if (error) throw error;

      sessionStorage.setItem(storageKey, "true");
    } catch (error) {
      sessionStorage.removeItem(storageKey);
      console.error("Error logging account visit:", error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const { data, error } = await supabase.rpc('get_site_visit_stats');

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;

      setStats({
        today: Number(row?.today ?? 0),
        thisWeek: Number(row?.this_week ?? 0),
        thisMonth: Number(row?.this_month ?? 0),
        totalVisits: Number(row?.total_visits ?? 0).toLocaleString(),
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setStats({
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        totalVisits: 0,
      });
    }
  };

  return (
    <footer className="jbh-footer mt-auto border-t border-white/10 bg-[#090f1c]/90 px-4 py-9 text-slate-400 sm:px-6">
      <div className="mx-auto grid w-full max-w-7xl items-start gap-7 md:grid-cols-[1fr_auto] md:gap-10">
        <div>
          <Link to="/home" className="inline-flex items-center gap-3 text-slate-100" aria-label="JB Premium Hub home">
            <img src="/jb-logo.png" alt="" className="h-9 w-9 rounded-lg object-contain" />
            <span className="text-sm font-extrabold tracking-[.12em]">JB PREMIUM HUB</span>
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
            A simpler way to discover media and manage your membership.
          </p>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/dmca">Copyright</Link>
          <Link to="/support">Support</Link>
        </nav>
      </div>
      <div className="mx-auto mt-8 flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-slate-500">
        <span>© {new Date().getFullYear()} JB Collections. All rights reserved.</span>
        {onlineNow > 0 && (
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            {onlineNow} online
          </span>
        )}
      </div>
    </footer>
  );
}
