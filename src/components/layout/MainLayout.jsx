import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { supabase } from "../../services/supabaseClient";
import { getBillingAccess, resolveMemberPresentation } from "../../services/billingAccess";
import Header from "./Header";
import Footer from "./Footer";
import SocialBar from "../SocialBar";

/**
 * Show an ad only once an authenticated Standard entitlement has been checked.
 *
 * Previously the app injected the third-party script when getSession() was
 * initially null. Ad scripts can leave their own DOM behind even after their
 * loader gets removed; the incorrect initial injection affected VIP profiles.
 *
 * Keep payment/legacy entitlements authoritative and do not load scripts if
 * auth, the profile, or the billing check is unresolved.
 */
export default function MainLayout() {
  const location = useLocation();
  const [showSocialBar, setShowSocialBar] = useState(false);

  useEffect(() => {
    let active = true;
    let requestVersion = 0;

    const resolveAdAccess = async (session) => {
      const version = ++requestVersion;

      // Fail closed while authentication and membership are resolving.
      if (active) setShowSocialBar(false);
      if (!session?.user?.id) return;

      try {
        const [{ data: profile, error: profileError }, billingResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("account_type, role, vip_until")
            .eq("id", session.user.id)
            .maybeSingle(),
          getBillingAccess()
            .then((access) => ({ access, error: null }))
            .catch((error) => ({ access: null, error })),
        ]);

        if (!active || version !== requestVersion) return;
        if (profileError || billingResult.error) {
          if (profileError) console.error("Ad eligibility unavailable:", profileError);
          if (billingResult.error) console.error("Billing ad eligibility unavailable:", billingResult.error);
          return;
        }

        const membership = resolveMemberPresentation(profile, billingResult.access);
        // Ads are exclusive to verified active Standard members, not VIP,
        // admin, free, or accounts whose membership cannot be resolved.
        setShowSocialBar(
          membership.tier === "standard" && membership.showAds === true
        );
      } catch (error) {
        if (active && version === requestVersion) {
          console.error("Could not determine ad eligibility:", error);
          setShowSocialBar(false);
        }
      }
    };

    const refresh = () => {
      supabase.auth.getSession()
        .then(({ data, error }) => {
          if (!active) return;
          if (error) {
            ++requestVersion;
            setShowSocialBar(false);
            return;
          }
          void resolveAdAccess(data?.session || null);
        })
        .catch((error) => {
          if (!active) return;
          ++requestVersion;
          console.error("Ad eligibility session unavailable:", error);
          setShowSocialBar(false);
        });
    };

    refresh();

    // Defer DB calls until after the Supabase auth callback releases its lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        ++requestVersion;
        setShowSocialBar(false);
        Promise.resolve().then(() => {
          if (active) void resolveAdAccess(session);
        });
      }
    );

    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      ++requestVersion;
      window.removeEventListener("focus", refresh);
      subscription?.unsubscribe();
    };
  }, []);

  // The third-party social ad script is never injected on Profile, Plans,
  // messages, account settings, billing, support, or legal routes.
  const showMediaAd = location.pathname === "/home" && showSocialBar;

  return (
    <div className="jbh-app flex min-h-screen flex-col justify-between text-slate-100">
      {showMediaAd && <SocialBar enabled />}
      <div>
        <Header />
        <main className="w-full min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}
