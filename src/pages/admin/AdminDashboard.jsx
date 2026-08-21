import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { supabase } from '../../services/supabaseClient';
import { r2Client, r2PublicDomain } from '../../services/r2Client';
import SupportTicketsTab from './SupportTicketsTab';
import AccessCodesTab from './AccessCodesTab';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [users, setUsers] = useState([]);
  const [mediaList, setMediaList] = useState([]);
  const [totalMediaCount, setTotalMediaCount] = useState(0);
  const [tickets, setTickets] = useState([]);
  
  // File upload state with status tracking
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const isAdmin = localStorage.getItem('isAdminAuthenticated');
    if (!isAdmin) {
      navigate('/admin-login');
      return;
    }
    fetchData();
  }, [navigate]);

  const fetchData = async () => {
    // 1. Users
    const { data: usersData } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (usersData) setUsers(usersData);

    // 2. Vault Media Videos & Exact Database Count
    const { data: mediaData, count: mediaCount } = await supabase
      .from('media')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });
      
    if (mediaData) setMediaList(mediaData);
    if (mediaCount !== null) setTotalMediaCount(mediaCount);

    // 3. Support Tickets
    const { data: ticketsData } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    if (ticketsData) setTickets(ticketsData || []);
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('isAdminAuthenticated');
    navigate('/admin-login');
  };

  // Toggle user between VIP and Standard Tier
  const handleToggleUserTier = async (userId, currentType) => {
    const isVip = currentType?.toLowerCase() === 'vip';
    const newType = isVip ? 'standard' : 'vip';

    const { error } = await supabase
      .from('profiles')
      .update({ 
        account_type: newType,
        is_activated: newType === 'vip'
      })
      .eq('id', userId);

    if (error) {
      alert('Failed to update user tier: ' + error.message);
    } else {
      fetchData();
    }
  };

  // Helper to update specific file status in real-time
  const updateFileState = (id, updates) => {
    setUploadFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  // Handle file selection - Strictly enforce video formats only
  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);

    // 🎥 Filter strictly for video extensions and MIME types (Exclude Images)
    const validVideoFiles = selected.filter((file) => {
      const fileExt = file.name.split('.').pop().toLowerCase();
      const isVideoMime = file.type.startsWith('video/');
      const isVideoExt = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'flv', 'wmv', '3gp', 'ts', 'm2ts', '3g2'].includes(fileExt);
      return isVideoMime || isVideoExt;
    });

    if (validVideoFiles.length < selected.length) {
      const rejectedCount = selected.length - validVideoFiles.length;
      alert(`⚠️ ${rejectedCount} non-video file(s) were ignored. Only video formats are allowed!`);
    }

    const formattedFiles = validVideoFiles.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'pending', // 'pending' | 'uploading' | 'saving' | 'completed' | 'error'
      errorMsg: ''
    }));
    setUploadFiles(formattedFiles);
  };

  // Cloudflare R2 Bulk Upload with Dependency-Free Per-File Signal
  const handleBulkUploadToCloudflare = async (e) => {
    e.preventDefault();
    if (uploadFiles.length === 0) return;

    setLoading(true);
    let successCount = 0;
    let errorDetails = [];

    for (let i = 0; i < uploadFiles.length; i++) {
      const fileObj = uploadFiles[i];
      const file = fileObj.file;
      setUploadProgress(`Processing (${i + 1}/${uploadFiles.length}): ${file.name}`);

      // Step 1: Mark as uploading and start reading
      updateFileState(fileObj.id, { status: 'uploading', progress: 15 });

      const fileExt = file.name.split('.').pop().toLowerCase();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      // Live progress simulation while transmitting bytes to Cloudflare R2
      const progressTimer = setInterval(() => {
        setUploadFiles((prev) =>
          prev.map((item) => {
            if (item.id === fileObj.id && item.status === 'uploading' && item.progress < 85) {
              return { ...item, progress: item.progress + 15 };
            }
            return item;
          })
        );
      }, 300);

      try {
        const fileArrayBuffer = await file.arrayBuffer();

        // Send video file to R2 Bucket
        const command = new PutObjectCommand({
          Bucket: 'jb-collections-hub',
          Key: fileName,
          Body: new Uint8Array(fileArrayBuffer),
          ContentType: file.type || 'video/mp4',
        });

        await r2Client.send(command);
        clearInterval(progressTimer);

        // Step 2: R2 Upload Complete, now inserting record into Supabase
        updateFileState(fileObj.id, { status: 'saving', progress: 92 });

        const videoPublicUrl = `${r2PublicDomain}/${fileName}`;
        const cleanTitle = file.name.replace(/\.[^/.]+$/, "");

        const { error: dbError } = await supabase.from('media').insert([
          {
            title: cleanTitle,
            media_url: videoPublicUrl,
            category: 'Vault Content',
            type: 'video' // Hardcoded as video only
          }
        ]);

        if (dbError) {
          throw new Error(`Database Error: ${dbError.message}`);
        }

        // Step 3: Finished successfully
        updateFileState(fileObj.id, { status: 'completed', progress: 100 });
        successCount++;

      } catch (err) {
        clearInterval(progressTimer);
        console.error(`Failed uploading ${file.name}:`, err);
        const errMsg = err.message || 'Upload failed';
        errorDetails.push(`${file.name}: ${errMsg}`);
        updateFileState(fileObj.id, { status: 'error', progress: 0, errorMsg: errMsg });
      }
    }

    setLoading(false);
    setUploadProgress('');

    if (successCount > 0) {
      alert(`Successfully uploaded ${successCount} out of ${uploadFiles.length} video(s)!`);
      fetchData();
    } else {
      const mainError = errorDetails.length > 0 ? errorDetails[0] : 'Missing R2 Environment Variables on Vercel';
      alert(`Upload Failed!\n\nReason: ${mainError}`);
    }
  };

  const handleDeleteMedia = async (id) => {
    if (!window.confirm("Sigurado ka bang gusto mong burahin ang media na ito?")) return;
    const { error } = await supabase.from('media').delete().eq('id', id);
    if (error) {
      alert("Error deleting media: " + error.message);
    } else {
      fetchData();
    }
  };

  // Render Status Badge & Symbol for File Upload List
  const renderStatusBadge = (fileItem) => {
    switch (fileItem.status) {
      case 'uploading':
        return (
          <span className="flex items-center gap-1 text-xs font-bold text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded animate-pulse">
            <span className="animate-spin">🔄</span>
            <span>Uploading {fileItem.progress}%</span>
          </span>
        );
      case 'saving':
        return (
          <span className="flex items-center gap-1 text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded animate-pulse">
            <span>💾</span>
            <span>Saving DB...</span>
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
            <span>✅</span>
            <span>Uploaded</span>
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded">
            <span>❌</span>
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-xs font-semibold text-gray-400 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded">
            <span>⏳</span>
            <span>Ready</span>
          </span>
        );
    }
  };

  // Stats Calculations
  const vipUsersCount = users.filter((u) => u.account_type?.toLowerCase() === 'vip' || u.is_activated).length;
  const standardUsersCount = users.length - vipUsersCount;
  const pendingTicketsCount = tickets.filter((t) => t.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* SIDEBAR */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col justify-between p-4">
        <div>
          <div className="flex items-center gap-2 mb-8 px-2">
            <span className="text-2xl">🛡️</span>
            <span className="font-bold text-lg text-red-500">Vault Control</span>
          </div>

          <nav className="flex flex-col gap-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`p-3 rounded-xl text-left font-medium transition-all cursor-pointer ${
                activeTab === 'dashboard' ? 'bg-red-600 text-white' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              📊 Dashboard
            </button>
            <button
              onClick={() => setActiveTab('tickets')}
              className={`p-3 rounded-xl text-left font-medium transition-all cursor-pointer flex items-center justify-between ${
                activeTab === 'tickets' ? 'bg-red-600 text-white' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              <span>🎧 Support Tickets</span>
              {pendingTicketsCount > 0 && (
                <span className="bg-amber-500 text-black font-bold text-[10px] px-2 py-0.5 rounded-full">
                  {pendingTicketsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`p-3 rounded-xl text-left font-medium transition-all cursor-pointer ${
                activeTab === 'users' ? 'bg-red-600 text-white' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              👥 Users ({users.length})
            </button>
            <button
              onClick={() => setActiveTab('codes')}
              className={`p-3 rounded-xl text-left font-medium transition-all cursor-pointer ${
                activeTab === 'codes' ? 'bg-red-600 text-white' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              🔑 Access Codes
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`p-3 rounded-xl text-left font-medium transition-all cursor-pointer ${
                activeTab === 'upload' ? 'bg-red-600 text-white' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              📤 Bulk Upload & Media
            </button>
          </nav>
        </div>

        <button
          onClick={handleAdminLogout}
          className="bg-gray-800 hover:bg-red-600/20 hover:text-red-400 p-3 rounded-xl text-sm font-semibold text-gray-400 transition-all cursor-pointer"
        >
          🚪 Admin Logout
        </button>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-8 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <div>
            <h1 className="text-3xl font-bold mb-6 text-white">System Dashboard</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total Users</p>
                <p className="text-3xl font-black text-purple-400 mt-2">{users.length}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Active VIP Members</p>
                <p className="text-3xl font-black text-emerald-400 mt-2">{vipUsersCount}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Standard Users</p>
                <p className="text-3xl font-black text-blue-400 mt-2">{standardUsersCount}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Total Vault Videos</p>
                <p className="text-3xl font-black text-sky-400 mt-2">{totalMediaCount}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Pending Support Tickets</p>
                <p className="text-3xl font-black text-amber-400 mt-2">{pendingTicketsCount}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tickets' && (
          <div>
            <h1 className="text-3xl font-bold mb-6 text-white">Support Tickets Management</h1>
            <SupportTicketsTab />
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <h1 className="text-3xl font-bold mb-6 text-white">Registered Accounts ({users.length})</h1>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
              {users.map((u) => {
                const isVip = u.account_type?.toLowerCase() === 'vip' || u.is_activated;
                return (
                  <div key={u.id} className="bg-gray-800/50 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center border border-gray-800 gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-white">{u.full_name || u.email || 'No Name'}</p>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${isVip ? 'bg-amber-500 text-black' : 'bg-blue-600/30 text-blue-400 border border-blue-500/30'}`}>
                          {isVip ? 'VIP' : 'STANDARD'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">ID: {u.id}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Watch Tokens: <b className="text-amber-400">{u.watch_tokens || 0}</b> | Daily Views Used: <b className="text-white">{u.daily_views_count || 0}/{u.daily_views_limit || 5}</b>
                      </p>
                    </div>

                    <button
                      onClick={() => handleToggleUserTier(u.id, u.account_type)}
                      className={`text-xs px-4 py-2 rounded-xl font-bold cursor-pointer transition-all ${
                        isVip
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-600 hover:text-white'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white'
                      }`}
                    >
                      {isVip ? 'Demote to Standard' : 'Promote to VIP 👑'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'codes' && <AccessCodesTab />}

        {activeTab === 'upload' && (
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl font-bold mb-6 text-white">Cloudflare R2 Bulk Video Uploader</h1>
              <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl max-w-2xl shadow-xl">
                <form onSubmit={handleBulkUploadToCloudflare} className="flex flex-col gap-6">
                  <div className="border-2 border-dashed border-gray-700 hover:border-red-500/50 bg-gray-800/40 rounded-2xl p-8 text-center transition-all cursor-pointer">
                    <input
                      type="file"
                      multiple
                      accept="video/*,.mp4,.mkv,.mov,.avi,.webm,.m4v,.flv,.wmv,.3gp"
                      id="file-upload"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                      <span className="text-4xl mb-3">🎬</span>
                      <span className="text-lg font-semibold text-white mb-1">
                        Click to select or drag videos here
                      </span>
                      <span className="text-xs text-gray-400">
                        Uploading to bucket: <strong className="text-red-400">jb-collections-hub</strong> (Video Formats Only)
                      </span>
                    </label>
                  </div>

                  {uploadFiles.length > 0 && (
                    <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700">
                      <div className="flex justify-between items-center mb-3">
                        <p className="text-sm font-bold text-gray-300">
                          Selected Videos ({uploadFiles.length}):
                        </p>
                        {!loading && (
                          <button
                            type="button"
                            onClick={() => setUploadFiles([])}
                            className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                          >
                            Clear list
                          </button>
                        )}
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                        {uploadFiles.map((item) => (
                          <div 
                            key={item.id} 
                            className="bg-gray-900/80 p-3 rounded-xl border border-gray-700/60 flex flex-col gap-2"
                          >
                            <div className="flex justify-between items-center gap-2 text-xs">
                              <span className="truncate max-w-xs text-white font-medium">
                                {item.name}
                              </span>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-gray-400">
                                  {(item.size / (1024 * 1024)).toFixed(2)} MB
                                </span>
                                {renderStatusBadge(item)}
                              </div>
                            </div>

                            {/* Signal / Progress Bar for Every File */}
                            <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden border border-gray-700/50">
                              <div
                                className={`h-full transition-all duration-300 rounded-full ${
                                  item.status === 'completed'
                                    ? 'bg-emerald-500'
                                    : item.status === 'error'
                                    ? 'bg-red-500'
                                    : 'bg-gradient-to-r from-red-600 via-amber-500 to-emerald-400'
                                }`}
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>

                            {item.errorMsg && (
                              <p className="text-[11px] text-red-400 truncate">{item.errorMsg}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {uploadProgress && (
                    <p className="text-center text-sm font-semibold text-yellow-400 animate-pulse">
                      {uploadProgress}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || uploadFiles.length === 0}
                    className="bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-red-600/20"
                  >
                    {loading ? 'Uploading Videos...' : `Upload ${uploadFiles.length} Video(s) to Cloudflare`}
                  </button>
                </form>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-4 text-white">Uploaded Vault Media ({totalMediaCount})</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                {mediaList.length === 0 ? (
                  <p className="text-gray-500 text-sm p-4 text-center">Wala pang nakaupload na videos sa database.</p>
                ) : (
                  mediaList.map((item) => (
                    <div key={item.id} className="bg-gray-800/50 p-4 rounded-xl flex justify-between items-center border border-gray-800 gap-4">
                      <div className="truncate flex-1">
                        <p className="font-bold text-white text-sm truncate">{item.title}</p>
                        <p className="text-xs text-gray-500 truncate">{item.media_url}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteMedia(item.id)}
                        className="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-red-600/30 shrink-0"
                      >
                        Delete 🗑️
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}