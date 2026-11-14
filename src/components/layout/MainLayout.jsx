import {
  useEffect,
  useState,
} from "react";

import { Outlet } from "react-router-dom";

import { supabase } from "../../services/supabaseClient";
import { getBillingAccess, resolveMemberPresentation } from "../../services/billingAccess";

import Header from "./Header";
import Footer from "./Footer";
import SocialBar from "../SocialBar";

export default function MainLayout() {
  const [
    showSocialBar,
    setShowSocialBar,
  ] = useState(null);

  useEffect(() => {
    let active = true;

    const resolveAdAccess =
      async (
        session
      ) => {
        if (!active) {
          return;
        }

        if (
          !session?.user?.id
        ) {
          setShowSocialBar(
            true
          );

          return;
        }

        try {
          const {
            data: profile,
            error,
          } = await supabase
            .from("profiles")
            .select(
              "account_type, role, vip_until"
            )
            .eq(
              "id",
              session.user.id
            )
            .maybeSingle();

          if (error) {
            throw error;
          }

          if (!active) {
            return;
          }

          let billing = null;
          try {
            billing = await getBillingAccess();
          } catch (billingError) {
            console.error("Billing access unavailable in layout:", billingError);
          }
          if (!active) return;
          const membership = resolveMemberPresentation(profile, billing);
          setShowSocialBar(membership.showAds);
        } catch (error) {
          console.error(
            "MainLayout ad access check failed:",
            error
          );

          if (active) {
            setShowSocialBar(
              false
            );
          }
        }
      };

    supabase.auth
      .getSession()
      .then(
        ({
          data,
        }) => {
          resolveAdAccess(
            data?.session ||
              null
          );
        }
      );

    const {
      data: authListener,
    } =
      supabase.auth.onAuthStateChange(
        (
          _event,
          session
        ) => {
          setShowSocialBar(
            null
          );

          resolveAdAccess(
            session
          );
        }
      );

    return () => {
      active = false;

      authListener
        ?.subscription
        ?.unsubscribe();
    };
  }, []);

  // Standard site layout; chat-specific layout is intentionally excluded.
  return (
    <div className="jbh-app flex min-h-screen flex-col justify-between text-slate-100">
      {showSocialBar ===
        true && (
        <SocialBar
          enabled
        />
      )}

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