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
  const [tickets, setTickets] = useState([]);
  
  // Forms states
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    // Security check: kung hindi naka-login as Admin, ibalik sa Admin Login
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

    // 2. Vault Media Videos
    const { data: mediaData } = await supabase
      .from('media')
      .select('*')
      .order('created_at', { ascending: false });
    if (mediaData) setMediaList(mediaData);

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

  // Cloudflare R2 Bulk Upload Function (Fixed DB Insert)
  const handleBulkUploadToCloudflare = async (e) => {
    e.preventDefault();
    if (uploadFiles.length === 0) return;

    setLoading(true);
    let successCount = 0;

    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      setUploadProgress(`Uploading (${i + 1}/${uploadFiles.length}): ${file.name}`);

      const fileExt = file.name.split('.').pop().toLowerCase();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      try {
        // 1. Upload File sa Cloudflare R2 Bucket
        const command = new PutObjectCommand({
          Bucket: 'jb-collections-hub',
          Key: fileName,
          Body: file,
          ContentType: file.type,
        });

        await r2Client.send(command);

        // 2. Buuin ang Public Video Link
        const videoPublicUrl = `${r2PublicDomain}/${fileName}`;
        const cleanTitle = file.name.replace(/\.[^/.]+$/, "");
        
        // Anti-bug: Tukuyin kung Video o Image
        const isVideoFile = file.type.startsWith('video') || ['mp4', 'mov', 'webm', 'mkv'].includes(fileExt);
        const detectedType = isVideoFile ? 'video' : 'image';

        // 3. I-save sa Supabase 'media' table kasama ang media_type
        const { error: dbError } = await supabase.from('media').insert([
          {
            title: cleanTitle,
            media_url: videoPublicUrl,
            category: 'Vault Content',
            type: detectedType,
            media_type: detectedType
          }
        ]);

        if (dbError) {
          console.error('Supabase DB Insert Error:', dbError);
          alert(`File uploaded to R2, but failed in Supabase DB: ${dbError.message}`);
        } else {
          successCount++;
        }

      } catch (err) {
        console.error('Error uploading file to Cloudflare R2:', err);
      }
    }

    alert(`Successfully processed ${successCount} file(s)!`);
    setUploadFiles([]);
    setUploadProgress('');
    setLoading(false);
    fetchData();
  };

  // Delete Media Function
  const handleDeleteMedia = async (id) => {
    if (!window.confirm("Sigurado ka bang gusto mong burahin ang media na ito?")) return;
    const { error } = await supabase.from('media').delete().eq('id', id);
    if (error) {
      alert("Error deleting media: " + error.message);
    } else {
      fetchData();
    }
  };

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
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div>
            <h1 className="text-3xl font-bold mb-6 text-white">System Dashboard</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
                <p className="text-gray-400 text-sm">Total Registered Users</p>
                <p className="text-4xl font-bold text-purple-400 mt-2">{users.length}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
                <p className="text-gray-400 text-sm">Active VIP Members</p>
                <p className="text-4xl font-bold text-green-400 mt-2">{users.filter((u) => u.is_activated).length}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
                <p className="text-gray-400 text-sm">Total Vault Videos</p>
                <p className="text-4xl font-bold text-blue-400 mt-2">{mediaList.length}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
                <p className="text-gray-400 text-sm">Pending Support Tickets</p>
                <p className="text-4xl font-bold text-amber-400 mt-2">{pendingTicketsCount}</p>
              </div>
            </div>
          </div>
        )}

        {/* SUPPORT TICKETS TAB */}
        {activeTab === 'tickets' && (
          <div>
            <h1 className="text-3xl font-bold mb-6 text-white">Support Tickets Management</h1>
            <SupportTicketsTab />
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div>
            <h1 className="text-3xl font-bold mb-6 text-white">Registered Accounts</h1>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-3">
              {users.map((u) => (
                <div key={u.id} className="bg-gray-800/50 p-4 rounded-xl flex justify-between items-center border border-gray-800">
                  <div>
                    <p className="font-bold text-white">{u.full_name || 'No Name'}</p>
                    <p className="text-xs text-gray-500">ID: {u.id}</p>
                  </div>
                  <span
                    className={`text-xs px-3 py-1 rounded-full font-bold ${
                      u.is_activated
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {u.is_activated ? 'ACTIVE VIP' : 'PENDING'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACCESS CODES TAB */}
        {activeTab === 'codes' && <AccessCodesTab />}

        {/* UPLOAD MEDIA & MANAGER TAB */}
        {activeTab === 'upload' && (
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl font-bold mb-6 text-white">Cloudflare R2 Bulk Uploader</h1>
              <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl max-w-2xl shadow-xl">
                <form onSubmit={handleBulkUploadToCloudflare} className="flex flex-col gap-6">
                  <div className="border-2 border-dashed border-gray-700 hover:border-red-500/50 bg-gray-800/40 rounded-2xl p-8 text-center transition-all cursor-pointer">
                    <input
                      type="file"
                      multiple
                      accept="video/*,image/*"
                      id="file-upload"
                      onChange={(e) => setUploadFiles(Array.from(e.target.files))}
                      className="hidden"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                      <span className="text-4xl mb-3">📁</span>
                      <span className="text-lg font-semibold text-white mb-1">
                        Click to select or drag videos here
                      </span>
                      <span className="text-xs text-gray-400">
                        Uploading to bucket: <strong className="text-red-400">jb-collections-hub</strong>
                      </span>
                    </label>
                  </div>

                  {uploadFiles.length > 0 && (
                    <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700">
                      <p className="text-sm font-bold text-gray-300 mb-2">
                        Selected Files ({uploadFiles.length}):
                      </p>
                      <div className="max-h-40 overflow-y-auto space-y-1 text-xs text-gray-400">
                        {uploadFiles.map((file, idx) => (
                          <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-700/50">
                            <span className="truncate max-w-xs text-white">{file.name}</span>
                            <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
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
                    {loading ? 'Uploading Files...' : `Upload ${uploadFiles.length} File(s) to Cloudflare`}
                  </button>
                </form>
              </div>
            </div>

            {/* LIVE MEDIA LIST MANAGER */}
            <div>
              <h2 className="text-2xl font-bold mb-4 text-white">Uploaded Vault Media ({mediaList.length})</h2>
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