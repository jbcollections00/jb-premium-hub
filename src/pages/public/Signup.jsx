import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import { supabase } from "../../services/supabaseClient";

/* =========================================================
   HELPERS
========================================================= */

function normalizeUsername(value) {
  return value
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function getFriendlySignupError(error) {
  const message =
    error?.message || "";

  const lower =
    message.toLowerCase();

  if (
    lower.includes(
      "already registered"
    ) ||
    lower.includes(
      "user already registered"
    )
  ) {
    return "This email address is already registered.";
  }

  if (
    lower.includes(
      "username"
    ) &&
    (
      lower.includes(
        "duplicate"
      ) ||
      lower.includes(
        "unique"
      ) ||
      lower.includes(
        "already"
      )
    )
  ) {
    return "That username is already taken.";
  }

  if (
    lower.includes(
      "password"
    )
  ) {
    return message;
  }

  if (
    lower.includes(
      "database error"
    )
  ) {
    return "Unable to create the account. The username may already be taken. Please try another username.";
  }

  return (
    message ||
    "Unable to create account."
  );
}

/* =========================================================
   COMPONENT
========================================================= */

export default function Signup() {
  const [
    fullName,
    setFullName,
  ] = useState("");

  const [
    username,
    setUsername,
  ] = useState("");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    is18Plus,
    setIs18Plus,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    errorMsg,
    setErrorMsg,
  ] = useState("");

  const navigate =
    useNavigate();

  const [
    searchParams,
  ] =
    useSearchParams();

  /* =========================================================
     REFERRAL
  ========================================================= */

  useEffect(() => {
    const refFromUrl =
      searchParams.get(
        "ref"
      );

    if (refFromUrl) {
      localStorage.setItem(
        "jb_ref_code",
        refFromUrl
      );
    }
  }, [
    searchParams,
  ]);

  const activeRefCode =
    searchParams.get(
      "ref"
    ) ||
    localStorage.getItem(
      "jb_ref_code"
    ) ||
    null;

  /* =========================================================
     VALIDATION
  ========================================================= */

  const trimmedName =
    fullName.trim();

  const trimmedEmail =
    email
      .trim()
      .toLowerCase();

  const trimmedPassword =
    password.trim();

  const trimmedUsername =
    normalizeUsername(
      username
    );

  const emailRegex =
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  const usernameRegex =
    /^[a-z0-9._-]{3,30}$/;

  const isEmailValid =
    emailRegex.test(
      trimmedEmail
    );

  const isPasswordValid =
    trimmedPassword.length >=
    6;

  const isNameValid =
    trimmedName.length >=
    2;

  const isUsernameValid =
    usernameRegex.test(
      trimmedUsername
    );

  const canSubmit =
    !loading &&
    is18Plus &&
    isNameValid &&
    isUsernameValid &&
    isEmailValid &&
    isPasswordValid;

  /* =========================================================
     USERNAME DISPLAY
  ========================================================= */

  const usernamePreview =
    useMemo(() => {
      const clean =
        normalizeUsername(
          username
        );

      return clean
        ? `@${clean}`
        : "@username";
    }, [
      username,
    ]);

  /* =========================================================
     USERNAME CHANGE
  ========================================================= */

  const handleUsernameChange =
    (event) => {
      const value =
        event.target.value;

      /*
        Allow typing @ but store/display
        only valid username characters.
      */
      const cleaned =
        value
          .replace(/^@/, "")
          .toLowerCase()
          .replace(
            /[^a-z0-9._-]/g,
            ""
          )
          .slice(
            0,
            30
          );

      setUsername(
        cleaned
      );

      setErrorMsg("");
    };

  /* =========================================================
     SIGNUP
  ========================================================= */

  const handleSignup =
    async (event) => {
      event.preventDefault();

      setErrorMsg("");

      if (!is18Plus) {
        setErrorMsg(
          "You must meet the age requirement to register."
        );

        return;
      }

      if (!isNameValid) {
        setErrorMsg(
          "Full name must be at least 2 characters."
        );

        return;
      }

      if (
        !isUsernameValid
      ) {
        setErrorMsg(
          "Username must be 3–30 characters and may only contain letters, numbers, dot, underscore, or hyphen."
        );

        return;
      }

      if (!isEmailValid) {
        setErrorMsg(
          "Please enter a valid email address."
        );

        return;
      }

      if (
        !isPasswordValid
      ) {
        setErrorMsg(
          "Password must contain at least 6 characters."
        );

        return;
      }

      try {
        setLoading(
          true
        );

        /*
          IMPORTANT:

          We no longer manually insert/upsert public.profiles.

          The database trigger:
          public.handle_new_user()

          creates the profiles row automatically.
        */
        const {
          data,
          error,
        } =
          await supabase.auth.signUp({
            email:
              trimmedEmail,

            password:
              trimmedPassword,

            options: {
              data: {
                full_name:
                  trimmedName,

                username:
                  trimmedUsername,

                /*
                  Keep referral context in auth metadata too.

                  The current profile trigger can ignore this.
                  We retain it so referral processing can be
                  added safely later without losing the value.
                */
                referral_code:
                  activeRefCode ||
                  null,
              },
            },
          });

        if (error) {
          throw error;
        }

        const newUser =
          data?.user;

        if (!newUser) {
          throw new Error(
            "Account was not created."
          );
        }

        /*
          IMPORTANT:

          Do not remove referral localStorage yet unless
          we know referral assignment has been completed.

          This allows us to process it later at login if
          email confirmation means no session exists yet.
        */

        /* =====================================================
           SESSION EXISTS
        ===================================================== */

        if (data?.session) {
          /*
            Trigger should already have created:
            public.profiles

            including:
            id
            full_name
            username
            email
          */

          navigate(
            "/home",
            {
              replace:
                true,
            }
          );

          return;
        }

        /* =====================================================
           EMAIL CONFIRMATION REQUIRED
        ===================================================== */

        navigate(
          "/login",
          {
            replace:
              true,

            state: {
              signupMessage:
                "Account created. Please confirm your email before logging in.",
            },
          }
        );
      } catch (error) {
        console.error(
          "Signup error:",
          error
        );

        setErrorMsg(
          getFriendlySignupError(
            error
          )
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-8 font-sans text-white">

      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md w-full shadow-2xl space-y-6">

        {/* =================================================
            LOGO / HEADER
        ================================================= */}

        <div className="text-center">

          <img
            src="/jb-logo.png"
            alt="JB Logo"
            className="w-16 h-16 mx-auto mb-3 object-contain drop-shadow-md"
          />

          <h2 className="text-2xl font-bold text-white">
            Create an Account
          </h2>

          <p className="text-slate-400 text-xs mt-1">
            Create your profile and start using JB Premium Hub.
          </p>

          {activeRefCode && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-400 text-[11px] font-semibold">
              🎁 Referral detected
            </div>
          )}
        </div>

        {/* =================================================
            ERROR
        ================================================= */}

        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs p-3 rounded-xl text-center font-medium">
            {errorMsg}
          </div>
        )}

        {/* =================================================
            FORM
        ================================================= */}

        <form
          onSubmit={
            handleSignup
          }
          className="space-y-4"
        >

          {/* =================================================
              FULL NAME
          ================================================= */}

          <div>

            <div className="flex justify-between items-center mb-1">

              <label className="text-slate-400 text-xs font-semibold uppercase">
                Full Name
              </label>

              {fullName && (
                <span
                  className={`text-[10px] ${
                    isNameValid
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {isNameValid
                    ? "✓ Valid"
                    : "Min 2 chars"}
                </span>
              )}
            </div>

            <input
              type="text"
              required
              autoComplete="name"
              value={
                fullName
              }
              onChange={(
                event
              ) => {
                setFullName(
                  event.target.value
                );

                setErrorMsg(
                  ""
                );
              }}
              placeholder="Juan Dela Cruz"
              maxLength={100}
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500"
            />
          </div>

          {/* =================================================
              USERNAME
          ================================================= */}

          <div>

            <div className="flex justify-between items-center mb-1">

              <label className="text-slate-400 text-xs font-semibold uppercase">
                Username
              </label>

              {username && (
                <span
                  className={`text-[10px] ${
                    isUsernameValid
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {isUsernameValid
                    ? "✓ Valid"
                    : "3–30 chars"}
                </span>
              )}
            </div>

            <div className="relative">

              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                @
              </span>

              <input
                type="text"
                required
                autoComplete="username"
                value={
                  username
                }
                onChange={
                  handleUsernameChange
                }
                placeholder="juandelacruz"
                minLength={3}
                maxLength={30}
                spellCheck={false}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-2">

              <span className="text-[10px] text-slate-500">
                Letters, numbers, dot, underscore and hyphen only.
              </span>

              <span className="text-[10px] text-slate-400 font-medium">
                {usernamePreview}
              </span>
            </div>

            <div className="mt-1 text-[10px] text-slate-500">
              Your username is used for chat search and @mentions.
            </div>
          </div>

          {/* =================================================
              EMAIL
          ================================================= */}

          <div>

            <div className="flex justify-between items-center mb-1">

              <label className="text-slate-400 text-xs font-semibold uppercase">
                Email Address
              </label>

              {email && (
                <span
                  className={`text-[10px] ${
                    isEmailValid
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {isEmailValid
                    ? "✓ Valid Email"
                    : "Invalid format"}
                </span>
              )}
            </div>

            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(
                event
              ) => {
                setEmail(
                  event.target.value
                );

                setErrorMsg(
                  ""
                );
              }}
              placeholder="user@example.com"
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500"
            />
          </div>

          {/* =================================================
              PASSWORD
          ================================================= */}

          <div>

            <div className="flex justify-between items-center mb-1">

              <label className="text-slate-400 text-xs font-semibold uppercase">
                Password
              </label>

              {password && (
                <span
                  className={`text-[10px] ${
                    isPasswordValid
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {isPasswordValid
                    ? "✓ Valid"
                    : "Min 6 chars"}
                </span>
              )}
            </div>

            <div className="relative">

              <input
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                required
                autoComplete="new-password"
                value={
                  password
                }
                onChange={(
                  event
                ) => {
                  setPassword(
                    event.target.value
                  );

                  setErrorMsg(
                    ""
                  );
                }}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500 pr-12"
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword(
                    (previous) =>
                      !previous
                  )
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
              >
                {showPassword
                  ? "🙈"
                  : "👁️"}
              </button>
            </div>
          </div>

          {/* =================================================
              AGE / TERMS
          ================================================= */}

          <div className="flex items-start gap-2.5 pt-1">

            <input
              type="checkbox"
              id="ageCheck"
              required
              checked={
                is18Plus
              }
              onChange={(
                event
              ) =>
                setIs18Plus(
                  event.target.checked
                )
              }
              className="mt-0.5 rounded bg-slate-950 border-slate-800 text-red-600 focus:ring-0 cursor-pointer"
            />

            <label
              htmlFor="ageCheck"
              className="text-xs text-slate-300 cursor-pointer leading-tight"
            >
              I confirm that I meet the required age and agree to the Terms of Service.
            </label>
          </div>

          {/* =================================================
              SUBMIT
          ================================================= */}

          <button
            type="submit"
            disabled={
              !canSubmit
            }
            className="w-full bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-red-950/50 mt-2"
          >
            {loading
              ? "Creating Account..."
              : "Create Account"}
          </button>
        </form>

        {/* =================================================
            LOGIN
        ================================================= */}

        <div className="text-center text-xs text-slate-400">
          Already have an account?{" "}

          <Link
            to="/login"
            className="text-red-500 hover:underline font-semibold"
          >
            Log In
          </Link>
        </div>
      </div>
    </div>
  );
}