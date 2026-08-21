import React, { useState } from "react";
import { supabase } from "../services/supabaseClient";

export default function EarnTokens({ userProfile, onTokenEarned }) {
  const [watchingAd, setWatchingAd] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const AD_DIRECT_LINK = "https://www.effectivecpmnetwork.com/tw8ajp18mf?key=786d474da794ee7cd3596da3aab40fcc";

  const startAdSession = () => {
    window.open(AD_DIRECT_LINK, "_blank");
    setWatchingAd(true);
    setCountdown(15);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          awardToken();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const awardToken = async () => {
    const newTokens = (userProfile?.watch_tokens || 0) + 1;
    const { error } = await supabase
      .from("profiles")
      .update({ watch_tokens: newTokens })
      .eq("id", userProfile.id);

    if (!error) {
      setWatchingAd(false);
      if (onTokenEarned) onTokenEarned(newTokens);
      alert("🎉 You earned 1 Watch Token!");
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center max-w-md mx-auto my-6">
      <h2 className="text-xl font-bold text-white mb-2">💰 Earn Watch Tokens</h2>
      <p className="text-slate-400 text-xs mb-4">
        Current Tokens: <span className="text-yellow-400 font-bold">{userProfile?.watch_tokens || 0}</span>
      </p>

      {watchingAd ? (
        <div className="bg-slate-950 p-4 rounded-xl border border-yellow-500/30 animate-pulse">
          <p className="text-sm text-yellow-400 font-bold">Verifying Ad View...</p>
          <p className="text-2xl font-black text-white mt-1">{countdown}s</p>
        </div>
      ) : (
        <button
          onClick={startAdSession}
          className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-red-600/30"
        >
          Watch Ad (+1 Watch Token) 🚀
        </button>
      )}
    </div>
  );
}