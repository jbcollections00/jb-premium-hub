import React, { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";

export default function Messages() {
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Private attachment preview state
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState("");
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");

  // State to control mobile view toggle (Messenger style)
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);

  useEffect(() => {
    let adminMessagesChannel = null;
    let userStatusChannel = null;
    let isMounted = true;

    const setup = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;

      if (!isMounted) return;

      setCurrentUserId(userId);
      await fetchUserMessages(userId);

      // Refresh when admin announcements change.
      adminMessagesChannel = supabase
        .channel("admin_messages_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "admin_messages" },
          () => {
            fetchUserMessages(userId);
          }
        )
        .subscribe();

      // Also refresh when this user's read/delete state changes
      // (useful if the account is open on another device/tab).
      if (userId) {
        userStatusChannel = supabase
          .channel(`user_message_status_${userId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "user_message_status",
              filter: `user_id=eq.${userId}`,
            },
            () => {
              fetchUserMessages(userId);
            }
          )
          .subscribe();
      }
    };

    setup();

    return () => {
      isMounted = false;

      if (adminMessagesChannel) {
        supabase.removeChannel(adminMessagesChannel);
      }

      if (userStatusChannel) {
        supabase.removeChannel(userStatusChannel);
      }
    };
  }, []);

  // When the currently displayed message changes, mark only that
  // user's status row as read. Realtime refreshes preserve the same
  // selected message ID, so they do not keep replacing what is open.
  useEffect(() => {
    if (
      currentUserId &&
      selectedMessage?.id &&
      !selectedMessage.is_read
    ) {
      markAsReadInDBAndLocal(selectedMessage.id);
    }
  }, [selectedMessage?.id, currentUserId]);

  // Generate a short-lived URL for private vault_media attachments.
  useEffect(() => {
    let cancelled = false;

    const loadAttachment = async () => {
      setAttachmentPreviewUrl("");
      setAttachmentError("");

      const storedValue = selectedMessage?.attachment_url?.trim();

      if (!storedValue) {
        setAttachmentLoading(false);
        return;
      }

      // Legacy/external URLs can still be displayed directly.
      if (/^https?:\/\//i.test(storedValue)) {
        setAttachmentPreviewUrl(storedValue);
        setAttachmentLoading(false);
        return;
      }

      try {
        setAttachmentLoading(true);

        const { data, error } = await supabase.storage
          .from("vault_media")
          .createSignedUrl(storedValue, 600);

        if (error) throw error;

        if (!cancelled) {
          setAttachmentPreviewUrl(data?.signedUrl || "");
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error creating attachment signed URL:", error.message);
          setAttachmentError(
            error?.message || "Unable to load this private attachment."
          );
          setAttachmentPreviewUrl("");
        }
      } finally {
        if (!cancelled) {
          setAttachmentLoading(false);
        }
      }
    };

    loadAttachment();

    return () => {
      cancelled = true;
    };
  }, [selectedMessage?.id, selectedMessage?.attachment_url]);

  const updateLocalMessageState = (msgId, patch) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, ...patch } : m))
    );

    setSelectedMessage((prev) =>
      prev?.id === msgId ? { ...prev, ...patch } : prev
    );
  };

  const upsertUserMessageStatus = async (msgId, patch) => {
    if (!currentUserId) {
      throw new Error("No authenticated user found.");
    }

    const { error } = await supabase
      .from("user_message_status")
      .upsert(
        {
          user_id: currentUserId,
          message_id: msgId,
          ...patch,
        },
        { onConflict: "user_id,message_id" }
      );

    if (error) throw error;
  };

  // Mark read for this user only.
  const markAsReadInDBAndLocal = async (msgId) => {
    updateLocalMessageState(msgId, { is_read: true });

    window.dispatchEvent(new Event("messagesUpdated"));

    try {
      await upsertUserMessageStatus(msgId, {
        is_read: true,
        is_deleted: false,
        read_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error updating read status:", error.message);
      fetchUserMessages(currentUserId);
    }
  };

  const fetchUserMessages = async (knownUserId = null) => {
    setLoading(true);

    try {
      let userId = knownUserId;

      if (!userId) {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id || null;
      }

      if (!userId) {
        setMessages([]);
        setSelectedMessage(null);
        return;
      }

      const { data: adminMessages, error: messagesError } = await supabase
        .from("admin_messages")
        .select("*")
        .or(`user_id.eq.${userId},and(send_to_all.eq.true,user_id.is.null)`)
        .order("created_at", { ascending: false });

      if (messagesError) throw messagesError;

      const baseMessages = adminMessages || [];

      if (baseMessages.length === 0) {
        setMessages([]);
        setSelectedMessage(null);
        return;
      }

      const messageIds = baseMessages.map((m) => m.id);

      const { data: statuses, error: statusError } = await supabase
        .from("user_message_status")
        .select("message_id, is_read, is_deleted, read_at")
        .eq("user_id", userId)
        .in("message_id", messageIds);

      if (statusError) throw statusError;

      const statusMap = new Map(
        (statuses || []).map((status) => [status.message_id, status])
      );

      const mergedMessages = baseMessages
        .map((message) => {
          const status = statusMap.get(message.id);

          return {
            ...message,
            is_read: status?.is_read ?? false,
            is_deleted: status?.is_deleted ?? false,
            read_at: status?.read_at ?? null,
          };
        })
        .filter((message) => !message.is_deleted);

      setMessages(mergedMessages);

      // Preserve the message the user is currently reading.
      // Only fall back to the newest visible message if the previous
      // selection no longer exists.
      setSelectedMessage((prev) => {
        if (mergedMessages.length === 0) return null;

        if (prev?.id) {
          const refreshed = mergedMessages.find((m) => m.id === prev.id);
          if (refreshed) return refreshed;
        }

        return mergedMessages[0];
      });

      window.dispatchEvent(new Event("messagesUpdated"));
    } catch (error) {
      console.error("Error fetching messages:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (msgId, e) => {
    if (e) e.stopPropagation();
    await markAsReadInDBAndLocal(msgId);
  };

  const handleMarkAsUnread = async (msgId, e) => {
    if (e) e.stopPropagation();

    updateLocalMessageState(msgId, { is_read: false });
    window.dispatchEvent(new Event("messagesUpdated"));

    try {
      await upsertUserMessageStatus(msgId, {
        is_read: false,
        is_deleted: false,
        read_at: null,
      });
    } catch (error) {
      console.error("Error updating unread status:", error.message);
      fetchUserMessages(currentUserId);
    }
  };

  const handleDeleteMessage = async (msgId, e) => {
    if (e) e.stopPropagation();

    if (!confirm("Sigurado ka bang gusto mong burahin ang mensaheng ito?")) {
      return;
    }

    const remaining = messages.filter((m) => m.id !== msgId);
    setMessages(remaining);

    if (selectedMessage?.id === msgId) {
      const nextMsg = remaining.length > 0 ? remaining[0] : null;
      setSelectedMessage(nextMsg);

      if (!nextMsg) {
        setIsMobileDetailOpen(false);
      }
    }

    window.dispatchEvent(new Event("messagesUpdated"));

    try {
      // Soft-delete only this user's inbox state.
      // The shared admin_messages row is never deleted here.
      await upsertUserMessageStatus(msgId, {
        is_deleted: true,
      });
    } catch (error) {
      alert("Bigo sa pagbura: " + error.message);
      fetchUserMessages(currentUserId);
    }
  };

  const handleSelectMessage = (item) => {
    setSelectedMessage(item);
    setIsMobileDetailOpen(true);

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

  const getPreviewText = (text) => {
    if (!text) return "";
    return text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  };

  const renderFormattedContent = (content) => {
    if (!content) return null;

    const lines = content.split("\n");

    return (
      <div className="space-y-3 font-sans text-slate-200">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={idx} className="h-1" />;

          const isBullet =
            trimmed.startsWith("•") ||
            trimmed.startsWith("-") ||
            trimmed.startsWith("*");

          if (isBullet) {
            const textOnly = trimmed.replace(/^[•\-\*]\s*/, "");
            const isVideo =
              textOnly.match(/\.(mp4|mkv|mov|avi|webm)$/i) ||
              textOnly.toLowerCase().includes("video");

            return (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-sky-500/30 transition-all group"
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center text-sm shadow-sm">
                  {isVideo ? "🎬" : "📌"}
                </span>
                <span className="text-xs md:text-sm font-medium text-slate-200 break-all group-hover:text-sky-300 transition-colors">
                  {textOnly}
                </span>
              </div>
            );
          }

          return (
            <p key={idx} className="text-sm md:text-base text-slate-300 leading-relaxed">
              {line}
            </p>
          );
        })}
      </div>
    );
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
            <div
              className={`md:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col ${
                isMobileDetailOpen ? "hidden md:flex" : "flex"
              }`}
            >
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
                        {getPreviewText(item.content || item.message)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 💬 Reader Panel (Kanan) */}
            <div
              className={`md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-lg flex flex-col justify-between ${
                isMobileDetailOpen ? "flex" : "hidden md:flex"
              }`}
            >
              {selectedMessage ? (
                <div className="flex-1 flex flex-col">
                  {/* Mobile Back Button */}
                  <button
                    onClick={() => setIsMobileDetailOpen(false)}
                    className="md:hidden mb-4 flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl transition-all cursor-pointer w-fit"
                  >
                    ← Back to Messages
                  </button>

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

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 self-start sm:self-auto">
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
                  <div className="py-6 flex-1">
                    <div className="bg-slate-950/40 border border-slate-800/80 p-5 rounded-2xl shadow-inner">
                      {renderFormattedContent(selectedMessage.content || selectedMessage.message)}
                    </div>

                    {/* Private Attachment Display */}
                    {selectedMessage.attachment_url && (
                      <div className="mt-4 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 p-2">
                        {attachmentLoading ? (
                          <div className="min-h-32 flex items-center justify-center gap-2 text-xs text-slate-400">
                            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-400"></span>
                            Loading secure attachment...
                          </div>
                        ) : attachmentError ? (
                          <div className="p-4 text-xs text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-lg">
                            Unable to load attachment: {attachmentError}
                          </div>
                        ) : attachmentPreviewUrl ? (
                          selectedMessage.attachment_type === "image" ||
                          selectedMessage.attachment_url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                            <img
                              src={attachmentPreviewUrl}
                              alt="Attachment"
                              className="w-full max-h-[450px] object-contain rounded-lg"
                            />
                          ) : (
                            <video
                              src={attachmentPreviewUrl}
                              controls
                              preload="metadata"
                              className="w-full max-h-[450px] rounded-lg"
                            />
                          )
                        ) : (
                          <div className="p-4 text-xs text-slate-500">
                            No attachment preview is available.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer Notice */}
                  <div className="pt-4 border-t border-slate-800/80 text-xs text-amber-400/90 flex items-center gap-2 bg-amber-500/5 p-3 rounded-xl border border-amber-500/10">
                    <span>⚠️</span>
                    <span>Ang mensaheng ito ay direktang abiso mula sa System Admin.</span>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-sm py-12">
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