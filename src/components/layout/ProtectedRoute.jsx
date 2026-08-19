import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function ProtectedRoute() {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isActivated, setIsActivated] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    setIsAuthenticated(true);

    // Kunin ang activation status sa profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_activated')
      .eq('id', user.id)
      .single();

    if (profile && profile.is_activated) {
      setIsActivated(true);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        <p className="animate-pulse">Verifying VIP Access...</p>
      </div>
    );
  }

  // Kung hindi naka-login -> balik sa Login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Kung naka-login pero hindi pa activated -> papuntang Activate page
  if (!isActivated) {
    return <Navigate to="/activate" replace />;
  }

  // Kapag parehong okay -> tuloy sa Homepage
  return <Outlet />;
}