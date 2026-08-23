import React, { useState, useEffect, useMemo } from 'react';
import { Upload } from '@aws-sdk/lib-storage';
import { supabase } from '../../services/supabaseClient';
import { r2Client, r2PublicDomain } from '../../services/r2Client';

export default function AdminMediaTab() {
  const [mediaList, setMediaList] = useState([]);
  const [totalMediaCount, setTotalMediaCount] = useState(0);
  
  // File Upload States
  const [uploadFiles, setUploadFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  // Search, Filter & Edit States
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  // 🛡️ Ignored / Checked Duplicates (Nai-save sa localStorage para mag-persist)
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

  const fetchMedia = async () => {
    const { data: mediaData, count: mediaCount } = await supabase
      .from('media')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (mediaData) setMediaList(mediaData);
    if (mediaCount !== null) setTotalMediaCount(mediaCount);
  };

  // 📊 File Size Formatter Helper (Bytes to KB, MB, GB)
  const formatBytes = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // 🔍 Title Normalizer Engine para sa Pagkilala ng Duplicates
  const normalizeTitle = (title) => {
    if (!title) return '';
    return title
      .toLowerCase()
      .replace(/\.[^/.]+$/, '') // Inaalis ang .mp4, .mkv, atbp.
      .replace(/\(\d+\)/g, '')  // Inaalis ang (1), (2), (3)
      .replace(/_\d+/g, '')     // Inaalis ang _1, _2
      .replace(/\s+/g, ' ')     // Inaalis ang sobrang spaces
      .trim();
  };

  // 👥 Dynamic Duplicate Grouping (Iniiwasan ang mga na-mark bilang OK/Ignored)
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

  // Mark Group as OK / Ignore Duplicates
  const handleMarkGroupAsOk = (cleanTitle) => {
    setIgnoredDuplicates((prev) => [...prev, cleanTitle]);
  };

  // Reset All Whitelisted/Checked Duplicates
  const handleResetIgnored = () => {
    if (window.confirm("Gusto mo bang ibalik sa duplicates list ang lahat ng marked as OK?")) {
      setIgnoredDuplicates([]);
    }
  };

  // Helper to update specific upload status
  const updateFileState = (id, updates) => {
    setUploadFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  // Handle Video Selection
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

  // Bulk Upload to R2
  const handleBulkUploadToCloudflare = async (e) => {
    e.preventDefault();
    if (uploadFiles.length === 0) return;

    setLoading(true);
    let successCount = 0;

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
        successCount++;

      } catch (err) {
        updateFileState(fileObj.id, { status: 'error', progress: 0, errorMsg: err.message });
      }
    });

    await Promise.all(uploadPromises);
    setLoading(false);

    if (successCount > 0) {
      alert(`Na-upload ang ${successCount} sa ${uploadFiles.length} na video!`);
      setUploadFiles([]); // Awtomatikong lilinisin ang queue para bumalik sa default UI
      fetchMedia();
    }
  };

  // Edit Video Title
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

  // Delete Single Media
  const handleDeleteMedia = async (id) => {
    if (!window.confirm("Sigurado ka bang gusto mong burahin ang video na ito?")) return;
    const { error } = await supabase.from('media').delete().eq('id', id);
    if (!error) fetchMedia();
  };

  // Awtomatikong Pagbura ng Duplicate Copies (Iniiwan ang master copy)
  const handleAutoCleanDuplicates = async () => {
    if (!window.confirm(`Sigurado ka bang gusto mong burahin ang ${totalDuplicatesCount} duplicate copies? Iniiwan nito ang 1 pinakabagong copy bawat grupo.`)) {
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

  // Delete All Records
  const handleDeleteAllMedia = async () => {
    if (!window.confirm("⚠️ BABALA: Sigurado ka bang gusto mong burahin ang LAHAT ng videos?")) return;
    const { error } = await supabase.from('media').delete().not('id', 'is', null);
    if (!error) fetchMedia();
  };

  // Copy Link
  const handleCopyLink = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter Search
  const filteredMedia = mediaList.filter((m) =>
    m.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.media_url?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-5xl">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Vault Media Uploader</h1>
          <p className="text-xs text-gray-400 mt-0.5">Upload, edit titles, compare duplicates, and organize your Cloudflare R2 videos.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-gray-900 border border-gray-800 px-4 py-2 rounded-xl text-right">
            <p className="text-[10px] text-gray-400 uppercase font-semibold">Total Vault Videos</p>
            <p className="text-xl font-black text-sky-400">{totalMediaCount}</p>
          </div>
        </div>
      </div>

      {/* UPLOADER CARD */}
      <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
        <form onSubmit={handleBulkUploadToCloudflare} className="space-y-4">
          <div className="border-2 border-dashed border-gray-800 hover:border-red-500/50 bg-gray-800/30 rounded-xl p-6 text-center transition-all cursor-pointer">
            <input
              type="file"
              multiple
              accept="video/*,.mp4,.mkv,.mov,.avi,.webm,.m4v"
              id="file-upload"
              onChange={handleFileSelect}
              className="hidden"
            />
            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
              <span className="text-3xl mb-2">🎬</span>
              <span className="text-sm font-bold text-white">Click or drag videos here to upload</span>
              <span className="text-[11px] text-gray-400 mt-1">Bucket: <strong className="text-red-400">jb-collections-hub</strong></span>
            </label>
          </div>

          {/* Selected Files Queue with Storage Size & Progress Bars */}
          {uploadFiles.length > 0 && (
            <div className="bg-gray-800/40 p-3.5 rounded-xl border border-gray-800 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-gray-300">Selected Queue ({uploadFiles.length})</span>
                {!loading && (
                  <button type="button" onClick={() => setUploadFiles([])} className="text-gray-400 hover:text-red-400 font-semibold cursor-pointer">
                    Clear queue
                  </button>
                )}
              </div>
              
              <div className="max-h-52 overflow-y-auto space-y-2.5 pr-1">
                {uploadFiles.map((item) => (
                  <div key={item.id} className="bg-gray-900 p-3 rounded-xl border border-gray-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="min-w-0 flex-1 pr-3">
                        <p className="truncate font-semibold text-white">{item.name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                          Size: <span className="text-sky-400 font-bold">{formatBytes(item.size)}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs font-bold ${
                          item.status === 'error' ? 'text-rose-400' :
                          item.status === 'completed' ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {item.status === 'error' ? 'Failed' : `${item.progress}%`}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar Track */}
                    <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          item.status === 'error' ? 'bg-rose-500' :
                          item.status === 'completed' ? 'bg-emerald-500' : 'bg-red-500'
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

          <button
            type="submit"
            disabled={loading || uploadFiles.length === 0}
            className="w-full bg-red-600 hover:bg-red-500 disabled:bg-gray-800 text-white font-bold py-2.5 rounded-xl transition-all text-xs cursor-pointer"
          >
            {loading ? 'Uploading Videos...' : `Upload ${uploadFiles.length} Video(s)`}
          </button>
        </form>
      </div>

      {/* MEDIA MANAGEMENT TOOLBAR */}
      <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-3">
        {/* Search Input & Toggle Duplicates */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto flex-1">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by video title..."
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-9 pr-8 py-2 text-xs focus:outline-none focus:border-red-500"
            />
            <span className="absolute left-3 top-2.5 text-xs text-gray-400">🔍</span>
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2 text-xs text-gray-400">✖</button>
            )}
          </div>

          {/* Toggle Duplicates Button */}
          <button
            onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              showDuplicatesOnly
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                : 'bg-gray-800 text-amber-400 hover:bg-gray-700 border border-gray-700'
            }`}
          >
            <span>⚠️ Duplicates Filter</span>
            <span className="bg-black/20 text-black px-2 py-0.5 rounded-full text-[10px] font-extrabold">
              {totalDuplicatesCount}
            </span>
          </button>

          {/* Auto Clean Duplicates */}
          {totalDuplicatesCount > 0 && showDuplicatesOnly && (
            <button
              onClick={handleAutoCleanDuplicates}
              className="bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-black border border-amber-500/30 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              🧹 Clean All Extra Copies ({totalDuplicatesCount})
            </button>
          )}

          {/* Reset Ignored OK Groups Button */}
          {ignoredDuplicates.length > 0 && (
            <button
              onClick={handleResetIgnored}
              className="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
              title="Reset Whitelisted Duplicates"
            >
              🔄 Reset OK Marks ({ignoredDuplicates.length})
            </button>
          )}
        </div>

        {/* Delete All Action Button */}
        {mediaList.length > 0 && (
          <button
            onClick={handleDeleteAllMedia}
            className="bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white px-3 py-2 rounded-xl text-xs font-bold border border-red-600/20 transition-all cursor-pointer w-full md:w-auto shrink-0"
          >
            ⚠️ Delete All Videos
          </button>
        )}
      </div>

      {/* MEDIA LIST DISPLAY */}
      {showDuplicatesOnly ? (
        /* DUPLICATE COMPARISON VIEW */
        <div className="space-y-4">
          {duplicateGroups.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-500 text-xs">
              ✨ Walang natagpuang duplicate na video sa iyong Vault!
            </div>
          ) : (
            duplicateGroups.map((group, idx) => (
              <div key={idx} className="bg-gray-900 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between border-b border-gray-800 pb-2.5 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 text-xs font-bold">📂 Match Group:</span>
                    <span className="text-white text-xs font-semibold capitalize">{group.cleanTitle}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="bg-amber-500/10 text-amber-400 text-[10px] px-2.5 py-1 rounded-full font-bold border border-amber-500/20">
                      {group.items.length} Copies
                    </span>

                    {/* 🟢 CHECK / MARK AS OK BUTTON */}
                    <button
                      onClick={() => handleMarkGroupAsOk(group.cleanTitle)}
                      className="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                      title="Mark this group as OK (Ignore duplicate warning)"
                    >
                      <span>✅ Mark as OK</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="bg-gray-800/60 p-3 rounded-xl border border-gray-800 flex justify-between items-center gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{item.title}</p>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">{item.media_url}</p>
                        <p className="text-[9px] text-gray-500 mt-1">
                          Uploaded: {item.created_at ? new Date(item.created_at).toLocaleString() : 'N/A'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleCopyLink(item.media_url, item.id)}
                          title="Copy Direct URL"
                          className="bg-gray-800 hover:bg-gray-700 text-gray-300 p-2 rounded-lg border border-gray-700 text-xs cursor-pointer"
                        >
                          {copiedId === item.id ? '✅' : '🔗'}
                        </button>
                        <button
                          onClick={() => handleDeleteMedia(item.id)}
                          className="bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white p-2 rounded-lg border border-rose-600/20 text-xs transition-all cursor-pointer"
                          title="Delete copy"
                        >
                          🗑️
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
        /* STANDARD UNFILTERED MEDIA LIST */
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2.5">
          {filteredMedia.length === 0 ? (
            <p className="text-gray-500 text-xs text-center py-6">
              {searchQuery ? 'Walang nahanap na video sa search.' : 'Wala pang nakaupload na videos.'}
            </p>
          ) : (
            filteredMedia.map((item) => (
              <div
                key={item.id}
                className="bg-gray-800/40 p-3.5 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center border border-gray-800/80 hover:border-gray-700 transition-all gap-3"
              >
                {/* Title & Edit Field */}
                <div className="flex-1 min-w-0">
                  {editingId === item.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="bg-gray-900 border border-red-500 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none flex-1"
                      />
                      <button
                        onClick={() => handleSaveTitle(item.id)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-[11px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-white text-sm truncate">{item.title}</p>
                        <button
                          onClick={() => handleStartEdit(item)}
                          title="Edit Title"
                          className="text-gray-400 hover:text-amber-400 text-xs cursor-pointer"
                        >
                          ✏️
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate mt-0.5">{item.media_url}</p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopyLink(item.media_url, item.id)}
                    title="Copy Direct URL"
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 p-2 rounded-lg border border-gray-700 text-xs transition-all cursor-pointer"
                  >
                    {copiedId === item.id ? '✅' : '🔗'}
                  </button>

                  <button
                    onClick={() => handleDeleteMedia(item.id)}
                    title="Delete Video"
                    className="bg-gray-800 hover:bg-rose-600 text-gray-400 hover:text-white p-2 rounded-lg border border-gray-700 hover:border-rose-600 transition-all text-xs cursor-pointer"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}