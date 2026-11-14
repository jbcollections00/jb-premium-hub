import React from 'react';
import { Link } from 'react-router-dom';
import TopInviters from "../../components/TopInviters";

export default function LeaderboardPage() {
  return (
    <div className="jbh-page min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation / Header */}
        <div className="flex items-center justify-between mb-8">
          <Link 
            to="/home" 
            className="text-slate-400 hover:text-white flex items-center gap-2 transition-colors text-sm font-medium"
          >
            ← Back to Home
          </Link>
          <div className="text-right">
            <h1 className="text-2xl font-black text-white">JB Premium Hub</h1>
            <p className="jbh-eyebrow mt-1">Referral Program</p>
          </div>
        </div>

        {/* Leaderboard Component */}
        <TopInviters />

        {/* Info Section */}
        <div className="text-center mt-12 max-w-lg mx-auto">
          <p className="text-slate-500 text-xs">
            Referral rankings update as accounts qualify.
          </p>
        </div>
      </div>
    </div>
  );
}