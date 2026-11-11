import {
  useEffect,
  useState,
} from "react";

import {
  Outlet,
  useLocation,
} from "react-router-dom";

import { supabase } from "../../services/supabaseClient";
import { getBillingAccess, resolveMemberPresentation } from "../../services/billingAccess";

import Header from "./Header";
import Footer from "./Footer";
import SocialBar from "../SocialBar";

export default function MainLayout() {
  const location =
    useLocation();

  const isChatPage =
    location.pathname ===
    "/chat";

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

  /*
    CHAT PAGE:
    - fixed to viewport height
    - header stays on top
    - chat fills remaining space
    - no footer
    - no body/page scrolling
  */
  if (isChatPage) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-slate-950">
        {showSocialBar ===
          true && (
          <SocialBar
            enabled
          />
        )}

        <div className="flex-shrink-0">
          <Header />
        </div>

        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    );
  }

  /*
    NORMAL SITE PAGES
  */
  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-950">
      {showSocialBar ===
        true && (
        <SocialBar
          enabled
        />
      )}

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