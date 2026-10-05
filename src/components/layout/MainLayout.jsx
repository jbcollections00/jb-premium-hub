import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { supabase } from "../../services/supabaseClient";
import Header from "./Header";
import Footer from "./Footer";
import SocialBar from "../SocialBar";

export default function MainLayout() {
  // null = checking the current account first, so VIP/Admin users never
  // briefly receive the Social Bar while their profile is loading.
  const [showSocialBar, setShowSocialBar] = useState(null);

  useEffect(() => {
    let active = true;

    const resolveAdAccess = async (session) => {
      if (!active) return;

      // Logged-out/public MainLayout pages may show the Social Bar.
      if (!session?.user?.id) {
        setShowSocialBar(true);
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("account_type, role, vip_until")
          .eq("id", session.user.id)
          .maybeSingle();

        if (error) throw error;
        if (!active) return;

        const accountType = (profile?.account_type || "").toUpperCase();
        const role = (profile?.role || "").toUpperCase();
        const isAdmin = accountType === "ADMIN" || role === "ADMIN";
        const isVIP =
          accountType === "VIP" &&
          profile?.vip_until &&
          new Date(profile.vip_until) > new Date();

        setShowSocialBar(!(isAdmin || isVIP));
      } catch (error) {
        console.error("MainLayout ad access check failed:", error);
        // Fail closed for signed-in users: don't accidentally serve ads to
        // VIP/Admin accounts when their profile cannot be verified.
        if (active) setShowSocialBar(false);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      resolveAdAccess(data?.session || null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setShowSocialBar(null);
        resolveAdAccess(session);
      }
    );

    return () => {
      active = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between">
      {showSocialBar === true && <SocialBar enabled />}

      <div>
        <Header />
        <main className="w-full">
          <Outlet />
        </main>
      </div>

      <Footer />
    </div>
  );
}
