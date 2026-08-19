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
  MessageSquare
} from 'lucide-react';

export default function SupportTicketsTab() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'pending', 'resolved'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);

  useEffect(() => {
    fetchTickets();
  }, []);

  // 1. Kunin ang lahat ng support tickets mula sa Supabase
  const fetchTickets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  // 2. I-update ang Status ng Ticket (e.g. 'pending' -> 'resolved')
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
    } catch (err) {
      console.error('Error updating ticket status:', err);
    }
  };

  // 3. Burahin ang Ticket
  const handleDelete = async (id) => {
    if (!window.confirm('Sigurado ka bang gusto mong burahin ang ticket na ito?')) return;

    try {
      const { error } = await supabase
        .from('support_tickets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTickets((prev) => prev.filter((t) => t.id !== id));
      if (selectedTicket?.id === id) setSelectedTicket(null);
    } catch (err) {
      console.error('Error deleting ticket:', err);
    }
  };

  // Filtered list base sa Search at Status
  const filteredTickets = tickets.filter((ticket) => {
    const matchesStatus = filterStatus === 'all' || ticket.status === filterStatus;
    const matchesSearch =
      ticket.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const pendingCount = tickets.filter((t) => t.status === 'pending').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved').length;

  return (
    <div className="space-y-6 text-slate-200">
      
      {/* 📊 Header Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Kabuuan (Total)</p>
            <p className="text-2xl font-bold text-white mt-1">{tickets.length}</p>
          </div>
          <Inbox className="w-8 h-8 text-blue-400 opacity-80" />
        </div>

        <div className="bg-slate-900/80 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Pending Concerns</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{pendingCount}</p>
          </div>
          <Clock className="w-8 h-8 text-amber-400 opacity-80" />
        </div>

        <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Resolved / Nasagot</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{resolvedCount}</p>
          </div>
          <CheckCircle2 className="w-8 h-8 text-emerald-400 opacity-80" />
        </div>
      </div>

      {/* 🔍 Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/40 p-4 border border-slate-800/80 rounded-xl">
        
        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search name, email, subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              filterStatus === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Lahat ({tickets.length})
          </button>
          <button
            onClick={() => setFilterStatus('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              filterStatus === 'pending' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setFilterStatus('resolved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
              filterStatus === 'resolved' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Resolved ({resolvedCount})
          </button>
          
          <button
            onClick={fetchTickets}
            title="Refresh List"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer ml-auto sm:ml-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 📋 Main Table & Detail View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Ticket List (2 Columns on Large Screens) */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Kinuha ang mga mensahe...</div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">Walang nahanap na support tickets.</div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {filteredTickets.map((ticket) => {
                const isSelected = selectedTicket?.id === ticket.id;
                return (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className={`p-4 cursor-pointer transition-all flex items-start justify-between gap-3 ${
                      isSelected ? 'bg-slate-800/80 border-l-4 border-l-blue-500' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white truncate">{ticket.subject}</span>
                        {ticket.status === 'pending' ? (
                          <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            Pending
                          </span>
                        ) : (
                          <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            Resolved
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {ticket.name} • <span className="text-slate-500">{ticket.email}</span>
                      </p>
                      <p className="text-xs text-slate-300 line-clamp-1 mt-1">{ticket.message}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-slate-500">
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

        {/* Detail Panel (1 Column) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl h-fit">
          {selectedTicket ? (
            <div className="space-y-5">
              <div className="border-b border-slate-800 pb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-white text-base leading-snug">{selectedTicket.subject}</h3>
                  <p className="text-xs text-slate-400 mt-1">{selectedTicket.name}</p>
                  <p className="text-xs text-blue-400 font-mono">{selectedTicket.email}</p>
                </div>
                <button
                  onClick={() => handleDelete(selectedTicket.id)}
                  title="Burahin ang Ticket"
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Message Body */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Mensahe:</p>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
                  {selectedTicket.message}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                {/* Direct Reply Email Button */}
                <a
                  href={`mailto:${selectedTicket.email}?subject=Re: ${encodeURIComponent(selectedTicket.subject)}`}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Mail className="w-4 h-4" /> Sagutin via Email
                </a>

                {/* Status Toggle */}
                {selectedTicket.status === 'pending' ? (
                  <button
                    onClick={() => handleStatusChange(selectedTicket.id, 'resolved')}
                    className="w-full bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Mark as Resolved
                  </button>
                ) : (
                  <button
                    onClick={() => handleStatusChange(selectedTicket.id, 'pending')}
                    className="w-full bg-amber-600/20 text-amber-400 hover:bg-amber-600 hover:text-white border border-amber-500/30 text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Clock className="w-4 h-4" /> Re-open Ticket (Mark Pending)
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <MessageSquare className="w-8 h-8 mx-auto opacity-40" />
              <p className="text-xs">Pumili ng ticket mula sa listahan para mabasa ang buong detalye.</p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}