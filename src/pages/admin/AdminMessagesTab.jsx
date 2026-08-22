import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

export default function AdminMessagesTab({ users }) {
  const [selectedUser, setSelectedUser] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!selectedUser) return alert("Pumili ng user na padadalhan.");

    setLoading(true);
    
    const { error } = await supabase.from('admin_messages').insert([{
      user_id: selectedUser,
      title: title,
      content: content,
      is_read: false
    }]);

    if (error) {
      alert("Failed to send message: " + error.message);
    } else {
      alert("✅ Message sent successfully!");
      setTitle('');
      setContent('');
      setSelectedUser('');
    }
    setLoading(false);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-2xl">
      <h2 className="text-xl font-bold text-white mb-4">Compose Admin Message</h2>
      
      <form onSubmit={handleSendMessage} className="space-y-4">
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Send To (Select User):</label>
          <select 
            value={selectedUser} 
            onChange={(e) => setSelectedUser(e.target.value)}
            required
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500"
          >
            <option value="" disabled>-- Pumili ng User --</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email} ({u.account_type})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-gray-400 text-xs mb-1 block">Message Title:</label>
          <input 
            type="text" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. You have been upgraded to VIP!" 
            required
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500"
          />
        </div>

        <div>
          <label className="text-gray-400 text-xs mb-1 block">Message Content:</label>
          <textarea 
            value={content} 
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your message here..." 
            rows="5"
            required
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500"
          ></textarea>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-red-600 hover:bg-red-500 disabled:bg-gray-800 text-white font-bold py-3 rounded-xl transition-all cursor-pointer"
        >
          {loading ? 'Sending...' : 'Send Message 📤'}
        </button>
      </form>
    </div>
  );
}