import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

// SVG Icons
const IconMessage = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconLogout = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

export default function Header() {
  const [messageCount, setMessageCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    fetchMessageCount();
  }, []);

  const fetchMessageCount = async () => {
    try {
      const { count, error } = await supabase
        .from("admin_messages")
        .select("*", { count: "exact", head: true });

      if (!error && count !== null) {
        setMessageCount(count);
      }
    } catch (err) {
      console.error("Error fetching message count:", err);
    }
  };

  const handleLogout = () => {
    navigate('/');
  };

  return (
    <header className="site-header">
      <style>{`
        .site-header {
          background-color: rgba(17, 24, 39, 0.95);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(31, 41, 55, 0.8);
          color: white;
          padding: 12px 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 50;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
        }

        .nav-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
        }

        .logo-box {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: linear-gradient(135deg, #3b82f6, #9333ea, #4f46e5);
          padding: 1.5px;
        }

        .logo-box-inner {
          width: 100%;
          height: 100%;
          background-color: #111827;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          overflow: hidden;
        }

        .brand-subtitle {
          font-size: 11px;
          color: #9ca3af;
          font-weight: 500;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-top: 3px;
        }

        .nav-controls {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .nav-item-btn {
          color: #d1d5db;
          display: flex;
          align-items: center;
          gap: 6px;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          padding: 6px 10px;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .nav-item-btn:hover {
          color: #ffffff;
          background-color: rgba(255, 255, 255, 0.08);
        }

        .btn-logout {
          background-color: rgba(239, 68, 68, 0.12);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.25);
          font-size: 14px;
          font-weight: 500;
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .btn-logout:hover {
          background-color: #dc2626;
          color: #ffffff;
        }

        /* 📱 MOBILE OVERRIDE (< 768px): TATANGGALIN ANG TEXT AT IWAN ANG ICONS LANG */
        @media (max-width: 768px) {
          .hide-on-mobile {
            display: none !important;
          }
          .site-header {
            padding: 10px 12px;
          }
          .nav-controls {
            gap: 6px;
          }
          .nav-item-btn {
            padding: 6px;
          }
          .btn-logout {
            padding: 8px;
          }
        }
      `}</style>

      {/* 1️⃣ Brand Logo & Title */}
      <Link to="/home" className="nav-brand">
        <div className="logo-box">
          <div className="logo-box-inner">
            <img 
              src="/logo.png" 
              alt="JB Logo" 
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', lineHeight: 1 }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 800, background: 'linear-gradient(to right, #60a5fa, #818cf8, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              JB
            </span>
            <span style={{ fontSize: '1.15rem', fontWeight: 600, color: '#fff' }}>
              PREMIUM
            </span>
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#d8b4fe', border: '1px solid rgba(168, 85, 247, 0.3)', textTransform: 'uppercase' }}>
              HUB
            </span>
          </div>

          <span className="brand-subtitle hide-on-mobile">
            Premium Vault & Media Gallery
          </span>
        </div>
      </Link>

      {/* 2️⃣ User Controls */}
      <div className="nav-controls">
        {/* 👤 Profile Link */}
        <Link to="/profile" className="nav-item-btn" title="Profile">
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(to top right, #2563eb, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px', color: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
            U
          </div>
          <span className="hide-on-mobile">Profile</span>
        </Link>

        {/* 💬 Messages Link */}
        <Link to="/messages" className="nav-item-btn" title="Messages">
          <IconMessage />
          <span className="hide-on-mobile">Messages</span>

          {messageCount > 0 && (
            <span style={{ backgroundColor: '#2563eb', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
              {messageCount}
            </span>
          )}
        </Link>

        {/* 🚪 Logout Button */}
        <button onClick={handleLogout} className="btn-logout" title="Logout">
          <IconLogout />
          <span className="hide-on-mobile">Logout</span>
        </button>
      </div>
    </header>
  );
}