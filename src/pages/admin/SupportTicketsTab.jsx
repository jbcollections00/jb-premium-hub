import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { 
  Inbox, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Mail, 
  RefreshCw, 
  Search,
  MessageSquare,
  ExternalLink,
  Image as ImageIcon
} from 'lucide-react';

export default function SupportTicketsTab() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'pending', 'resolved'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchTickets();
  }, []);

  // 1. Fetch support tickets from Supabase
  const fetchTickets = async () => {
    setLoading(true);
    setStatusMsg({ type: '', text: '' });
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets(data || []);

      if (selectedTicket) {
        const updated = data?.find((t) => t.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      }
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setStatusMsg({ type: 'error', text: 'Failed to load support tickets: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  // 2. Update Ticket Status ('pending' <-> 'resolved')
  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      setTickets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
      );

      if (selectedTicket?.id === id) {
        setSelectedTicket((prev) => ({ ...prev, status: newStatus }));
      }

      setStatusMsg({
        type: 'success',
        text: `Ticket status successfully updated to ${newStatus.toUpperCase()}.`
      });
    } catch (err) {
      console.error('Error updating ticket status:', err);
      setStatusMsg({ type: 'error', text: 'Failed to update ticket status: ' + err.message });
    }
  };

  // 3. Delete Ticket
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to permanentely delete this ticket?')) return;

    try {
      const { error } = await supabase
        .from('support_tickets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTickets((prev) => prev.filter((t) => t.id !== id));
      if (selectedTicket?.id === id) setSelectedTicket(null);
      setStatusMsg({ type: 'success', text: 'Support ticket deleted.' });
    } catch (err) {
      console.error('Error deleting ticket:', err);
      setStatusMsg({ type: 'error', text: 'Failed to delete ticket: ' + err.message });
    }
  };

  // Helper to extract image link from message (for receipt payment proofs)
  const extractReceiptUrl = (text) => {
    if (!text) return null;
    const urlMatch = text.match(/https?:\/\/[^\s]+/g);
    return urlMatch ? urlMatch[0] : null;
  };

  // Filtered list based on Search and Status
  const filteredTickets = tickets.filter((ticket) => {
    const matchesStatus = filterStatus === 'all' || ticket.status === filterStatus;
    const query = searchQuery.toLowerCase();

    const nameMatch = (ticket.name || '').toLowerCase().includes(query);
    const emailMatch = (ticket.email || '').toLowerCase().includes(query);
    const subjectMatch = (ticket.subject || '').toLowerCase().includes(query);
    const messageMatch = (ticket.message || '').toLowerCase().includes(query);

    return matchesStatus && (nameMatch || emailMatch || subjectMatch || messageMatch);
  });

  const pendingCount = tickets.filter((t) => t.status === 'pending').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved').length;

  return (
    <div className="space-y-6 text-slate-200 font-sans">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Support Tickets & Inquiries</h1>
          <p className="text-xs text-slate-400 mt-1">
            Review incoming customer inquiries, account support requests, and payment proof verifications.
          </p>
        </div>
      </div>

      {/* Status Notification Banner */}
      {statusMsg.text && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold border transition-all flex items-center justify-between ${
            statusMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button 
            onClick={() => setStatusMsg({ type: '', text: '' })} 
            className="text-xs font-bold opacity-70 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Stats Counter Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Total Tickets</p>
            <p className="text-2xl font-extrabold text-white mt-1">{tickets.length}</p>
          </div>
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <Inbox className="w-6 h-6 text-blue-400" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-[11px] text-amber-400 font-semibold uppercase tracking-wider">Pending Concerns</p>
            <p className="text-2xl font-extrabold text-amber-400 mt-1">{pendingCount}</p>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <Clock className="w-6 h-6 text-amber-400" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">Resolved Tickets</p>
            <p className="text-2xl font-extrabold text-emerald-400 mt-1">{resolvedCount}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-4 border border-slate-800 rounded-2xl">
        
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search name, email, subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
              filterStatus === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                : 'bg-slate-950 text-slate-400 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            All ({tickets.length})
          </button>
          <button
            onClick={() => setFilterStatus('pending')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
              filterStatus === 'pending'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-900/30'
                : 'bg-slate-950 text-slate-400 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setFilterStatus('resolved')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
              filterStatus === 'resolved'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
                : 'bg-slate-950 text-slate-400 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            Resolved ({resolvedCount})
          </button>

          <button
            onClick={fetchTickets}
            title="Refresh Ticket Queue"
            className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl cursor-pointer ml-auto sm:ml-2 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Ticket List View (Left Column) */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col min-h-[420px]">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2 my-auto">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
              <span>Fetching support queue...</span>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 my-auto space-y-2">
              <Inbox className="w-8 h-8 mx-auto text-slate-600" />
              <p className="font-semibold text-slate-400">No support tickets found</p>
              <p className="text-[11px] text-slate-600">Try adjusting your filter or search query.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 max-h-[600px] overflow-y-auto">
              {filteredTickets.map((ticket) => {
                const isSelected = selectedTicket?.id === ticket.id;
                const isPending = ticket.status === 'pending';

                return (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className={`p-4 cursor-pointer transition-all flex items-start justify-between gap-4 ${
                      isSelected
                        ? 'bg-slate-800/90 border-l-4 border-l-blue-500'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-white truncate">
                          {ticket.subject || 'No Subject'}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${
                            isPending
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {isPending ? 'Pending' : 'Resolved'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 truncate">
                        {ticket.name || 'Anonymous User'} • <span className="text-slate-500 font-mono">{ticket.email || 'N/A'}</span>
                      </p>

                      <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                        {ticket.message}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono text-slate-500 block">
                        {new Date(ticket.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Ticket Detail Panel (Right Column) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl h-fit sticky top-6">
          {selectedTicket ? (
            <div className="space-y-5">
              
              {/* Header Details */}
              <div className="border-b border-slate-800 pb-4 flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500 block mb-1">
                    Ticket Overview
                  </span>
                  <h3 className="font-bold text-white text-base leading-snug">{selectedTicket.subject}</h3>
                  <p className="text-xs text-slate-300 font-semibold mt-1">{selectedTicket.name || 'Unnamed Sender'}</p>
                  <p className="text-xs text-blue-400 font-mono mt-0.5">{selectedTicket.email || 'No email registered'}</p>
                </div>

                <button
                  onClick={() => handleDelete(selectedTicket.id)}
                  title="Delete Ticket"
                  className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Message Body */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  Message Content / Receipt Details
                </label>
                <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-4 text-xs leading-relaxed text-slate-200 whitespace-pre-wrap font-sans">
                  {selectedTicket.message}
                </div>
              </div>

              {/* Automatic Receipt Image Previewer */}
              {extractReceiptUrl(selectedTicket.message) && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" /> Attached Receipt Proof
                    </span>
                    <a
                      href={extractReceiptUrl(selectedTicket.message)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1"
                    >
                      Open Full <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-2 border border-slate-800 flex justify-center">
                    <img
                      src={extractReceiptUrl(selectedTicket.message)}
                      alt="Receipt Attachment Preview"
                      className="max-h-48 object-contain rounded-md"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-3 border-t border-slate-800">
                <a
                  href={`mailto:${selectedTicket.email}?subject=Re: ${encodeURIComponent(selectedTicket.subject || 'Support Inquiry')}`}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-950/40"
                >
                  <Mail className="w-4 h-4" /> Reply via Direct Email
                </a>

                {selectedTicket.status === 'pending' ? (
                  <button
                    onClick={() => handleStatusChange(selectedTicket.id, 'resolved')}
                    className="w-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Mark Ticket as Resolved
                  </button>
                ) : (
                  <button
                    onClick={() => handleStatusChange(selectedTicket.id, 'pending')}
                    className="w-full bg-amber-500/10 text-amber-400 hover:bg-amber-600 hover:text-white border border-amber-500/30 text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Clock className="w-4 h-4" /> Re-open Ticket (Mark Pending)
                  </button>
                )}
              </div>

            </div>
          ) : (
            <div className="py-16 text-center text-slate-500 space-y-3">
              <MessageSquare className="w-10 h-10 mx-auto text-slate-700" />
              <p className="text-xs font-medium">Select a ticket from the queue to view full details and take action.</p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}