import React, { useState, useEffect } from 'react';
import { Send, AlertCircle, RefreshCw } from 'lucide-react';

// Siguraduhing naipapasa ang 'supabase' at 'user' (logged in user details) dito as props
export default function UserSupportTicket({ supabase, user }) {
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) {
      fetchUserTicket();
    }
  }, [user, supabase]);

  useEffect(() => {
    if (ticket) {
      fetchMessages(ticket.id);
    }
  }, [ticket]);

  // 1. Kukunin ang ticket ng user (Pinakabago)
  const fetchUserTicket = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 means no rows found
      setTicket(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Kukunin ang chat history ng ticket
  const fetchMessages = async (ticketId) => {
    try {
      const { data, error } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error("Error fetching messages:", err.message);
    }
  };

  // 3. Mag-send ng mensahe pabalik sa admin
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !ticket) return;

    try {
      setSending(true);
      const newMessage = {
        ticket_id: ticket.id,
        sender_type: 'user',
        message: replyText.trim(),
      };

      const { data, error } = await supabase
        .from('ticket_messages')
        .insert([newMessage])
        .select()
        .single();

      if (error) throw error;

      // I-update din ang ticket status para malaman ng admin na may bagong reply
      await supabase
        .from('support_tickets')
        .update({ updated_at: new Date().toISOString(), status: 'open' })
        .eq('id', ticket.id);

      setMessages((prev) => [...prev, data]);
      setReplyText('');
    } catch (err) {
      setError("Failed to send message: " + err.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400 text-xs">Nilo-load ang iyong ticket...</div>;

  if (!ticket) return (
    <div className="p-8 text-center text-gray-400 bg-gray-900 rounded-xl text-xs">
      Wala ka pang aktibong support ticket.
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full bg-gray-900 text-gray-100 rounded-xl border border-gray-800 overflow-hidden shadow-xl">
      
      {/* Header Bar */}
      <div className="p-3 sm:p-4 bg-gray-800 border-b border-gray-700 flex justify-between items-center shrink-0">
        <div className="min-w-0 pr-2">
          <h2 className="font-bold text-sm sm:text-base truncate">{ticket.subject}</h2>
          <p className="text-[11px] text-gray-400">
            Status: <span className="text-indigo-400 font-bold uppercase">{ticket.status}</span>
          </p>
        </div>
        <button onClick={() => fetchMessages(ticket.id)} className="p-2 hover:bg-gray-700 rounded-lg transition shrink-0 cursor-pointer">
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {error && (
        <div className="p-2.5 bg-red-900/50 text-red-300 text-xs flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Message History Container */}
      <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-4 bg-gray-950">
        
        {/* Unang mensahe/detalye ng user */}
        <div className="flex flex-col max-w-[90%] sm:max-w-[85%] ml-auto items-end">
          <span className="text-[10px] text-gray-400 mb-1">Ikaw (Orihinal na Submission)</span>
          <div className="p-3 rounded-xl rounded-tr-none bg-indigo-600/50 border border-indigo-500/30 text-xs sm:text-sm whitespace-pre-wrap break-words [word-break:break-word] w-full">
            {ticket.message}
          </div>
        </div>

        {/* Mga sumunod na replies */}
        {messages.map((msg) => {
          const isUser = msg.sender_type === 'user';
          return (
            <div key={msg.id} className={`flex flex-col max-w-[90%] sm:max-w-[85%] ${isUser ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
              <span className="text-[10px] text-gray-400 mb-1">
                {isUser ? 'Ikaw' : 'Admin Support'} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className={`p-3 rounded-xl text-xs sm:text-sm whitespace-pre-wrap break-words [word-break:break-word] w-full ${
                isUser 
                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                  : 'bg-gray-800 border border-gray-700 text-gray-200 rounded-tl-none'
              }`}>
                {msg.message}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply Input Box */}
      <form onSubmit={handleSendMessage} className="p-3 sm:p-4 bg-gray-800 border-t border-gray-700 flex gap-2 shrink-0">
        <input
          type="text"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Mag-reply sa admin..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-indigo-500 text-white"
        />
        <button
          type="submit"
          disabled={sending || !replyText.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-2 transition cursor-pointer shrink-0 text-xs font-bold"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}