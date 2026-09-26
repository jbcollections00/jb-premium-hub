import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, AlertCircle, Send, RefreshCw, User, 
  ShieldAlert, ExternalLink, Image as ImageIcon, Zap, Trash2, FileText
} from 'lucide-react';

export default function SupportTicketsTab({ supabase }) {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Quick Response Templates
  const QUICK_TEMPLATES = [
    {
      id: 'thank_you',
      label: '🎁 VIP Approval & Thank You',
      text: `Thank you for your payment! Your payment proof has been verified, and your VIP Access is now active.\n\nThank you for supporting our platform! Enjoy your access.`
    },
    {
      id: 'vip_benefits',
      label: '⭐ VIP Member Benefits List',
      text: `🎉 Welcome to VIP Membership! Here are your exclusive VIP Benefits:\n\n✨ Full Unlimited Access to all Vault Videos\n🚀 Priority High-Speed Streaming & Media Access\n🎟️ Automatic Entry to Contests & Exclusive Events\n🎧 Priority 24/7 Customer Support\n\nThank you for being a valued VIP member!`
    },
    {
      id: 'request_receipt',
      label: '⚠️ Request Clearer Receipt',
      text: `Hello,\n\nWe received your support ticket, but the payment receipt uploaded was unclear or incomplete. Please reply with a full, clear screenshot of your transaction reference number so we can process your VIP status immediately.\n\nThank you!`
    }
  ];

  useEffect(() => {
    fetchTickets();
  }, [supabase]);

  useEffect(() => {
    if (selectedTicket) {
      fetchMessages(selectedTicket.id);
    }
  }, [selectedTicket]);

  const fetchTickets = async () => {
    if (!supabase) {
      setError('Supabase client is missing.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setTickets(data || []);
      if (data && data.length > 0 && !selectedTicket) {
        setSelectedTicket(data[0]);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch support tickets.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (ticketId) => {
    if (!supabase) return;

    try {
      setMessagesLoading(true);
      const { data, error: fetchError } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (fetchError) {
        if (fetchError.message?.includes('schema cache') || fetchError.code === '42P01') {
          setMessages([]);
          return;
        }
        throw fetchError;
      }
      setMessages(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load conversation history.');
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;
    if (!supabase) return;

    try {
      setSubmitting(true);
      const newMessage = {
        ticket_id: selectedTicket.id,
        sender_type: 'admin',
        message: replyText.trim(),
        created_at: new Date().toISOString()
      };

      const { data, error: sendError } = await supabase
        .from('ticket_messages')
        .insert([newMessage])
        .select()
        .single();

      if (sendError) throw sendError;

      await supabase
        .from('support_tickets')
        .update({ updated_at: new Date().toISOString(), status: 'in_progress' })
        .eq('id', selectedTicket.id);

      setMessages((prev) => [...prev, data]);
      setReplyText('');
      fetchTickets();
    } catch (err) {
      setError(err.message || 'Failed to send reply.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (ticketId, newStatus) => {
    if (!supabase) return;

    try {
      const { error: updateError } = await supabase
        .from('support_tickets')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', ticketId);

      if (updateError) throw updateError;

      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
      );
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket((prev) => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      setError(err.message || 'Failed to update status.');
    }
  };

  const handleDeleteTicket = async (ticketId) => {
    if (!ticketId || !supabase) return;

    const confirmed = window.confirm(
      "Sigurado ka bang gusto mong burahin ang ticket na ito?"
    );

    if (!confirmed) return;

    try {
      setDeleting(true);

      await supabase
        .from('ticket_messages')
        .delete()
        .eq('ticket_id', ticketId);

      const { error: deleteError } = await supabase
        .from('support_tickets')
        .delete()
        .eq('id', ticketId);

      if (deleteError) throw deleteError;

      const updatedTickets = tickets.filter((t) => t.id !== ticketId);
      setTickets(updatedTickets);

      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(updatedTickets.length > 0 ? updatedTickets[0] : null);
        setMessages([]);
      }
    } catch (err) {
      setError(err.message || 'Failed to delete ticket.');
    } finally {
      setDeleting(false);
    }
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const userIdent = (ticket.email || ticket.name || ticket.user_email || '').toLowerCase();
      const matchesSearch = userIdent.includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tickets, searchQuery, statusFilter]);

  // Helper Function: Kumuha ng URL sa loob ng text (Regular expression)
  const extractUrlFromText = (text) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+(?:\.jpg|\.jpeg|\.png|\.webp|\/storage\/v1\/object\/public\/[^\s]+))/i;
    const match = text.match(urlRegex);
    return match ? match[0] : null;
  };

  // Hanapin ang image URL sa receipt_url, attachment_url, o sa loob mismo ng message string
  const proofImageUrl = useMemo(() => {
    if (!selectedTicket) return null;
    if (selectedTicket.receipt_url) return selectedTicket.receipt_url;
    if (selectedTicket.attachment_url) return selectedTicket.attachment_url;
    return extractUrlFromText(selectedTicket.message);
  }, [selectedTicket]);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-slate-950 text-slate-100 rounded-xl border border-slate-800 overflow-hidden">
      {/* Top Search & Filter Bar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search user email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <button
          onClick={fetchTickets}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
          title="Refresh List"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg flex items-center justify-between text-sm shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 font-bold hover:text-red-300">
            ×
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Sidebar */}
        <div className="w-1/3 min-w-[220px] max-w-[320px] border-r border-slate-800 overflow-y-auto divide-y divide-slate-800/40 bg-slate-950">
          {loading ? (
            <div className="p-6 text-center text-slate-500 text-xs">Loading users...</div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs">No users found.</div>
          ) : (
            filteredTickets.map((ticket) => {
              const displayName = ticket.email || ticket.name || ticket.user_email || `User #${ticket.id}`;
              const isSelected = selectedTicket?.id === ticket.id;

              return (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={`p-3.5 cursor-pointer transition-all duration-150 hover:bg-slate-900/70 flex items-center gap-2.5 ${
                    isSelected ? 'bg-slate-900 border-l-4 border-indigo-500 text-white font-semibold' : 'text-slate-300'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-400 text-xs">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-xs truncate font-medium">{displayName}</span>
                    <span className="text-[10px] text-slate-500 truncate">{ticket.subject}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Conversation & Details View */}
        <div className="flex-1 flex flex-col bg-slate-950">
          {selectedTicket ? (
            <>
              {/* Header */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/30 flex items-center justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-100">
                      {selectedTicket.subject || 'VIP Payment Proof Verification'}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    User: <span className="text-indigo-400 font-medium">{selectedTicket.email || selectedTicket.name || 'Anonymous'}</span> 
                    <span className="mx-2">•</span> 
                    Submitted: {new Date(selectedTicket.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedTicket.status || 'pending'}
                    onChange={(e) => handleUpdateStatus(selectedTicket.id, e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="pending">Mark Pending</option>
                    <option value="open">Mark Open</option>
                    <option value="in_progress">Mark In Progress</option>
                    <option value="resolved">Mark Resolved</option>
                    <option value="closed">Mark Closed</option>
                  </select>

                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => handleDeleteTicket(selectedTicket.id)}
                    className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:border-rose-500/50 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                    title="Delete Ticket"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>{deleting ? 'Deleting...' : 'Delete'}</span>
                  </button>
                </div>
              </div>

              {/* Body Content */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                
                {/* 1. TEXT DETAILS (REFERENCE NUMBER) */}
                {selectedTicket.message && (
                  <div className="p-4 bg-slate-900/90 border border-indigo-500/30 rounded-xl space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                        <FileText className="w-4 h-4" /> Submitted Reference Details
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {new Date(selectedTicket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {selectedTicket.message}
                    </div>
                  </div>
                )}

                {/* 2. AUTOMATIC IMAGE PREVIEW CARD */}
                {proofImageUrl ? (
                  <div className="p-4 bg-slate-900/90 border border-amber-500/30 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4" /> Uploaded Payment Receipt Screenshot
                      </span>
                      <a 
                        href={proofImageUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                      >
                        Open Original Image <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* ANG LARAWAN MISMO */}
                    <div className="mt-2 rounded-lg overflow-hidden border border-slate-800 bg-black/60 p-2 flex justify-center">
                      <img 
                        src={proofImageUrl} 
                        alt="Payment Proof Receipt" 
                        className="max-h-96 w-auto object-contain rounded-md hover:scale-[1.01] transition-transform" 
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-900/40 border border-slate-800/60 rounded-xl text-xs text-slate-400 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-slate-500" /> Walang nakitang resibo o larawan sa ticket na ito.
                  </div>
                )}

                {/* 3. CONVERSATION / REPLIES */}
                {messagesLoading ? (
                  <div className="p-8 text-center text-slate-500 text-sm">Loading ticket conversation...</div>
                ) : messages.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-xs italic">
                    No admin replies sent yet. Send a reply below.
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isAdmin = msg.sender_type === 'admin';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col max-w-[85%] ${isAdmin ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400">
                          {isAdmin ? <ShieldAlert className="w-3 h-3 text-indigo-400" /> : <User className="w-3 h-3 text-slate-400" />}
                          <span className="font-medium text-slate-300">{isAdmin ? 'Support Admin' : (selectedTicket.email || 'User')}</span>
                          <span>•</span>
                          <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div
                          className={`p-3.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                            isAdmin
                              ? 'bg-indigo-600 text-white rounded-tr-none shadow-md'
                              : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                          }`}
                        >
                          {msg.message}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply Box */}
              <form onSubmit={handleSendReply} className="p-4 border-t border-slate-800 bg-slate-900/30 shrink-0 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400" /> Quick Reply:
                  </span>
                  <select
                    onChange={(e) => {
                      const template = QUICK_TEMPLATES.find(t => t.id === e.target.value);
                      if (template) {
                        setReplyText(template.text);
                      }
                      e.target.value = '';
                    }}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-indigo-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="">Select an automated response template...</option>
                    {QUICK_TEMPLATES.map((tmpl) => (
                      <option key={tmpl.id} value={tmpl.id}>
                        {tmpl.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <textarea
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type official support response or choose a Quick Reply above..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !replyText.trim()}
                    className="px-5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors shrink-0 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Send</span>
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Select a user from the list to view ticket details and messages.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}