import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Filter, AlertCircle, CheckCircle, Clock, 
  MessageSquare, Send, RefreshCw, User, ShieldAlert 
} from 'lucide-react';

export default function SupportTicketsTab({ supabase }) {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  useEffect(() => {
    fetchTickets();
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      fetchMessages(selectedTicket.id);
    }
  }, [selectedTicket]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('support_tickets')
        .select('*')
        .order('updated_at', { ascending: false });

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
    try {
      setMessagesLoading(true);
      const { data, error: fetchError } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
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

      // Update parent ticket timestamp & status if pending customer reply
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

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const matchesSearch =
        ticket.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.id?.toString().includes(searchQuery);
      const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || ticket.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tickets, searchQuery, statusFilter, priorityFilter]);

  const getStatusBadge = (status) => {
    const styles = {
      open: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      resolved: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      closed: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded border ${styles[status] || styles.closed}`}>
        {status?.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 rounded-xl border border-slate-800 overflow-hidden">
      {/* Top Controls Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by ticket ID, subject, or email..."
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
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none"
          >
            <option value="all">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <button
          onClick={fetchTickets}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
          title="Refresh Tickets"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 font-bold hover:text-red-300">
            ×
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Ticket List Sidebar */}
        <div className="w-1/3 border-r border-slate-800 overflow-y-auto divide-y divide-slate-800/50">
          {loading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading tickets...</div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No tickets found matching criteria.</div>
          ) : (
            filteredTickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                className={`p-4 cursor-pointer transition-colors hover:bg-slate-900/60 ${
                  selectedTicket?.id === ticket.id ? 'bg-slate-900 border-l-2 border-indigo-500' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono text-slate-400">#{ticket.id}</span>
                  {getStatusBadge(ticket.status)}
                </div>
                <h4 className="text-sm font-semibold text-slate-200 truncate">{ticket.subject}</h4>
                <p className="text-xs text-slate-400 truncate mt-1">{ticket.user_email}</p>
                <div className="flex items-center justify-between mt-3 text-[11px] text-slate-500">
                  <span className="capitalize text-slate-400">Priority: {ticket.priority || 'Normal'}</span>
                  <span>{new Date(ticket.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Conversation / Detail Panel */}
        <div className="flex-1 flex flex-col bg-slate-950">
          {selectedTicket ? (
            <>
              {/* Ticket Header Details */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/30 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-100">{selectedTicket.subject}</h3>
                    {getStatusBadge(selectedTicket.status)}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    User: <span className="text-slate-200">{selectedTicket.user_email}</span> | Created:{' '}
                    {new Date(selectedTicket.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedTicket.status}
                    onChange={(e) => handleUpdateStatus(selectedTicket.id, e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200"
                  >
                    <option value="open">Mark Open</option>
                    <option value="in_progress">Mark In Progress</option>
                    <option value="resolved">Mark Resolved</option>
                    <option value="closed">Mark Closed</option>
                  </select>
                </div>
              </div>

              {/* Message Thread */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {messagesLoading ? (
                  <div className="p-8 text-center text-slate-500 text-sm">Loading thread...</div>
                ) : messages.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">No messages in this ticket yet.</div>
                ) : (
                  messages.map((msg) => {
                    const isAdmin = msg.sender_type === 'admin';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col max-w-[80%] ${isAdmin ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400">
                          {isAdmin ? <ShieldAlert className="w-3 h-3 text-indigo-400" /> : <User className="w-3 h-3 text-slate-400" />}
                          <span className="font-medium text-slate-300">{isAdmin ? 'Support Admin' : selectedTicket.user_email}</span>
                          <span>•</span>
                          <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div
                          className={`p-3 rounded-xl text-sm leading-relaxed ${
                            isAdmin
                              ? 'bg-indigo-600 text-white rounded-tr-none'
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
              <form onSubmit={handleSendReply} className="p-4 border-t border-slate-800 bg-slate-900/30">
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type an official support response..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !replyText.trim()}
                    className="px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition-colors shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    <span>Reply</span>
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Select a ticket to view conversation details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}