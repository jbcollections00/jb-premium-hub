import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

// 🎨 Modernized Vector SVG Icons
const IconMessage = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M8.5 19H8C4 19 2 18 2 13V8C2 4 4 2 8 2H16C20 2 22 4 22 8V13C22 17 20 19 16 19H15.5C15.19 19 14.89 19.15 14.7 19.4L13.2 21.4C12.54 22.28 11.46 22.28 10.8 21.4L9.3 19.4C9.11 19.15 8.81 19 8.5 19Z" 
      stroke="currentColor" 
      strokeWidth="1.8" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path d="M15.9965 11H16.0055" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M11.9955 11H12.0045" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7.99451 11H8.00351" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconLogout = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M8.9 7.56C9.21 3.96 11.06 2.49 15.11 2.49H15.24C19.71 2.49 21.5 4.28 21.5 8.75V15.27C21.5 19.74 19.71 21.53 15.24 21.53H15.11C11.09 21.53 9.24 20.08 8.91 16.54" 
      stroke="currentColor" 
      strokeWidth="1.8" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path d="M15 12H3.62" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5.85 8.65L2.5 12L5.85 15.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function Header() {
  const [messageCount, setMessageCount] = useState(0);
  const [userInitial, setUserInitial] = useState('U');
  const navigate = useNavigate();

  useEffect(() => {
    fetchMessageCount();

    // Nakikinig sa local event kapag nag-read/unread/delete sa Messages.jsx
    const handleUpdate = () => {
      fetchMessageCount();
    };
    window.addEventListener("messagesUpdated", handleUpdate);

    // Realtime Supabase listener para sa bagong mensahe
    const channel = supabase
      .channel("header_unread_messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_messages" },
        () => {
          fetchMessageCount();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener("messagesUpdated", handleUpdate);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchMessageCount = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        setMessageCount(0);
        return;
      }

      // Kunin ang user initial para sa profile icon
      const email = session.user.email || "";
      if (email) {
        setUserInitial(email.charAt(0).toUpperCase());
      }

      // Pinipigilan din ang pagbilang ng duplicates sa badge counter
      const { count, error } = await supabase
        .from("admin_messages")
        .select("*", { count: "exact", head: true })
        .or(`user_id.eq.${session.user.id},and(send_to_all.eq.true,user_id.is.null)`)
        .or("is_read.eq.false,is_read.is.null");

      if (!error && count !== null) {
        setMessageCount(count);
      }
    } catch (err) {
      console.error("Error fetching message count:", err);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <header className="site-header">
      <style>{`
        .site-header {
          background-color: rgba(10, 15, 29, 0.92);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(30, 41, 59, 0.8);
          color: white;
          padding: 12px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 50;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
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
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899);
          padding: 1.5px;
          box-shadow: 0 0 15px rgba(139, 92, 246, 0.25);
        }

        .logo-box-inner {
          width: 100%;
          height: 100%;
          background-color: #0f172a;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          overflow: hidden;
        }

        .brand-subtitle {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-top: 2px;
        }

        .nav-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .nav-item-btn {
          color: #cbd5e1;
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          font-size: 14px;
          font-weight: 600;
          padding: 7px 12px;
          border-radius: 10px;
          transition: all 0.2s ease;
          position: relative;
          border: 1px solid transparent;
        }

        .nav-item-btn:hover {
          color: #ffffff;
          background-color: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .profile-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: linear-gradient(135deg, #2563eb, #7c3aed);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 12px;
          color: #ffffff;
          box-shadow: 0 0 10px rgba(124, 58, 237, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .unread-badge {
          background: linear-gradient(135deg, #2563eb, #3b82f6);
          color: #fff;
          font-size: 10px;
          padding: 2px 7px;
          border-radius: 12px;
          font-weight: 800;
          box-shadow: 0 0 10px rgba(37, 99, 235, 0.5);
        }

        .btn-logout {
          background-color: rgba(239, 68, 68, 0.1);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.25);
          font-size: 14px;
          font-weight: 600;
          padding: 7px 14px;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
        }

        .btn-logout:hover {
          background-color: #ef4444;
          color: #ffffff;
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
          border-color: transparent;
        }

        /* 📱 MOBILE OVERRIDE (< 768px): TATANGGALIN ANG TEXT AT IWAN ANG ICONS LANG */
        @media (max-width: 768px) {
          .hide-on-mobile {
            display: none !important;
          }
          .site-header {
            padding: 10px 14px;
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
            <span style={{ fontSize: '1.2rem', fontWeight: 900, background: 'linear-gradient(to right, #60a5fa, #a78bfa, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              JB
            </span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
              PREMIUM
            </span>
            <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '5px', backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#e9d5ff', border: '1px solid rgba(168, 85, 247, 0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
          <div className="profile-avatar">
            {userInitial}
          </div>
          <span className="hide-on-mobile">Profile</span>
        </Link>

        {/* 💬 Messages Link */}
        <Link to="/messages" className="nav-item-btn" title="Messages">
          <IconMessage />
          <span className="hide-on-mobile">Messages</span>

          {/* LALABAS LANG PAG MAY UNREAD MESSAGES */}
          {messageCount > 0 && (
            <span className="unread-badge">
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