import React, { useState, useEffect, useMemo } from 'react';
import { Upload } from '@aws-sdk/lib-storage';
import { supabase } from '../../services/supabaseClient';
import { r2Client, r2PublicDomain } from '../../services/r2Client';

export default function AdminMediaTab() {
  const [activeTab, setActiveTab] = useState('files'); // 'upload' | 'files'
  const [mediaList, setMediaList] = useState([]);
  const [totalMediaCount, setTotalMediaCount] = useState(0);
  
  // File Upload States
  const [uploadFiles, setUploadFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notifyUsers, setNotifyUsers] = useState(true);

  // Search, Filter, Edit & Pagination States
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  
  // Pagination State (5 cards per row x 6 cards per column = 30 per page)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  // Ignored / Checked Duplicates
  const [ignoredDuplicates, setIgnoredDuplicates] = useState(() => {
    try {
      const saved = localStorage.getItem('vault_ignored_duplicates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    fetchMedia();
  }, []);

  useEffect(() => {
    localStorage.setItem('vault_ignored_duplicates', JSON.stringify(ignoredDuplicates));
  }, [ignoredDuplicates]);

  // Reset page to 1 when searching or filtering
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, showDuplicatesOnly]);

  const fetchMedia = async () => {
    const { data: mediaData, count: mediaCount } = await supabase
      .from('media')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (mediaData) setMediaList(mediaData);
    if (mediaCount !== null) setTotalMediaCount(mediaCount);
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const normalizeTitle = (title) => {
    if (!title) return '';
    return title
      .toLowerCase()
      .replace(/\.[^/.]+$/, '')
      .replace(/\(\d+\)/g, '')
      .replace(/_\d+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const duplicateGroups = useMemo(() => {
    const groups = {};

    mediaList.forEach((item) => {
      const cleanKey = normalizeTitle(item.title);
      if (!cleanKey) return;
      if (!groups[cleanKey]) {
        groups[cleanKey] = [];
      }
      groups[cleanKey].push(item);
    });

    return Object.entries(groups)
      .filter(([cleanTitle, items]) => items.length > 1 && !ignoredDuplicates.includes(cleanTitle))
      .map(([cleanTitle, items]) => ({ cleanTitle, items }));
  }, [mediaList, ignoredDuplicates]);

  const totalDuplicatesCount = useMemo(() => {
    return duplicateGroups.reduce((acc, group) => acc + (group.items.length - 1), 0);
  }, [duplicateGroups]);

  const handleMarkGroupAsOk = (cleanTitle) => {
    setIgnoredDuplicates((prev) => [...prev, cleanTitle]);
  };

  const handleResetIgnored = () => {
    if (window.confirm("Gusto mo bang ibalik sa duplicates list ang lahat ng marked as OK?")) {
      setIgnoredDuplicates([]);
    }
  };

  const updateFileState = (id, updates) => {
    setUploadFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    const validVideoFiles = selected.filter((file) => {
      const fileExt = file.name.split('.').pop().toLowerCase();
      const isVideoMime = file.type.startsWith('video/');
      const isVideoExt = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'flv', 'wmv', '3gp', 'ts'].includes(fileExt);
      return isVideoMime || isVideoExt;
    });

    if (validVideoFiles.length < selected.length) {
      alert(`⚠️ ${selected.length - validVideoFiles.length} non-video file(s) ignored.`);
    }

    const formattedFiles = validVideoFiles.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'pending',
      errorMsg: ''
    }));
    setUploadFiles(formattedFiles);
  };

  // 🚀 Bulk Upload & Admin Messages Broadcaster
  const handleBulkUploadToCloudflare = async (e) => {
    e.preventDefault();
    if (uploadFiles.length === 0) return;

    setLoading(true);
    const successfulTitles = [];

    const uploadPromises = uploadFiles.map(async (fileObj) => {
      const file = fileObj.file;
      updateFileState(fileObj.id, { status: 'uploading', progress: 0 });

      const fileExt = file.name.split('.').pop().toLowerCase();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      try {
        const parallelUpload = new Upload({
          client: r2Client,
          params: {
            Bucket: 'jb-collections-hub',
            Key: fileName,
            Body: file,
            ContentType: file.type || 'video/mp4',
          },
          queueSize: 4,
          partSize: 5 * 1024 * 1024,
        });

        parallelUpload.on("httpUploadProgress", (progress) => {
          if (progress.total) {
            const percentage = Math.round((progress.loaded / progress.total) * 100);
            updateFileState(fileObj.id, { status: 'uploading', progress: percentage });
          }
        });

        await parallelUpload.done();

        updateFileState(fileObj.id, { status: 'saving', progress: 100 });

        const videoPublicUrl = `${r2PublicDomain}/${fileName}`;
        const cleanTitle = file.name.replace(/\.[^/.]+$/, "");

        const { error: dbError } = await supabase.from('media').insert([
          { title: cleanTitle, media_url: videoPublicUrl, category: 'Vault Content', type: 'video' }
        ]);

        if (dbError) throw new Error(dbError.message);

        updateFileState(fileObj.id, { status: 'completed', progress: 100 });
        successfulTitles.push(cleanTitle);

      } catch (err) {
        updateFileState(fileObj.id, { status: 'error', progress: 0, errorMsg: err.message });
      }
    });

    await Promise.all(uploadPromises);
    setLoading(false);

    if (successfulTitles.length > 0) {
      if (notifyUsers) {
        const titleListFormatted = successfulTitles.map((t) => `• ${t}`).join('\n');
        const announcementTitle = `🎬 New Vault Video Update (${successfulTitles.length} File${successfulTitles.length > 1 ? 's' : ''})`;
        const announcementBody = `Hi! New videos have just been added to the JB Premium Vault:\n\n${titleListFormatted}\n\nCheck them out in your media library now!`;

        try {
          const { data: users } = await supabase.from('profiles').select('id');

          if (users && users.length > 0) {
            const userMessages = users.map((u) => ({
              user_id: u.id,
              title: announcementTitle,
              content: announcementBody,
              message: announcementBody,
              is_read: false,
              send_to_all: true
            }));

            await supabase.from('admin_messages').insert(userMessages);
          } else {
            await supabase.from('admin_messages').insert([
              {
                title: announcementTitle,
                content: announcementBody,
                message: announcementBody,
                send_to_all: true,
                is_read: false
              }
            ]);
          }
        } catch (err) {
          console.error("Admin messages notification error:", err);
        }
      }

      alert(`Uploaded ${successfulTitles.length} video(s)!`);
      setUploadFiles([]);
      fetchMedia();
      setActiveTab('files'); // Switch to files view after successful upload
    }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditTitle(item.title);
  };

  const handleSaveTitle = async (id) => {
    if (!editTitle.trim()) return;

    const { error } = await supabase
      .from('media')
      .update({ title: editTitle.trim() })
      .eq('id', id);

    if (error) {
      alert("Failed to update title: " + error.message);
    } else {
      setEditingId(null);
      fetchMedia();
    }
  };

  const handleDeleteMedia = async (id) => {
    if (!window.confirm("Sigurado ka bang gusto mong burahin ang video na ito?")) return;
    const { error } = await supabase.from('media').delete().eq('id', id);
    if (!error) fetchMedia();
  };

  const handleAutoCleanDuplicates = async () => {
    if (!window.confirm(`Sigurado ka bang gusto mong burahin ang ${totalDuplicatesCount} duplicate copies?`)) {
      return;
    }

    let deletedCount = 0;
    for (const group of duplicateGroups) {
      const sorted = [...group.items].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      const itemsToDelete = sorted.slice(1);

      for (const item of itemsToDelete) {
        const { error } = await supabase.from('media').delete().eq('id', item.id);
        if (!error) deletedCount++;
      }
    }

    alert(`🎉 Matagumpay na nabura ang ${deletedCount} duplicate video(s)!`);
    fetchMedia();
  };

  const handleDeleteAllMedia = async () => {
    if (!window.confirm("⚠️ BABALA: Sigurado ka bang gusto mong burahin ang LAHAT ng videos?")) return;
    const { error } = await supabase.from('media').delete().not('id', 'is', null);
    if (!error) fetchMedia();
  };

  const handleCopyLink = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered Items
  const filteredMedia = useMemo(() => {
    return mediaList.filter((m) =>
      m.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.media_url?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [mediaList, searchQuery]);

  // Paginated Items (30 per page: 5 per row x 6 per column)
  const totalPages = Math.ceil(filteredMedia.length / itemsPerPage);
  const paginatedMedia = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredMedia.slice(start, start + itemsPerPage);
  }, [filteredMedia, currentPage]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 📊 HEADER & METRICS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <span>Vault Media Uploader</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono font-semibold">
              v2.1
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Dedicated upload manager & 5x6 card grid gallery for vault media.
          </p>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 p-4 rounded-2xl flex items-center gap-4 shadow-xl">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Vault Videos</p>
            <p className="text-2xl font-black text-white font-mono mt-0.5">{totalMediaCount}</p>
          </div>
        </div>
      </div>

      {/* 🧭 NAVIGATION TABS */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('files')}
          className={`pb-3 px-4 font-bold text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'files'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          Uploaded Files Grid ({filteredMedia.length})
        </button>

        <button
          onClick={() => setActiveTab('upload')}
          className={`pb-3 px-4 font-bold text-xs uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'upload'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload New Media
        </button>
      </div>

      {/* 📤 TAB 1: DEDICATED UPLOAD PAGE */}
      {activeTab === 'upload' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-md space-y-5">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <span>Bulk Upload Center</span>
          </h2>

          <form onSubmit={handleBulkUploadToCloudflare} className="space-y-5">
            <div className="relative group border-2 border-dashed border-slate-700/80 hover:border-indigo-500/80 bg-slate-950/40 hover:bg-indigo-950/10 rounded-2xl p-12 transition-all duration-300 text-center cursor-pointer flex flex-col items-center justify-center">
              <input
                type="file"
                multiple
                accept="video/*,.mp4,.mkv,.mov,.avi,.webm,.m4v"
                id="file-upload"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                <div className="p-4 bg-indigo-500/10 text-indigo-400 rounded-full group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all duration-300 mb-3 border border-indigo-500/20">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <span className="text-base font-bold text-white tracking-wide">Click or drag video files here to upload</span>
                <span className="text-xs text-slate-500 mt-1">Supports MP4, MKV, MOV, AVI, WEBM, M4V</span>
              </label>
            </div>

            {/* Selected Files Queue */}
            {uploadFiles.length > 0 && (
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-200">Selected Queue ({uploadFiles.length})</span>
                  {!loading && (
                    <button
                      type="button"
                      onClick={() => setUploadFiles([])}
                      className="text-slate-400 hover:text-rose-400 font-semibold transition-colors cursor-pointer"
                    >
                      Clear queue
                    </button>
                  )}
                </div>
                
                <div className="max-h-60 overflow-y-auto space-y-2.5 pr-1">
                  {uploadFiles.map((item) => (
                    <div key={item.id} className="bg-slate-900 p-3 rounded-xl border border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="min-w-0 flex-1 pr-3">
                          <p className="truncate font-semibold text-white">{item.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                            Size: <span className="text-indigo-400 font-bold">{formatBytes(item.size)}</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-xs font-bold ${
                            item.status === 'error' ? 'text-rose-400' :
                            item.status === 'completed' ? 'text-emerald-400' : 'text-indigo-400'
                          }`}>
                            {item.status === 'error' ? 'Failed' : `${item.progress}%`}
                          </span>
                        </div>
                      </div>

                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 rounded-full ${
                            item.status === 'error' ? 'bg-rose-500' :
                            item.status === 'completed' ? 'bg-emerald-500' : 'bg-gradient-to-r from-indigo-500 to-blue-500'
                          }`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>

                      {item.errorMsg && (
                        <p className="text-[10px] text-rose-400 font-medium">{item.errorMsg}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notification Toggle */}
            <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
              <label htmlFor="notify-toggle" className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="notify-toggle"
                  checked={notifyUsers}
                  onChange={(e) => setNotifyUsers(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
                />
                <span className="text-xs font-semibold text-slate-200">
                  Send announcement message to user inbox with list of uploaded files
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || uploadFiles.length === 0}
              className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-indigo-600/20 disabled:shadow-none cursor-pointer flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {loading ? 'Uploading Videos...' : `Upload ${uploadFiles.length} Video(s)`}
            </button>
          </form>
        </div>
      )}

      {/* 🖼️ TAB 2: DEDICATED UPLOADED FILES GRID (5 per row x 6 per column = 30 per page) */}
      {activeTab === 'files' && (
        <div className="space-y-6">
          {/* 🔍 TOOLBAR */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-3 bg-slate-900/40 border border-slate-800 p-3 rounded-2xl">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto flex-1">
              <div className="relative w-full sm:w-80">
                <svg className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search video title..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 cursor-pointer ${
                  showDuplicatesOnly
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-lg shadow-amber-500/10'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-white'
                }`}
              >
                <span>⚠️ Duplicates Filter</span>
                <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-md text-[10px] font-mono">
                  {totalDuplicatesCount}
                </span>
              </button>

              {totalDuplicatesCount > 0 && showDuplicatesOnly && (
                <button
                  onClick={handleAutoCleanDuplicates}
                  className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clean Extra Copies ({totalDuplicatesCount})
                </button>
              )}

              {ignoredDuplicates.length > 0 && (
                <button
                  onClick={handleResetIgnored}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset OK Marks ({ignoredDuplicates.length})
                </button>
              )}
            </div>

            {mediaList.length > 0 && (
              <button
                onClick={handleDeleteAllMedia}
                className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete All Videos
              </button>
            )}
          </div>

          {/* DUPLICATES GROUP VIEW */}
          {showDuplicatesOnly ? (
            <div className="space-y-4">
              {duplicateGroups.length === 0 ? (
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
                  ✨ Walang natagpuang duplicate na video sa iyong Vault!
                </div>
              ) : (
                duplicateGroups.map((group, idx) => (
                  <div key={idx} className="bg-slate-900/60 border border-amber-500/30 rounded-2xl p-5 space-y-4 shadow-xl">
                    <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 text-xs font-bold">📂 Match Group:</span>
                        <span className="text-white text-xs font-semibold capitalize">{group.cleanTitle}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="bg-amber-500/10 text-amber-300 text-[10px] px-2.5 py-1 rounded-full font-mono font-bold border border-amber-500/20">
                          {group.items.length} Copies
                        </span>
                        <button
                          onClick={() => handleMarkGroupAsOk(group.cleanTitle)}
                          className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          Mark as OK
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white truncate">{item.title}</p>
                            <p className="text-[11px] font-mono text-slate-500 truncate mt-0.5">{item.media_url}</p>
                            <p className="text-[9px] text-slate-500 mt-1">
                              Uploaded: {item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleCopyLink(item.media_url, item.id)}
                              className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer border border-slate-700/50 text-xs"
                              title="Copy Link"
                            >
                              {copiedId === item.id ? (
                                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                              )}
                            </button>
                            <button
                              onClick={() => handleDeleteMedia(item.id)}
                              className="p-2 bg-slate-800/80 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer border border-slate-700/50 text-xs"
                              title="Delete Video"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* 📱 5 CARDS PER ROW GRID DISPLAY (30 per page: 5 per row x 6 per column) */
            <>
              {paginatedMedia.length === 0 ? (
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-xs">
                  {searchQuery ? 'Walang nahanap na video sa search.' : 'Wala pang nakaupload na videos.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {paginatedMedia.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 rounded-2xl overflow-hidden flex flex-col justify-between transition-all group shadow-lg hover:shadow-indigo-500/10"
                    >
                      {/* Video Player Box (FIT TO CARD - NO STRETCH) */}
                      <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-800/80">
                        <video
                          src={item.media_url}
                          className="w-full h-full object-contain"
                          controls={false}
                          preload="metadata"
                        />
                        <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <div className="p-2.5 bg-indigo-600/90 text-white rounded-full shadow-lg">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Card Details & Actions */}
                      <div className="p-3.5 flex flex-col justify-between flex-1 space-y-3">
                        {editingId === item.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="bg-slate-950 border border-indigo-500 rounded-lg px-2 py-1 text-xs text-white focus:outline-none w-full"
                            />
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => handleSaveTitle(item.id)}
                                className="flex-1 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-[10px] transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start justify-between gap-1.5">
                              <h3 className="font-bold text-slate-100 text-xs line-clamp-2 leading-tight" title={item.title}>
                                {item.title}
                              </h3>
                              <button
                                onClick={() => handleStartEdit(item)}
                                className="text-slate-500 hover:text-indigo-400 transition-colors shrink-0 p-0.5"
                                title="Edit Title"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                            </div>
                            <p className="text-[10px] font-mono text-slate-500 truncate mt-1" title={item.media_url}>
                              {item.media_url}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800/60">
                          <button
                            onClick={() => handleCopyLink(item.media_url, item.id)}
                            className="flex-1 py-1.5 px-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer border border-slate-700/50 text-[10px] font-semibold flex items-center justify-center gap-1"
                            title="Copy Direct URL"
                          >
                            {copiedId === item.id ? (
                              <>
                                <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                <span>Copy Link</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleDeleteMedia(item.id)}
                            className="p-1.5 bg-slate-800/80 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer border border-slate-700/50 text-[10px]"
                            title="Delete Video"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 📖 PAGINATION CONTROLS */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">
                  <span className="text-xs text-slate-400 font-mono">
                    Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong> ({filteredMedia.length} Total Items)
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all"
                    >
                      Previous
                    </button>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}