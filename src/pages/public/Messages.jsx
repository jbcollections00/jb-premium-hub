import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";

export default function Messages() {
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserMessages();

    // Live Realtime listener para sa mga pagbabago sa database
    const channel = supabase
      .channel("admin_messages_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_messages" },
        () => {
          fetchUserMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Isang function para sa sabay na pag-update ng UI at Database kapag nabasa ang message
  const markAsReadInDBAndLocal = async (msgId) => {
    // 1. Instant Local State Update
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, is_read: true } : m))
    );
    setSelectedMessage((prev) =>
      prev?.id === msgId ? { ...prev, is_read: true } : prev
    );

    // 2. I-notify ang Navbar para mag-update agad ang badge number
    window.dispatchEvent(new Event("messagesUpdated"));

    // 3. Supabase Database Update
    const { error } = await supabase
      .from("admin_messages")
      .update({ is_read: true })
      .eq("id", msgId);

    if (error) {
      console.error("Error updating read status in DB:", error.message);
    }
  };

  const fetchUserMessages = async () => {
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      const { data, error } = await supabase
        .from("admin_messages")
        .select("*")
        .or(`user_id.eq.${session.user.id},send_to_all.eq.true`)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching messages:", error.message);
      } else {
        setMessages(data || []);

        if (data && data.length > 0) {
          const firstMsg = data[0];
          setSelectedMessage(firstMsg);

          // 🚀 KAPAG NAKALOAD ANG PAGE AT UNREAD ANG UNANG MESSAGE, I-MARK AS READ AGAD NITO SA DB AT NAVBAR
          if (!firstMsg.is_read) {
            markAsReadInDBAndLocal(firstMsg.id);
          }
        } else {
          setSelectedMessage(null);
        }

        window.dispatchEvent(new Event("messagesUpdated"));
      }
    }
    setLoading(false);
  };

  // ✉️ MARK AS READ BUTTON
  const handleMarkAsRead = async (msgId, e) => {
    if (e) e.stopPropagation();
    await markAsReadInDBAndLocal(msgId);
  };

  // 📩 MARK AS UNREAD BUTTON
  const handleMarkAsUnread = async (msgId, e) => {
    if (e) e.stopPropagation();

    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, is_read: false } : m))
    );
    setSelectedMessage((prev) =>
      prev?.id === msgId ? { ...prev, is_read: false } : prev
    );
    window.dispatchEvent(new Event("messagesUpdated"));

    const { error } = await supabase
      .from("admin_messages")
      .update({ is_read: false })
      .eq("id", msgId);

    if (error) {
      console.error("Error updating unread status in DB:", error.message);
    }
  };

  // 🗑️ DELETE MESSAGE BUTTON
  const handleDeleteMessage = async (msgId, e) => {
    if (e) e.stopPropagation();

    if (!confirm("Sigurado ka bang gusto mong burahin ang mensaheng ito?")) return;

    const remaining = messages.filter((m) => m.id !== msgId);
    setMessages(remaining);

    if (selectedMessage?.id === msgId) {
      const nextMsg = remaining.length > 0 ? remaining[0] : null;
      setSelectedMessage(nextMsg);
      if (nextMsg && !nextMsg.is_read) {
        markAsReadInDBAndLocal(nextMsg.id);
      }
    }
    window.dispatchEvent(new Event("messagesUpdated"));

    const { error } = await supabase
      .from("admin_messages")
      .delete()
      .eq("id", msgId);

    if (error) {
      alert("Bigo sa pagbura: " + error.message);
      fetchUserMessages();
    }
  };

  // Kapag kinlik ang ibang mensahe sa kaliwang listahan
  const handleSelectMessage = (item) => {
    setSelectedMessage(item);
    if (!item.is_read) {
      markAsReadInDBAndLocal(item.id);
    }
  };

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

  const unreadCount = messages.filter((m) => !m.is_read).length;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header Section */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <span className="p-2 bg-red-600/10 border border-red-600/20 rounded-xl text-red-500">
              📢
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center shadow-lg my-8">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500 text-2xl">
              📥
            </div>
            <h3 className="text-lg font-bold text-white">Walang Bagong Mensahe</h3>
            <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">
              Wala pang ipinapadalang abiso o announcement ang Admin sa ngayon.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-h-[60vh]">
            
            {/* 📥 Inbox List (Kaliwa) */}
            <div className="md:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col">
              <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Inbox ({messages.length})
                </span>
                {unreadCount > 0 && (
                  <span className="bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {unreadCount} UNREAD
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                {messages.map((item) => {
                  const isSelected = selectedMessage?.id === item.id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectMessage(item)}
                      className={`p-4 rounded-xl cursor-pointer transition-all border relative ${
                        isSelected
                          ? "bg-slate-800 border-red-600/50 shadow-md"
                          : item.is_read
                          ? "bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/50 opacity-75"
                          : "bg-slate-900 border-sky-500/40 hover:border-sky-400"
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

                      <h3 className={`text-sm font-semibold truncate mt-1 flex items-center gap-1.5 ${!item.is_read ? 'text-white' : 'text-slate-300'}`}>
                        {!item.is_read && (
                          <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0 inline-block animate-pulse" />
                        )}
                        {item.title || "Opisyal na Abiso"}
                      </h3>

                      <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                        {item.content || item.message}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 💬 Reader Panel (Kanan) */}
            <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg flex flex-col justify-between">
              {selectedMessage ? (
                <div className="flex-1 flex flex-col">
                  {/* Sender & Action Bar */}
                  <div className="pb-6 border-b border-slate-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-md shrink-0">
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

                      {/* 🛠️ Action Buttons (Mark Read / Mark Unread / Delete) */}
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {selectedMessage.is_read ? (
                          <button
                            onClick={(e) => handleMarkAsUnread(selectedMessage.id, e)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                            title="Mark as Unread"
                          >
                            📩 Mark Unread
                          </button>
                        ) : (
                          <button
                            onClick={(e) => handleMarkAsRead(selectedMessage.id, e)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                            title="Mark as Read"
                          >
                            ✅ Mark Read
                          </button>
                        )}

                        <button
                          onClick={(e) => handleDeleteMessage(selectedMessage.id, e)}
                          className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-900/50 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                          title="Delete Message"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>

                    <h1 className="text-xl font-bold text-white mt-4 flex items-center gap-2">
                      <span>🔑</span> {selectedMessage.title || "Opisyal na Abiso"}
                    </h1>
                  </div>

                  {/* Message Body */}
                  <div className="py-6 text-slate-300 text-sm md:text-base leading-relaxed space-y-4 flex-1">
                    <p className="whitespace-pre-line bg-slate-950/50 border border-slate-800/80 p-5 rounded-2xl font-mono text-xs md:text-sm">
                      {selectedMessage.content || selectedMessage.message}
                    </p>
                  </div>

                  {/* Footer Notice */}
                  <div className="pt-4 border-t border-slate-800/80 text-xs text-amber-400/90 flex items-center gap-2 bg-amber-500/5 p-3 rounded-xl border border-amber-500/10">
                    <span>⚠️</span>
                    <span>Ang mensaheng ito ay direktang abiso mula sa System Admin.</span>
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