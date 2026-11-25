import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

export default function AdminEventControl() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formMsg, setFormMsg] = useState('');

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [reqReferrals, setReqReferrals] = useState(10);
  const [reqWatches, setReqWatches] = useState(10);
  const [rewardVipDays, setRewardVipDays] = useState(14);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setEvents(data);
    }
    setLoading(false);
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setFormMsg('');

    const { error } = await supabase.from('events').insert([
      {
        title,
        description,
        banner_url: bannerUrl,
        req_referrals: parseInt(reqReferrals),
        req_watches: parseInt(reqWatches),
        reward_vip_days: parseInt(rewardVipDays),
        is_active: false,
      },
    ]);

    if (error) {
      setFormMsg(`Error: ${error.message}`);
    } else {
      setFormMsg('✓ Event created successfully!');
      setTitle('');
      setDescription('');
      setBannerUrl('');
      fetchEvents();
    }
  };

  const handleToggleActive = async (eventId, currentStatus) => {
    const nextStatus = !currentStatus;
    const { error } = await supabase.rpc('toggle_event_status', {
      p_event_id: eventId,
      p_is_active: nextStatus,
    });

    if (error) {
      alert(`Error toggling event: ${error.message}`);
    } else {
      fetchEvents();
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;

    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (!error) {
      fetchEvents();
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h2 className="text-xl font-black text-white">🏆 Contest & Event Management</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Create referral contests and control which event pop-up banner is active on the site.
        </p>
      </div>

      {/* Create Event Form */}
      <form onSubmit={handleCreateEvent} className="bg-gray-900 border border-gray-800 p-6 rounded-2xl space-y-4 shadow-xl">
        <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400">➕ Create New Contest Event</h3>

        {formMsg && (
          <div className="p-3 bg-gray-950 border border-gray-800 text-xs rounded-xl text-amber-300">
            {formMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 font-semibold">Event Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summer Referral Rush 2026"
              className="w-full bg-gray-950 border border-gray-800 text-xs text-white p-3 rounded-xl mt-1 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 font-semibold">Banner Image URL</label>
            <input
              type="text"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://.../banner.png"
              className="w-full bg-gray-950 border border-gray-800 text-xs text-white p-3 rounded-xl mt-1 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400 font-semibold">Event Description</label>
          <textarea
            rows="2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Invite 10 friends who watch 10 videos today to earn 14 Days Free VIP Access!"
            className="w-full bg-gray-950 border border-gray-800 text-xs text-white p-3 rounded-xl mt-1 focus:outline-none focus:border-amber-500"
          ></textarea>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-400 font-semibold">Required Referrals</label>
            <input
              type="number"
              min="1"
              value={reqReferrals}
              onChange={(e) => setReqReferrals(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 text-xs text-white p-3 rounded-xl mt-1 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 font-semibold">Required Video Watches / Ref</label>
            <input
              type="number"
              min="1"
              value={reqWatches}
              onChange={(e) => setReqWatches(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 text-xs text-white p-3 rounded-xl mt-1 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 font-semibold">Reward VIP (Days)</label>
            <input
              type="number"
              min="1"
              value={rewardVipDays}
              onChange={(e) => setRewardVipDays(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 text-xs text-white p-3 rounded-xl mt-1 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-black text-xs px-6 py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-950/40 uppercase tracking-wider"
        >
          🚀 Publish Contest Event
        </button>
      </form>

      {/* Existing Events List */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300">📋 Created Events</h3>

        {loading ? (
          <p className="text-xs text-gray-500">Loading events...</p>
        ) : events.length === 0 ? (
          <p className="text-xs text-gray-500">No contest events created yet.</p>
        ) : (
          <div className="space-y-3">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-extrabold text-sm text-white">{evt.title}</h4>
                    {evt.is_active ? (
                      <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        ● ACTIVE (POPUP LIVE)
                      </span>
                    ) : (
                      <span className="bg-gray-800 text-gray-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        INACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">{evt.description}</p>
                  <p className="text-[11px] text-gray-500">
                    Goal: {evt.req_referrals} Refers ({evt.req_watches} watches each) ➔ Reward: +{evt.reward_vip_days} VIP Days
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleActive(evt.id, evt.is_active)}
                    className={`text-xs font-bold px-4 py-2 rounded-xl border transition-all cursor-pointer ${
                      evt.is_active
                        ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500/20'
                        : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                  >
                    {evt.is_active ? 'Deactivate Popup' : 'Activate Popup'}
                  </button>

                  <button
                    onClick={() => handleDeleteEvent(evt.id)}
                    className="bg-gray-800 hover:bg-rose-600/20 hover:text-rose-400 text-gray-400 text-xs px-3 py-2 rounded-xl transition-all cursor-pointer border border-gray-700/50"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}