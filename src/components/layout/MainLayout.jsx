import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import Header from './Header';
import Footer from './Footer';

export default function MainLayout() {
  const [isStandardUser, setIsStandardUser] = useState(true); // Default na may ads

  useEffect(() => {
    const checkUserTier = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        const { data } = await supabase
          .from('profiles')
          .select('account_type')
          .eq('id', session.user.id)
          .single();
        
        // Kapag VIP ang account_type, itatago natin ang ads
        if (data?.account_type?.toLowerCase() === 'vip') {
          setIsStandardUser(false);
        }
      }
    };
    checkUserTier();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between">
      <div>
        <Header />
        
        {/* 📢 TOP BANNER AD (Lalabas lang sa Standard Users) */}
        {isStandardUser && (
          <div className="bg-gray-900 border-b border-gray-800 py-3 flex justify-center items-center">
            <div className="text-gray-500 text-xs font-bold tracking-widest border border-dashed border-gray-700 px-10 py-2">
              [ ADVERTISEMENT BANNER ]
            </div>
          </div>
        )}

        <main className="flex">
          {/* 📢 LEFT SIDEBAR AD (Lalabas lang sa Standard) */}
          {isStandardUser && (
            <aside className="w-16 md:w-48 hidden sm:flex flex-col items-center justify-center border-r border-gray-800 bg-gray-900/50 p-4">
              <div className="text-gray-600 text-xs rotate-90 whitespace-nowrap md:rotate-0 md:whitespace-normal">
                [ SIDE AD ]
              </div>
            </aside>
          )}

          {/* MAIN CONTENT AREA */}
          <div className="flex-1 w-full">
            <Outlet />
          </div>

          {/* 📢 RIGHT SIDEBAR AD (Lalabas lang sa Standard) */}
          {isStandardUser && (
            <aside className="w-16 md:w-48 hidden sm:flex flex-col items-center justify-center border-l border-gray-800 bg-gray-900/50 p-4">
              <div className="text-gray-600 text-xs rotate-90 whitespace-nowrap md:rotate-0 md:whitespace-normal">
                [ SIDE AD ]
              </div>
            </aside>
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}