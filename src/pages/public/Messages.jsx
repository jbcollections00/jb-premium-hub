import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";

export default function Messages() {
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserMessages();
  }, []);

  const fetchUserMessages = async () => {
    setLoading(true);
    
    // 1. Kukunin muna natin ang current logged-in user
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      // 2. Kukunin LANG ang mga mensahe na para sa user na ito gamit ang .eq("user_id", session.user.id)
      const { data, error } = await supabase
        .from("admin_messages")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching messages:", error.message);
      } else {
        setMessages(data || []);
        if (data && data.length > 0) {
          setSelectedMessage(data[0]); // Awtomatikong ipapakita ang pinakabagong mensahe
        }
      }
    }
    setLoading(false);
  };

  // Helper function para sa maayos na format ng petsa
  const formatDate = (dateString) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header Section */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <span className="p-2 bg-red-600/10 border border-red-600/20 rounded-xl text-red-500">
              📥
            </span>
            Admin Announcements
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Mga opisyal na abiso at mensahe mula sa JB Premium Vault Admin.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
          </div>
        ) : messages.length === 0 ? (
          /* Empty State - Kapag wala pang ibinababang mensahe ang Admin */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center shadow-lg my-8">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500 text-2xl">
              📭
            </div>
            <h3 className="text-lg font-bold text-white">Walang Bagong Mensahe</h3>
            <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">
              Wala pang ipinapadalang abiso o announcement ang Admin sa ngayon.
            </p>
          </div>
        ) : (
          /* Main Inbox Layout */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-h-[60vh]">
            
            {/* 📝 Message List (Kaliwa) */}
            <div className="md:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col">
              <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Inbox ({messages.length})
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                {messages.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedMessage(item)}
                    className={`p-4 rounded-xl cursor-pointer transition-all border ${
                      selectedMessage?.id === item.id
                        ? "bg-slate-800 border-red-600/50 shadow-md"
                        : "bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-red-950/80 text-red-400 rounded border border-red-900/50">
                        Admin
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {formatDate(item.created_at)}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-white truncate mt-1">
                      {item.title || "Opisyal na Abiso"}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                      {item.content || item.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 📖 Full Message Reader (Kanan) */}
            <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg flex flex-col justify-between">
              {selectedMessage ? (
                <div className="flex-1 flex flex-col">
                  {/* Sender Header */}
                  <div className="pb-6 border-b border-slate-800">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-md">
                        JB
                      </div>
                      <div>
                        <h2 className="text-md font-bold text-white flex items-center gap-2">
                          JB Vault Admin
                          <span className="bg-red-950 text-red-400 text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-red-900/50">
                            Official
                          </span>
                        </h2>
                        <p className="text-xs text-slate-400">
                          {formatDate(selectedMessage.created_at)}
                        </p>
                      </div>
                    </div>

                    <h1 className="text-xl font-bold text-white mt-4">
                      {selectedMessage.title || "Opisyal na Abiso"}
                    </h1>
                  </div>

                  {/* Body Content */}
                  <div className="py-6 text-slate-300 text-sm md:text-base leading-relaxed space-y-4 flex-1">
                    <p className="whitespace-pre-line">
                      {selectedMessage.content || selectedMessage.message}
                    </p>
                  </div>

                  {/* Reader Footer Notice */}
                  <div className="pt-4 border-t border-slate-800/80 text-xs text-slate-500 flex items-center gap-2">
                    <span>⚠️ Ang mensaheng ito ay direktang abiso mula sa System Admin.</span>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                  Pumili ng mensahe sa kaliwa upang mabasa ang kabuuan.
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}