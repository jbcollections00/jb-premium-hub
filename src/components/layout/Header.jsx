import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function Header() {
  const [messageCount, setMessageCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    fetchMessageCount();
  }, []);

  const fetchMessageCount = async () => {
    try {
      // Kukunin ang kabuuang bilang ng admin messages sa database
      const { count, error } = await supabase
        .from("admin_messages")
        .select("*", { count: "exact", head: true });

      if (!error && count !== null) {
        setMessageCount(count);
      }
    } catch (err) {
      console.error("Error fetching message count:", err);
    }
  };

  const handleLogout = () => {
    navigate('/');
  };

  return (
    <header className="bg-gray-900/90 backdrop-blur-md border-b border-gray-800/80 text-white px-6 py-3.5 flex justify-between items-center relative z-40 sticky top-0 shadow-lg">
      
      {/* 1️⃣ Brand Logo & Title */}
      <Link to="/home" className="flex items-center gap-3.5 group">
        
        {/* Modern Glowing Container para sa Custom Logo */}
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-purple-600 to-indigo-600 p-[1.5px] shadow-md shadow-purple-500/20 group-hover:shadow-purple-500/40 group-hover:scale-105 transition-all duration-300">
          <div className="w-full h-full bg-gray-900 rounded-[10.5px] flex items-center justify-center p-1.5 overflow-hidden">
            {/* 📍 Bagong Logo Img mula sa Public Folder */}
            <img 
              src="/logo.png" 
              alt="JB Logo" 
              className="w-full h-full object-contain filter brightness-120 group-hover:scale-110 transition-transform duration-300"
            />
          </div>
        </div>

        {/* Brand Text & Subtitle */}
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              JB
            </span>
            <span className="text-xl font-semibold tracking-wide text-white">
              PREMIUM
            </span>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-widest">
              HUB
            </span>
          </div>

          <span className="text-[11px] text-gray-400 font-medium tracking-wider uppercase mt-1">
            Premium Vault & Media Gallery
          </span>
        </div>
      </Link>

      {/* 2️⃣ User Controls */}
      <div className="flex items-center gap-5">
        {/* 👤 Profile Link */}
        <Link to="/profile" className="text-gray-300 hover:text-white flex items-center gap-2 transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-xs text-white shadow-md">
            U
          </div>
          <span className="hidden sm:inline text-sm font-medium">Profile</span>
        </Link>

        {/* 💬 Messages Link with Dynamic Badge */}
        <Link 
          to="/messages"
          className="text-gray-300 hover:text-white flex items-center gap-1.5 transition-colors text-sm font-medium"
        >
          <span>💬 Messages</span>
          {/* Lilitaw lang ang bilog kapag higit sa 0 ang messages */}
          {messageCount > 0 && (
            <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-bold shadow-sm">
              {messageCount}
            </span>
          )}
        </Link>

        {/* 🚪 Logout Button */}
        <button 
          onClick={handleLogout}
          className="bg-red-500/10 text-red-400 hover:bg-red-600 hover:text-white text-sm px-3.5 py-1.5 rounded-lg border border-red-500/20 font-medium transition-all cursor-pointer shadow-sm active:scale-95"
        >
          Logout
        </button>
      </div>
    </header>
  );
}