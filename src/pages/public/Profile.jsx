import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";

export default function Profile() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(user);
    } catch (error) {
      console.error("Error fetching user data:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper function para i-format ang petsa
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const options = { year: "numeric", month: "long", day: "numeric" };
    return new Date(dateString).toLocaleDateString("en-US", options);
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] bg-slate-950 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">My Profile</h1>
          <p className="text-slate-400 mt-1">Manage your account settings and preferences.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 🧑‍💼 Left Column: Avatar & Basic Info */}
          <div className="md:col-span-1 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-lg">
              <div className="w-24 h-24 mx-auto bg-slate-800 rounded-full flex items-center justify-center border-4 border-slate-950 shadow-inner mb-4 relative">
                <span className="text-3xl font-bold text-slate-400 uppercase">
                  {user?.email ? user.email.charAt(0) : "U"}
                </span>
                <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 border-4 border-slate-900 rounded-full" title="Online"></div>
              </div>
              <h2 className="text-lg font-semibold text-white truncate px-2">
                {user?.email || "No Email Found"}
              </h2>
              <span className="inline-block mt-2 px-3 py-1 bg-red-950/50 text-red-400 border border-red-900/50 rounded-full text-xs font-bold uppercase tracking-wide">
                Premium Member
              </span>
            </div>
          </div>

          {/* ⚙️ Right Column: Account Details & Actions */}
          <div className="md:col-span-2 space-y-6">
            
            {/* 📋 Account Information Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                Account Details
              </h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 pb-4 border-b border-slate-800/50">
                  <div className="text-slate-400 text-sm font-medium">User ID</div>
                  <div className="sm:col-span-2 text-sm text-slate-300 font-mono bg-slate-950/50 p-2 rounded-lg truncate">
                    {user?.id || "N/A"}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 pb-4 border-b border-slate-800/50">
                  <div className="text-slate-400 text-sm font-medium">Email Address</div>
                  <div className="sm:col-span-2 text-sm text-slate-200">
                    {user?.email || "N/A"}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
                  <div className="text-slate-400 text-sm font-medium">Member Since</div>
                  <div className="sm:col-span-2 text-sm text-slate-200">
                    {formatDate(user?.created_at)}
                  </div>
                </div>
              </div>
            </div>

            {/* 🛠️ Security / Actions Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                </svg>
                Security & Settings
              </h3>
              
              <p className="text-sm text-slate-400 mb-6">
                Keep your account secure by updating your password regularly.
              </p>

              <div className="flex flex-wrap gap-4">
                <button className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-red-900/20">
                  Change Password
                </button>
                <button className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-xl border border-slate-700 transition-colors">
                  Edit Profile
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}