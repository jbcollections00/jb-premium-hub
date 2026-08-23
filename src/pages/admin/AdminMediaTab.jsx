import React, { useState, useEffect } from 'react';
import { Upload } from '@aws-sdk/lib-storage';
import { supabase } from '../../services/supabaseClient';
import { r2Client, r2PublicDomain } from '../../services/r2Client';

export default function AdminMediaTab() {
  const [mediaList, setMediaList] = useState([]);
  const [totalMediaCount, setTotalMediaCount] = useState(0);
  
  // File Upload States
  const [uploadFiles, setUploadFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  // Search & Edit States
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    const { data: mediaData, count: mediaCount } = await supabase
      .from('media')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (mediaData) setMediaList(mediaData);
    if (mediaCount !== null) setTotalMediaCount(mediaCount);
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
          <p className="text-xs text-gray-400 mt-0.5">Upload, edit titles, and organize your Cloudflare R2 videos.</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 px-4 py-2 rounded-xl text-right">
          <p className="text-[10px] text-gray-400 uppercase font-semibold">Total Vault Videos</p>
          <p className="text-xl font-black text-sky-400">{totalMediaCount}</p>
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

          {/* Selected Files Queue */}
          {uploadFiles.length > 0 && (
            <div className="bg-gray-800/40 p-3 rounded-xl border border-gray-800 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-gray-300">Selected ({uploadFiles.length})</span>
                {!loading && (
                  <button type="button" onClick={() => setUploadFiles([])} className="text-gray-400 hover:text-red-400">
                    Clear queue
                  </button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                {uploadFiles.map((item) => (
                  <div key={item.id} className="bg-gray-900 p-2.5 rounded-lg border border-gray-800 flex items-center justify-between text-xs">
                    <span className="truncate max-w-xs text-white">{item.name}</span>
                    <span className="text-gray-400">{item.progress}%</span>
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
      <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-3">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by video title..."
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-red-500"
          />
          <span className="absolute left-3 top-2.5 text-xs text-gray-400">🔍</span>
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2 text-xs text-gray-400">✖</button>
          )}
        </div>

        {/* Action Button */}
        {mediaList.length > 0 && (
          <button
            onClick={handleDeleteAllMedia}
            className="bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white px-3 py-2 rounded-xl text-xs font-bold border border-red-600/20 transition-all cursor-pointer w-full sm:w-auto"
          >
            ⚠️ Delete All Videos
          </button>
        )}
      </div>

      {/* MEDIA LIST */}
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
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-[11px] font-bold px-2.5 py-1.5 rounded-lg"
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
    </div>
  );
}