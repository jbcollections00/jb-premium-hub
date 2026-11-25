import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabaseClient";

const MAX_RECOMMENDATIONS = 24;

const normalizeCategory = (value) =>
  String(value || "general").trim().toLowerCase();

const prettyCategory = (value) => {
  const normalized = normalizeCategory(value);

  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export default function ForYou() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [categories, setCategories] = useState([]);
  const [preferences, setPreferences] = useState([]);
  const [recommendations, setRecommendations] = useState([]);

  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState("");
  const [error, setError] = useState("");

  const role = (profile?.role || "").toLowerCase();
  const accountType = (profile?.account_type || "").toLowerCase();

  const isAdmin =
    role === "admin" ||
    accountType === "admin";

  const hasActiveVip =
    accountType === "vip" &&
    profile?.vip_until &&
    new Date(profile.vip_until) > new Date();

  const isEligible = isAdmin || Boolean(hasActiveVip);

  const preferenceSet = useMemo(
    () => new Set(preferences.map(normalizeCategory)),
    [preferences]
  );

  useEffect(() => {
    initializePage();
  }, []);

  const initializePage = async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!currentUser) throw new Error("You must be signed in.");

      setUser(currentUser);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, account_type, vip_until")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      setProfile(profileData || null);

      await Promise.all([
        loadCategories(),
        loadPreferences(currentUser.id),
      ]);

      await loadRecommendations();
    } catch (err) {
      console.error("For You initialization error:", err);
      setError(err?.message || "Unable to load this page.");
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from("media")
      .select("category")
      .eq("type", "video")
      .not("category", "is", null)
      .limit(1000);

    if (error) throw error;

    const unique = [
      ...new Set(
        (data || [])
          .map((row) => normalizeCategory(row.category))
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b));

    setCategories(unique);
  };

  const loadPreferences = async (userId) => {
    const { data, error } = await supabase
      .from("user_content_preferences")
      .select("category")
      .eq("user_id", userId)
      .order("category", { ascending: true });

    if (error) throw error;

    setPreferences((data || []).map((row) => normalizeCategory(row.category)));
  };

  const loadRecommendations = async () => {
    const { data, error } = await supabase.rpc("get_for_you_media", {
      p_limit: MAX_RECOMMENDATIONS,
    });

    if (error) throw error;

    setRecommendations(Array.isArray(data) ? data : []);
  };

  const toggleCategory = async (category) => {
    if (!user?.id || savingCategory) return;

    const normalized = normalizeCategory(category);
    const isSelected = preferenceSet.has(normalized);

    setSavingCategory(normalized);
    setError("");

    try {
      if (isSelected) {
        const { error } = await supabase
          .from("user_content_preferences")
          .delete()
          .eq("user_id", user.id)
          .eq("category", normalized);

        if (error) throw error;

        setPreferences((prev) =>
          prev.filter((item) => normalizeCategory(item) !== normalized)
        );
      } else {
        const { error } = await supabase
          .from("user_content_preferences")
          .insert({
            user_id: user.id,
            category: normalized,
          });

        if (error) throw error;

        setPreferences((prev) => [...prev, normalized]);
      }

      await loadRecommendations();
    } catch (err) {
      console.error("Preference update error:", err);
      setError(err?.message || "Unable to update your preferences.");
    } finally {
      setSavingCategory("");
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] bg-slate-950 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white px-4 py-8 md:px-10">
      <div className="max-w-7xl mx-auto space-y-8">
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl">
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-violet-400 font-bold">
              Personalization
            </span>
            <h1 className="text-2xl md:text-3xl font-black">
              For You
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Choose the categories you want included. Recommendations are based
              only on the interests you explicitly select.
            </p>
          </div>

          {error && (
            <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-300">
              {error}
            </div>
          )}

          <div className="mt-6">
            <h2 className="text-sm font-bold text-slate-200 mb-3">
              Choose your interests
            </h2>

            {categories.length === 0 ? (
              <p className="text-xs text-slate-500">
                No categories are available yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => {
                  const selected = preferenceSet.has(category);
                  const isSaving = savingCategory === category;

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleCategory(category)}
                      disabled={Boolean(savingCategory)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                        selected
                          ? "bg-violet-600 text-white border-violet-500"
                          : "bg-slate-950 text-slate-300 border-slate-800 hover:border-violet-500/50"
                      } disabled:opacity-60`}
                    >
                      {isSaving
                        ? "Saving..."
                        : `${selected ? "✓ " : ""}${prettyCategory(category)}`}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {!isEligible ? (
          <section className="bg-slate-900/70 border border-amber-500/20 rounded-3xl p-6 md:p-8">
            <h2 className="text-lg font-bold text-amber-300">
              Recommendations unavailable
            </h2>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              Personalized protected-media results are only shown when the
              account passes the server-side access requirements.
            </p>
          </section>
        ) : preferences.length === 0 ? (
          <section className="bg-slate-900/70 border border-slate-800 rounded-3xl p-8 text-center">
            <div className="text-3xl mb-3">✨</div>
            <h2 className="text-lg font-bold">Choose at least one interest</h2>
            <p className="text-sm text-slate-500 mt-2">
              Your recommendations will appear here after you select a category.
            </p>
          </section>
        ) : (
          <section>
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-black">Recommended for you</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Newest matching items from your selected categories.
                </p>
              </div>

              <button
                type="button"
                onClick={loadRecommendations}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white hover:border-violet-500/40 transition-all"
              >
                Refresh
              </button>
            </div>

            {recommendations.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500">
                No matching items are available yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {recommendations.map((item) => (
                  <article
                    key={item.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg"
                  >
                    <div className="aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
                      {item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt=""
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-violet-950/40 border-b border-slate-800 px-4 text-center">
                          <div className="w-14 h-14 rounded-2xl border border-violet-500/30 bg-violet-500/10 flex items-center justify-center text-2xl mb-3">
                            ✨
                          </div>
                          <p className="text-xs font-black tracking-widest text-violet-300 uppercase">
                            JB Premium Hub
                          </p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] mt-1">
                            Vault Content
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <span className="inline-flex text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-300">
                        {prettyCategory(item.category)}
                      </span>

                      <h3 className="text-sm font-bold text-white mt-3 line-clamp-2">
                        {item.title || "Untitled"}
                      </h3>

                      <p className="text-[11px] text-slate-500 mt-2">
                        Added{" "}
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString()
                          : "recently"}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
