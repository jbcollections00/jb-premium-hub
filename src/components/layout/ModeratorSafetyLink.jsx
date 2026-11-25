import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../services/supabaseClient";

export default function ModeratorSafetyLink() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let alive = true;
    let version = 0;
    let eventSeen = false;
    const check = async (session) => {
      if (!alive) return;
      const current = ++version;
      setAllowed(false);
      if (!session?.user?.id) return;
      try {
        const { data, error } = await supabase.rpc("jb_my_safety_reporting_status_v1");
        if (alive && current === version) setAllowed(!error && data?.reporting_enabled === true);
      } catch { if (alive && current === version) setAllowed(false); }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      eventSeen = true;
      ++version;
      if (alive) setAllowed(false);
      Promise.resolve().then(() => { if (alive) void check(session); });
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (alive && !eventSeen && !error) void check(data?.session);
    }).catch(() => {});
    return () => { alive = false; ++version; subscription?.unsubscribe(); };
  }, []);
  if (!allowed) return null;
  return <div className="mx-auto max-w-5xl px-4 py-3"><Link className="inline-flex rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700" to="/moderator/safety">Moderator Dashboard · Safety Reporting</Link></div>;
}
