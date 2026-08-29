import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from "../../services/supabaseClient";

export default function Contest() {
  const [activeEvent, setActiveEvent] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [contestData, setContestData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    fetchContestDetails();
  }, []);

  const fetchContestDetails = async () => {
    try {
      // 1. Fetch Active Event Info
      const { data: event } = await supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      setActiveEvent(event);

      // 2. Fetch User & Progress
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        setUserProfile(profile);

        const { data: contest } = await supabase.rpc('get_or_create_active_contest', {
          p_user_id: user.id,
        });
        if (contest && contest.length > 0) setContestData(contest[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    const code = userProfile?.referral_code || '';
    const link = `${window.location.origin}/signup?ref=${code}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  if (!activeEvent) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-bold">No Active Contest Right Now</h2>
        <p className="text-xs text-slate-400 mt-1">Check back later for future referral events!</p>
        <button
          onClick={() => navigate('/home')}
          className="mt-4 bg-slate-800 hover:bg-slate-700 text-xs text-white px-4 py-2 rounded-xl"
        >
          Return to Home
        </button>
      </div>
    );
  }

  const referralCode = userProfile?.referral_code || '';
  const inviteLink = `${window.location.origin}/signup?ref=${referralCode}`;
  const targetReferrals = activeEvent.req_referrals || 10;
  const currentReferrals = contestData?.qualified_referrals_count || 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-10 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Event Header Banner */}
        <div className="relative rounded-2xl overflow-hidden border border-amber-500/30 bg-slate-900 shadow-2xl">
          <img
            src={activeEvent.banner_url || "/contest-banner-placeholder.png"}
            alt="Contest Banner"
            className="w-full h-56 object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent p-6 flex flex-col justify-end">
            <span className="bg-amber-500 text-slate-950 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full w-max mb-2">
              Official Site Event
            </span>
            <h1 className="text-3xl font-black">{activeEvent.title}</h1>
            <p className="text-xs text-slate-300 mt-1">{activeEvent.description}</p>
          </div>
        </div>

        {/* User Invite & Progress Section */}
        {userProfile ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
            <div>
              <h2 className="text-lg font-bold text-amber-400">🎁 Your Exclusive Invite Link</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Share this link with your friends. Once they register and complete the watch requirement, your progress increases!
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="flex-1 bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 rounded-xl px-4 py-3 focus:outline-none"
              />
              <button
                onClick={handleCopy}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs px-6 py-3 rounded-xl transition-all cursor-pointer shrink-0"
              >
                {copied ? "✓ Copied!" : "📋 Copy Link"}
              </button>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex justify-between text-xs font-bold">
                <span>Progress:</span>
                <span className="text-amber-400">{currentReferrals} / {targetReferrals} Qualified Invites</span>
              </div>
              <div className="w-full bg-slate-950 h-3.5 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full transition-all duration-500"
                  style={{ width: `${Math.min((currentReferrals / targetReferrals) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
            <p className="text-xs text-slate-300">You must be logged in to track your contest progress and get your invite link.</p>
            <button
              onClick={() => navigate('/login')}
              className="bg-red-600 hover:bg-red-500 text-xs font-bold px-6 py-2.5 rounded-xl text-white"
            >
              Log In Now
            </button>
          </div>
        )}

        {/* Rules Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">📜 Challenge Rules</h3>
          <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
            <li>Invited users must register using your unique link.</li>
            <li>Referred users must watch at least 10 videos in a single day to count as qualified.</li>
            <li>You must also maintain active account engagement.</li>
            <li>Rewards are automatically credited once the target target is achieved.</li>
          </ul>
        </div>

      </div>
    </div>
  );
}