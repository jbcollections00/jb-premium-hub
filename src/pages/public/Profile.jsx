import React, {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  supabase,
} from "../../services/supabaseClient";

import UserSupportTicket from "./UserSupportTicket";

export default function Profile() {
  const [
    user,
    setUser,
  ] = useState(null);

  const [
    profileData,
    setProfileData,
  ] = useState(null);

  const [
    expirationDate,
    setExpirationDate,
  ] = useState(null);

  const [
    timeLeft,
    setTimeLeft,
  ] = useState(null);

  const [
    codeHistory,
    setCodeHistory,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  /* =========================================================
     PROFILE EDIT STATE
  ========================================================= */

  const [
    displayName,
    setDisplayName,
  ] = useState("");

  const [
    username,
    setUsername,
  ] = useState("");

  const [
    avatarUrl,
    setAvatarUrl,
  ] = useState("");

  const [
    bio,
    setBio,
  ] = useState("");

  const [
    updatingProfile,
    setUpdatingProfile,
  ] = useState(false);

  const [
    profileMsg,
    setProfileMsg,
  ] = useState({
    type: "",
    text: "",
  });

  /* =========================================================
     AVATAR UPLOAD STATE
  ========================================================= */

  const [
    avatarFile,
    setAvatarFile,
  ] = useState(null);

  const [
    avatarPreview,
    setAvatarPreview,
  ] = useState("");

  const [
    uploadingAvatar,
    setUploadingAvatar,
  ] = useState(false);

  const [
    avatarMsg,
    setAvatarMsg,
  ] = useState({
    type: "",
    text: "",
  });

  /* =========================================================
     ACCESS CODE STATE
  ========================================================= */

  const [
    accessCode,
    setAccessCode,
  ] = useState("");

  const [
    redeemLoading,
    setRedeemLoading,
  ] = useState(false);

  const [
    redeemMsg,
    setRedeemMsg,
  ] = useState({
    type: "",
    text: "",
  });

  /* =========================================================
     PASSWORD RESET STATE
  ========================================================= */

  const [
    resetLoading,
    setResetLoading,
  ] = useState(false);

  const [
    resetMsg,
    setResetMsg,
  ] = useState({
    type: "",
    text: "",
  });

  /* =========================================================
     DELETE ACCOUNT STATE
  ========================================================= */

  const [
    showDeleteModal,
    setShowDeleteModal,
  ] = useState(false);

  const [
    deleteConfirmText,
    setDeleteConfirmText,
  ] = useState("");

  const [
    deletingAccount,
    setDeletingAccount,
  ] = useState(false);

  const [
    deleteError,
    setDeleteError,
  ] = useState("");

  /* =========================================================
     FAQ
  ========================================================= */

  const [
    openFaq,
    setOpenFaq,
  ] = useState(null);

  const navigate =
    useNavigate();

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    fetchUserData();
  }, []);

  /* =========================================================
     CLEANUP LOCAL AVATAR PREVIEW
  ========================================================= */

  useEffect(() => {
    return () => {
      if (
        avatarPreview &&
        avatarPreview.startsWith(
          "blob:"
        )
      ) {
        URL.revokeObjectURL(
          avatarPreview
        );
      }
    };
  }, [
    avatarPreview,
  ]);

  /* =========================================================
     VIP TIMER
  ========================================================= */

  useEffect(() => {
    if (
      !expirationDate
    ) {
      return;
    }

    const timer =
      setInterval(
        () => {
          const calculated =
            calculateTimeLeft(
              expirationDate
            );

          setTimeLeft(
            calculated
          );
        },
        1000
      );

    return () =>
      clearInterval(
        timer
      );
  }, [
    expirationDate,
  ]);

  /* =========================================================
     FETCH USER DATA
  ========================================================= */

  const fetchUserData =
    async () => {
      try {
        const {
          data: {
            user,
          },
          error:
            userError,
        } =
          await supabase.auth.getUser();

        if (
          userError ||
          !user
        ) {
          throw (
            userError ||
            new Error(
              "No authenticated user."
            )
          );
        }

        setUser(
          user
        );

        /* ===============================================
           PROFILE
        =============================================== */

        const {
          data:
            profile,
          error:
            profileError,
        } =
          await supabase
            .from(
              "profiles"
            )
            .select(
              "*"
            )
            .eq(
              "id",
              user.id
            )
            .maybeSingle();

        if (
          profileError
        ) {
          throw profileError;
        }

        if (
          profile
        ) {
          setProfileData(
            profile
          );

          setDisplayName(
            profile.full_name ||
              user.email?.split(
                "@"
              )[0] ||
              ""
          );

          setUsername(
            profile.username ||
              ""
          );

          setAvatarUrl(
            profile.avatar_url ||
              ""
          );

          setBio(
            profile.bio ||
              ""
          );
        } else {
          setProfileData(
            null
          );

          setDisplayName(
            user.email?.split(
              "@"
            )[0] ||
              ""
          );

          setUsername(
            ""
          );

          setAvatarUrl(
            ""
          );

          setBio(
            ""
          );
        }

        /* ===============================================
           VIP
        =============================================== */

        if (
          profile?.vip_until
        ) {
          setExpirationDate(
            profile.vip_until
          );

          setTimeLeft(
            calculateTimeLeft(
              profile.vip_until
            )
          );
        } else {
          setExpirationDate(
            null
          );

          setTimeLeft(
            null
          );
        }

        /* ===============================================
           CODE HISTORY
        =============================================== */

        const {
          data:
            history,
          error:
            historyError,
        } =
          await supabase
            .from(
              "access_codes"
            )
            .select(
              "*"
            )
            .eq(
              "used_by",
              user.id
            )
            .order(
              "used_at",
              {
                ascending:
                  false,
              }
            );

        if (
          historyError
        ) {
          throw historyError;
        }

        setCodeHistory(
          history ||
            []
        );
      } catch (error) {
        console.error(
          "Error fetching profile data:",
          error?.message ||
            error
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  /* =========================================================
     VIP TIME LEFT
  ========================================================= */

  const calculateTimeLeft =
    (
      expDate
    ) => {
      if (
        !expDate
      ) {
        return null;
      }

      const difference =
        new Date(
          expDate
        ) -
        new Date();

      if (
        difference <= 0
      ) {
        return {
          expired: true,
        };
      }

      return {
        days:
          Math.floor(
            difference /
              (
                1000 *
                60 *
                60 *
                24
              )
          ),

        hours:
          Math.floor(
            (
              difference /
              (
                1000 *
                60 *
                60
              )
            ) %
              24
          ),

        minutes:
          Math.floor(
            (
              difference /
              1000 /
              60
            ) %
              60
          ),

        seconds:
          Math.floor(
            (
              difference /
              1000
            ) %
              60
          ),

        expired:
          false,
      };
    };

  /* =========================================================
     PROFILE UPDATE
  ========================================================= */

  const handleUpdateProfile =
    async (
      e
    ) => {
      e.preventDefault();

      if (
        !displayName.trim() ||
        !user?.id
      ) {
        return;
      }

      const cleanUsername =
        username
          .trim()
          .toLowerCase();

      if (
        cleanUsername &&
        !/^[a-zA-Z0-9._-]{3,30}$/.test(
          cleanUsername
        )
      ) {
        setProfileMsg({
          type:
            "error",

          text:
            "Username must be 3–30 characters and may only contain letters, numbers, dots, underscores, and hyphens.",
        });

        return;
      }

      setUpdatingProfile(
        true
      );

      setProfileMsg({
        type: "",
        text: "",
      });

      try {
        const {
          error,
        } =
          await supabase
            .from(
              "profiles"
            )
            .update({
              full_name:
                displayName.trim(),

              username:
                cleanUsername ||
                null,

              bio:
                bio.trim() ||
                null,
            })
            .eq(
              "id",
              user.id
            );

        if (
          error
        ) {
          if (
            error.code ===
              "23505" ||
            error.message
              ?.toLowerCase()
              .includes(
                "duplicate"
              )
          ) {
            throw new Error(
              "That username is already taken."
            );
          }

          throw error;
        }

        setProfileMsg({
          type:
            "success",

          text:
            "Profile updated successfully!",
        });

        await fetchUserData();
      } catch (err) {
        setProfileMsg({
          type:
            "error",

          text:
            err?.message ||
            "Failed to update profile.",
        });
      } finally {
        setUpdatingProfile(
          false
        );
      }
    };

  /* =========================================================
     AVATAR FILE SELECTION
  ========================================================= */

  const handleAvatarFileChange =
    (
      event
    ) => {
      const file =
        event.target.files?.[0];

      setAvatarMsg({
        type: "",
        text: "",
      });

      if (!file) {
        setAvatarFile(
          null
        );

        return;
      }

      if (
        !file.type.startsWith(
          "image/"
        )
      ) {
        setAvatarMsg({
          type:
            "error",

          text:
            "Please select an image file.",
        });

        event.target.value =
          "";

        return;
      }

      const maxSize =
        5 * 1024 * 1024;

      if (
        file.size >
        maxSize
      ) {
        setAvatarMsg({
          type:
            "error",

          text:
            "Image is too large. Maximum size is 5 MB.",
        });

        event.target.value =
          "";

        return;
      }

      if (
        avatarPreview &&
        avatarPreview.startsWith(
          "blob:"
        )
      ) {
        URL.revokeObjectURL(
          avatarPreview
        );
      }

      const preview =
        URL.createObjectURL(
          file
        );

      setAvatarFile(
        file
      );

      setAvatarPreview(
        preview
      );
    };

  /* =========================================================
     DELETE OLD AVATAR FILES
  ========================================================= */

  const removeStoredAvatarFiles =
    async () => {
      if (
        !user?.id
      ) {
        return;
      }

      const {
        data,
        error,
      } =
        await supabase.storage
          .from(
            "profile-avatars"
          )
          .list(
            user.id,
            {
              limit: 100,
            }
          );

      if (
        error
      ) {
        console.error(
          "List avatar files error:",
          error
        );

        throw error;
      }

      const files =
        (data || [])
          .filter(
            (item) =>
              item?.name
          )
          .map(
            (item) =>
              `${user.id}/${item.name}`
          );

      if (
        files.length ===
        0
      ) {
        return;
      }

      const {
        error:
          removeError,
      } =
        await supabase.storage
          .from(
            "profile-avatars"
          )
          .remove(
            files
          );

      if (
        removeError
      ) {
        console.error(
          "Remove old avatar error:",
          removeError
        );

        throw removeError;
      }
    };

  /* =========================================================
     UPLOAD AVATAR
  ========================================================= */

  const handleUploadAvatar =
    async () => {
      if (
        !user?.id ||
        !avatarFile
      ) {
        return;
      }

      setUploadingAvatar(
        true
      );

      setAvatarMsg({
        type: "",
        text: "",
      });

      try {
        /*
          Remove old avatar files first.
        */
        await removeStoredAvatarFiles();

        const safeName =
          avatarFile.name
            .replace(
              /[^a-zA-Z0-9._-]/g,
              "_"
            )
            .slice(
              0,
              100
            );

        const storagePath =
          `${user.id}/${Date.now()}-${safeName}`;

        const {
          error:
            uploadError,
        } =
          await supabase.storage
            .from(
              "profile-avatars"
            )
            .upload(
              storagePath,
              avatarFile,
              {
                upsert:
                  false,

                cacheControl:
                  "3600",

                contentType:
                  avatarFile.type,
              }
            );

        if (
          uploadError
        ) {
          throw uploadError;
        }

        const {
          data:
            publicUrlData,
        } =
          supabase.storage
            .from(
              "profile-avatars"
            )
            .getPublicUrl(
              storagePath
            );

        const publicUrl =
          publicUrlData?.publicUrl;

        if (
          !publicUrl
        ) {
          throw new Error(
            "Unable to create avatar URL."
          );
        }

        const {
          error:
            profileError,
        } =
          await supabase
            .from(
              "profiles"
            )
            .update({
              avatar_url:
                publicUrl,
            })
            .eq(
              "id",
              user.id
            );

        if (
          profileError
        ) {
          /*
            Cleanup uploaded file if profile update fails.
          */
          await supabase.storage
            .from(
              "profile-avatars"
            )
            .remove([
              storagePath,
            ]);

          throw profileError;
        }

        setAvatarUrl(
          publicUrl
        );

        setAvatarFile(
          null
        );

        if (
          avatarPreview &&
          avatarPreview.startsWith(
            "blob:"
          )
        ) {
          URL.revokeObjectURL(
            avatarPreview
          );
        }

        setAvatarPreview(
          ""
        );

        setAvatarMsg({
          type:
            "success",

          text:
            "Profile picture updated successfully!",
        });

        await fetchUserData();
      } catch (error) {
        console.error(
          "Upload avatar error:",
          error
        );

        setAvatarMsg({
          type:
            "error",

          text:
            error?.message ||
            "Unable to upload profile picture.",
        });
      } finally {
        setUploadingAvatar(
          false
        );
      }
    };

  /* =========================================================
     REMOVE AVATAR
  ========================================================= */

  const handleRemoveAvatar =
    async () => {
      if (
        !user?.id
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          "Remove your profile picture?"
        );

      if (
        !confirmed
      ) {
        return;
      }

      setUploadingAvatar(
        true
      );

      setAvatarMsg({
        type: "",
        text: "",
      });

      try {
        await removeStoredAvatarFiles();

        const {
          error,
        } =
          await supabase
            .from(
              "profiles"
            )
            .update({
              avatar_url:
                null,
            })
            .eq(
              "id",
              user.id
            );

        if (
          error
        ) {
          throw error;
        }

        if (
          avatarPreview &&
          avatarPreview.startsWith(
            "blob:"
          )
        ) {
          URL.revokeObjectURL(
            avatarPreview
          );
        }

        setAvatarPreview(
          ""
        );

        setAvatarFile(
          null
        );

        setAvatarUrl(
          ""
        );

        setAvatarMsg({
          type:
            "success",

          text:
            "Profile picture removed.",
        });

        await fetchUserData();
      } catch (error) {
        console.error(
          "Remove avatar error:",
          error
        );

        setAvatarMsg({
          type:
            "error",

          text:
            error?.message ||
            "Unable to remove profile picture.",
        });
      } finally {
        setUploadingAvatar(
          false
        );
      }
    };

  /* =========================================================
     PASSWORD RESET
  ========================================================= */

  const handleResetPassword =
    async () => {
      if (
        !user?.email
      ) {
        return;
      }

      setResetLoading(
        true
      );

      setResetMsg({
        type: "",
        text: "",
      });

      try {
        const {
          error,
        } =
          await supabase.auth.resetPasswordForEmail(
            user.email,
            {
              redirectTo:
                `${window.location.origin}/reset-password`,
            }
          );

        if (
          error
        ) {
          throw error;
        }

        setResetMsg({
          type:
            "success",

          text:
            "Password reset link sent to your email!",
        });
      } catch (err) {
        setResetMsg({
          type:
            "error",

          text:
            err?.message ||
            "Unable to send password reset link.",
        });
      } finally {
        setResetLoading(
          false
        );
      }
    };

  /* =========================================================
     DELETE ACCOUNT
  ========================================================= */

  const handleDeleteAccount =
    async () => {
      if (
        deleteConfirmText !==
        "DELETE"
      ) {
        return;
      }

      setDeletingAccount(
        true
      );

      setDeleteError(
        ""
      );

      try {
        const {
          data: {
            session,
          },
          error:
            sessionError,
        } =
          await supabase.auth.getSession();

        if (
          sessionError
        ) {
          throw sessionError;
        }

        if (
          !session?.access_token
        ) {
          throw new Error(
            "No active authenticated session."
          );
        }

        const {
          data,
          error,
        } =
          await supabase.functions.invoke(
            "delete-account",
            {
              headers: {
                Authorization:
                  `Bearer ${session.access_token}`,
              },
            }
          );

        if (
          error
        ) {
          throw error;
        }

        if (
          !data?.success
        ) {
          throw new Error(
            data?.message ||
            "Unable to delete account."
          );
        }

        await supabase.auth.signOut({
          scope:
            "local",
        });

        setShowDeleteModal(
          false
        );

        setDeleteConfirmText(
          ""
        );

        setDeleteError(
          ""
        );

        navigate(
          "/",
          {
            replace:
              true,
          }
        );
      } catch (err) {
        console.error(
          "Delete account error:",
          err
        );

        setDeleteError(
          "Failed to delete account: " +
            (
              err?.message ||
              "Unknown error"
            )
        );

        setDeletingAccount(
          false
        );
      }
    };

  /* =========================================================
     REDEEM ACCESS CODE
  ========================================================= */

  const handleRedeemCode =
    async (
      e
    ) => {
      e.preventDefault();

      if (
        !accessCode.trim()
      ) {
        return;
      }

      setRedeemLoading(
        true
      );

      setRedeemMsg({
        type: "",
        text: "",
      });

      try {
        const {
          data,
          error,
        } =
          await supabase.rpc(
            "redeem_access_code",
            {
              p_code:
                accessCode
                  .trim()
                  .toUpperCase(),
            }
          );

        if (
          error
        ) {
          throw error;
        }

        if (
          !data?.success
        ) {
          setRedeemMsg({
            type:
              "error",

            text:
              data?.message ||
              "Invalid or already used access code.",
          });

          return;
        }

        const expiresAt =
          data.expires_at
            ? new Date(
                data.expires_at
              )
            : null;

        setRedeemMsg({
          type:
            "success",

          text:
            expiresAt
              ? `Success! Code applied. New Expiration: ${expiresAt.toLocaleDateString(
                  "en-US"
                )}`
              : "Success! Code applied.",
        });

        setAccessCode(
          ""
        );

        await fetchUserData();
      } catch (err) {
        setRedeemMsg({
          type:
            "error",

          text:
            "Failed to redeem: " +
            (
              err?.message ||
              "Unknown error"
            ),
        });
      } finally {
        setRedeemLoading(
          false
        );
      }
    };

  /* =========================================================
     FORMAT DATE
  ========================================================= */

  const formatDate =
    (
      dateString
    ) => {
      if (
        !dateString
      ) {
        return "N/A";
      }

      return new Date(
        dateString
      ).toLocaleDateString(
        "en-US",
        {
          year:
            "numeric",

          month:
            "short",

          day:
            "numeric",
        }
      );
    };

  /* =========================================================
     LOADING
  ========================================================= */

  if (
    loading
  ) {
    return (
      <div className="min-h-[80vh] bg-slate-950 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
      </div>
    );
  }

  /* =========================================================
     ACCOUNT TYPE
  ========================================================= */

  const rawAccountType =
    (
      profileData?.account_type ||
      "STANDARD"
    ).toLowerCase();

  const role =
    (
      profileData?.role ||
      ""
    ).toLowerCase();

  const isAdmin =
    rawAccountType ===
      "admin" ||
    role ===
      "admin";

  const hasActiveVipDate =
    expirationDate &&
    new Date(
      expirationDate
    ) >
      new Date();

  const isVip =
    isAdmin ||
    (
      rawAccountType ===
        "vip" &&
      Boolean(
        hasActiveVipDate
      )
    );

  /* =========================================================
     FAQ DATA
  ========================================================= */

  const faqs = [
    {
      q:
        "How do I activate or extend my VIP membership?",

      a:
        "Enter your purchased Access Code in the 'Redeem Access Code' section above. Extra days automatically stack onto your current subscription expiration.",
    },
    {
      q:
        "What happens when my VIP status expires?",

      a:
        "Your account reverts to Standard status until renewed.",
    },
    {
      q:
        "How can I buy an Access Code?",

      a:
        "Use the account's purchase page or contact Admin Support.",
    },
  ];

  /* =========================================================
     CURRENT AVATAR TO SHOW
  ========================================================= */

  const displayedAvatar =
    avatarPreview ||
    avatarUrl ||
    "";

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-10 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* =================================================
            HEADER
        ================================================= */}

        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Account Dashboard
          </h1>

          <p className="text-slate-400 text-sm mt-1">
            Manage your profile,
            active subscription
            status, and security
            settings.
          </p>
        </div>

        {/* =================================================
            TOP SECTION
        ================================================= */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* =================================================
              LEFT SIDE
          ================================================= */}

          <div className="space-y-6">

            {/* =================================================
                PROFILE CARD
            ================================================= */}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-xl relative overflow-hidden">

              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-600 via-amber-500 to-amber-300" />

              <div className="w-24 h-24 mx-auto bg-slate-800 rounded-full flex items-center justify-center border-4 border-slate-950 shadow-inner my-3 relative overflow-visible">

                <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">

                  {displayedAvatar ? (
                    <img
                      src={
                        displayedAvatar
                      }
                      alt={
                        displayName ||
                        "Profile"
                      }
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl font-extrabold text-slate-300 uppercase">
                      {(
                        displayName ||
                        user?.email
                      )?.charAt(
                        0
                      )}
                    </span>
                  )}
                </div>

                <span className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 border-4 border-slate-900 rounded-full" />
              </div>

              <h2 className="text-lg font-bold text-white truncate">
                {displayName ||
                  "User"}
              </h2>

              {profileData?.username && (
                <p className="mt-1 text-sm font-semibold text-blue-400 truncate">
                  @
                  {
                    profileData.username
                  }
                </p>
              )}

              {profileData?.bio && (
                <p className="mt-2 text-xs text-slate-400 leading-relaxed break-words">
                  {
                    profileData.bio
                  }
                </p>
              )}

              <p className="text-xs text-slate-400 truncate mt-2 mb-3">
                {user?.email}
              </p>

              {/* ACCOUNT BADGE */}
              {isAdmin ? (
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border bg-purple-500/20 text-purple-400 border-purple-500/40">
                  ⚙️ Admin Member
                </span>
              ) : isVip ? (
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border bg-amber-500/10 text-amber-400 border-amber-500/30">
                  👑 VIP Member
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border bg-blue-500/10 text-blue-400 border-blue-500/30">
                  👤 Standard Member
                </span>
              )}

              {/* BUY VIP */}
              <button
                onClick={() =>
                  navigate(
                    "/buy-vip"
                  )
                }
                className="w-full mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs py-3 px-4 rounded-xl shadow-lg shadow-amber-950/40 transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider"
              >
                👑 Buy 30 Days VIP
              </button>

              {/* VIP COUNTDOWN */}
              {isVip &&
                expirationDate && (
                  <div className="mt-4 p-4 rounded-xl bg-slate-950/90 border border-amber-500/20 text-left">

                    <p className="text-[11px] uppercase font-bold text-amber-400 tracking-wider text-center mb-2">
                      ⏳ VIP Remaining
                      Access Time
                    </p>

                    {timeLeft?.expired ? (
                      <p className="text-xs font-bold text-rose-500 text-center py-1">
                        MEMBERSHIP EXPIRED
                      </p>
                    ) : timeLeft ? (
                      <div className="grid grid-cols-4 gap-1.5 text-center">

                        <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                          <span className="text-base font-black text-white block">
                            {
                              timeLeft.days
                            }
                          </span>

                          <span className="text-[9px] text-slate-400 uppercase">
                            Days
                          </span>
                        </div>

                        <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                          <span className="text-base font-black text-white block">
                            {
                              timeLeft.hours
                            }
                          </span>

                          <span className="text-[9px] text-slate-400 uppercase">
                            Hours
                          </span>
                        </div>

                        <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                          <span className="text-base font-black text-white block">
                            {
                              timeLeft.minutes
                            }
                          </span>

                          <span className="text-[9px] text-slate-400 uppercase">
                            Mins
                          </span>
                        </div>

                        <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                          <span className="text-base font-black text-amber-400 block">
                            {
                              timeLeft.seconds
                            }
                          </span>

                          <span className="text-[9px] text-slate-400 uppercase">
                            Secs
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
            </div>

            {/* =================================================
                VIP PERKS
            ================================================= */}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">

              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="text-amber-400">
                  ✨
                </span>

                VIP Member Advantages
              </h3>

              <ul className="space-y-3 text-xs text-slate-300">

                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">
                    ✓
                  </span>

                  Account-based VIP
                  access
                </li>

                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">
                    ✓
                  </span>

                  Subscription
                  expiration tracking
                </li>

                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">
                    ✓
                  </span>

                  Access-code history
                </li>
              </ul>
            </div>
          </div>

          {/* =================================================
              RIGHT SIDE
          ================================================= */}

          <div className="lg:col-span-2 space-y-6">

            {/* =================================================
                REDEEM CODE
            ================================================= */}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">

              <div className="mb-4">

                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  🔑 Redeem Access Code
                </h3>

                <p className="text-xs text-slate-400 mt-1">
                  Enter your activation
                  code below to start or
                  extend your
                  subscription.
                </p>
              </div>

              <form
                onSubmit={
                  handleRedeemCode
                }
                className="space-y-3"
              >

                <div className="flex flex-col sm:flex-row gap-3">

                  <input
                    type="text"
                    value={
                      accessCode
                    }
                    onChange={(
                      e
                    ) =>
                      setAccessCode(
                        e.target.value
                      )
                    }
                    placeholder="ENTER CODE (E.G. VIP-XXXXXX)"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm uppercase font-mono tracking-wider focus:outline-none focus:border-red-500 transition-all"
                  />

                  <button
                    type="submit"
                    disabled={
                      redeemLoading
                    }
                    className="bg-red-600 hover:bg-red-500 disabled:bg-slate-800 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shrink-0 cursor-pointer shadow-lg shadow-red-950/50"
                  >
                    {redeemLoading
                      ? "Processing..."
                      : "Activate Code"}
                  </button>
                </div>

                {redeemMsg.text && (
                  <p
                    className={`text-xs font-bold mt-2 ${
                      redeemMsg.type ===
                      "success"
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {
                      redeemMsg.text
                    }
                  </p>
                )}
              </form>
            </div>

            {/* =================================================
                PERSONAL DETAILS
            ================================================= */}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">

              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                👤 Personal Details
              </h3>

              <form
                onSubmit={
                  handleUpdateProfile
                }
                className="space-y-5"
              >

                {/* DISPLAY NAME */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">

                  <label className="text-xs font-semibold text-slate-400 uppercase">
                    Display Name
                  </label>

                  <div className="sm:col-span-2">

                    <input
                      type="text"
                      value={
                        displayName
                      }
                      onChange={(
                        e
                      ) =>
                        setDisplayName(
                          e.target.value
                        )
                      }
                      maxLength={
                        80
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-red-500"
                    />

                    <p className="mt-1.5 text-[11px] text-slate-500">
                      This is the name
                      shown to other
                      users.
                    </p>
                  </div>
                </div>

                {/* USERNAME */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">

                  <label className="text-xs font-semibold text-slate-400 uppercase pt-2.5">
                    Username
                  </label>

                  <div className="sm:col-span-2">

                    <div className="flex items-center rounded-xl border border-slate-800 bg-slate-950 focus-within:border-blue-500">

                      <span className="pl-4 text-sm font-semibold text-blue-400">
                        @
                      </span>

                      <input
                        type="text"
                        value={
                          username
                        }
                        onChange={(
                          e
                        ) => {
                          const value =
                            e.target.value
                              .replace(
                                /^@+/,
                                ""
                              )
                              .toLowerCase();

                          setUsername(
                            value
                          );
                        }}
                        minLength={
                          3
                        }
                        maxLength={
                          30
                        }
                        placeholder="yourusername"
                        autoComplete="off"
                        spellCheck={
                          false
                        }
                        className="min-w-0 flex-1 bg-transparent px-1 py-2.5 pr-4 text-sm text-white outline-none"
                      />
                    </div>

                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                      Used for chat
                      mentions. 3–30
                      characters. Letters,
                      numbers, dots,
                      underscores and
                      hyphens only.
                    </p>

                    {username &&
                      !/^[a-zA-Z0-9._-]{3,30}$/.test(
                        username.trim()
                      ) && (
                        <p className="mt-1 text-[11px] font-semibold text-rose-400">
                          Invalid username
                          format.
                        </p>
                      )}

                    {username &&
                      /^[a-zA-Z0-9._-]{3,30}$/.test(
                        username.trim()
                      ) && (
                        <p className="mt-1 text-[11px] font-semibold text-emerald-400">
                          Your mention will
                          be @
                          {
                            username.trim()
                          }
                        </p>
                      )}
                  </div>
                </div>

                {/* PROFILE PICTURE */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">

                  <label className="text-xs font-semibold text-slate-400 uppercase pt-2.5">
                    Profile Picture
                  </label>

                  <div className="sm:col-span-2 space-y-3">

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">

                      <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">

                        {displayedAvatar ? (
                          <img
                            src={
                              displayedAvatar
                            }
                            alt="Avatar preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-2xl font-bold text-slate-400 uppercase">
                            {(
                              displayName ||
                              user?.email
                            )?.charAt(
                              0
                            )}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 w-full">

                        <input
                          type="file"
                          accept="image/*"
                          onChange={
                            handleAvatarFileChange
                          }
                          disabled={
                            uploadingAvatar
                          }
                          className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2.5 file:text-xs file:font-bold file:text-white hover:file:bg-blue-500 file:cursor-pointer cursor-pointer"
                        />

                        <p className="mt-2 text-[11px] text-slate-500">
                          JPG, PNG, WEBP or other image formats. Maximum 5 MB.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">

                      <button
                        type="button"
                        onClick={
                          handleUploadAvatar
                        }
                        disabled={
                          uploadingAvatar ||
                          !avatarFile
                        }
                        className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all"
                      >
                        {uploadingAvatar
                          ? "Uploading..."
                          : avatarUrl
                          ? "Replace Avatar"
                          : "Upload Avatar"}
                      </button>

                      {(avatarUrl ||
                        avatarPreview) && (
                        <button
                          type="button"
                          onClick={
                            handleRemoveAvatar
                          }
                          disabled={
                            uploadingAvatar
                          }
                          className="bg-rose-950 hover:bg-rose-900 disabled:opacity-50 text-rose-300 border border-rose-800/60 text-xs font-bold px-4 py-2.5 rounded-xl transition-all"
                        >
                          Remove Avatar
                        </button>
                      )}
                    </div>

                    {avatarFile && (
                      <p className="text-[11px] text-emerald-400 font-semibold">
                        Selected:{" "}
                        {
                          avatarFile.name
                        }
                      </p>
                    )}

                    {avatarMsg.text && (
                      <p
                        className={`text-xs font-bold ${
                          avatarMsg.type ===
                          "success"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {
                          avatarMsg.text
                        }
                      </p>
                    )}

                    <p className="text-[11px] text-slate-500">
                      Your profile picture will appear in direct chats, search results, groups and channels.
                    </p>
                  </div>
                </div>

                {/* BIO */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">

                  <label className="text-xs font-semibold text-slate-400 uppercase pt-2.5">
                    Bio
                  </label>

                  <div className="sm:col-span-2">

                    <textarea
                      value={
                        bio
                      }
                      onChange={(
                        e
                      ) =>
                        setBio(
                          e.target.value.slice(
                            0,
                            160
                          )
                        )
                      }
                      rows={
                        3
                      }
                      maxLength={
                        160
                      }
                      placeholder="Tell people a little about yourself..."
                      className="w-full resize-none bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-red-500"
                    />

                    <div className="mt-1 flex justify-between text-[11px] text-slate-500">

                      <span>
                        Shown on your profile.
                      </span>

                      <span>
                        {
                          bio.length
                        }
                        /160
                      </span>
                    </div>
                  </div>
                </div>

                {/* SAVE PROFILE */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                  <div />

                  <div className="sm:col-span-2">

                    <button
                      type="submit"
                      disabled={
                        updatingProfile ||
                        !displayName.trim() ||
                        (
                          username.trim() &&
                          !/^[a-zA-Z0-9._-]{3,30}$/.test(
                            username.trim()
                          )
                        )
                      }
                      className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all cursor-pointer"
                    >
                      {updatingProfile
                        ? "Saving..."
                        : "Save Profile"}
                    </button>
                  </div>
                </div>

                {profileMsg.text && (
                  <p
                    className={`text-xs font-bold ${
                      profileMsg.type ===
                      "success"
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {
                      profileMsg.text
                    }
                  </p>
                )}
              </form>
            </div>

            {/* =================================================
                ACCOUNT DETAILS
            ================================================= */}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">

              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                🛡️ Account Details &
                Security
              </h3>

              <div className="space-y-4 text-xs">

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-3 border-b border-slate-800/80">

                  <span className="text-slate-400 font-medium">
                    User ID
                  </span>

                  <span className="sm:col-span-2 text-slate-300 font-mono bg-slate-950 p-2 rounded-lg truncate">
                    {
                      user?.id
                    }
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-3 border-b border-slate-800/80">

                  <span className="text-slate-400 font-medium">
                    Email Address
                  </span>

                  <span className="sm:col-span-2 text-slate-200 font-semibold">
                    {
                      user?.email
                    }
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-3 border-b border-slate-800/80">

                  <span className="text-slate-400 font-medium">
                    Username
                  </span>

                  <span className="sm:col-span-2 font-semibold text-blue-400">
                    {profileData?.username
                      ? `@${profileData.username}`
                      : "Not set"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-3 border-b border-slate-800/80">

                  <span className="text-slate-400 font-medium">
                    VIP Expiration
                    Date
                  </span>

                  <span className="sm:col-span-2 text-amber-400 font-bold">
                    {expirationDate
                      ? formatDate(
                          expirationDate
                        )
                      : "No Active VIP Subscription"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center pt-2">

                  <span className="text-slate-400 font-medium">
                    Password Management
                  </span>

                  <div className="sm:col-span-2">

                    <button
                      onClick={
                        handleResetPassword
                      }
                      disabled={
                        resetLoading
                      }
                      className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer"
                    >
                      {resetLoading
                        ? "Sending Link..."
                        : "🔑 Request Password Reset Link"}
                    </button>

                    {resetMsg.text && (
                      <p
                        className={`text-xs font-bold mt-2 ${
                          resetMsg.type ===
                          "success"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {
                          resetMsg.text
                        }
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* =================================================
                DANGER ZONE
            ================================================= */}

            <div className="bg-slate-900 border border-rose-900/40 rounded-2xl p-6 shadow-xl">

              <h3 className="text-lg font-bold text-rose-400 mb-2 flex items-center gap-2">
                ⚠️ Danger Zone
              </h3>

              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Permanently remove your
                account and access to any
                active VIP memberships.
                This action cannot be
                undone.
              </p>

              <button
                onClick={() => {
                  setDeleteError(
                    ""
                  );

                  setDeleteConfirmText(
                    ""
                  );

                  setShowDeleteModal(
                    true
                  );
                }}
                className="bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/60 font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2"
              >
                🗑️ Delete My Account
              </button>
            </div>
          </div>
        </div>

        {/* =================================================
            SUBSCRIPTION HISTORY
        ================================================= */}

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">

          <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            📜 Subscription Code
            History
          </h3>

          <p className="text-xs text-slate-400 mb-4">
            Record of all codes you
            have successfully redeemed.
          </p>

          <div className="overflow-x-auto">

            <table className="w-full text-left text-xs text-slate-300 border-collapse">

              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">

                  <th className="py-3 px-4">
                    Code
                  </th>

                  <th className="py-3 px-4">
                    Type
                  </th>

                  <th className="py-3 px-4">
                    Days Added
                  </th>

                  <th className="py-3 px-4">
                    Redeemed On
                  </th>

                  <th className="py-3 px-4">
                    Valid Until
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/50">

                {codeHistory.length >
                0 ? (
                  codeHistory.map(
                    (
                      item
                    ) => (
                      <tr
                        key={
                          item.id
                        }
                        className="hover:bg-slate-950/40 transition-colors"
                      >

                        <td className="py-3 px-4 font-mono text-white font-bold">
                          {item.code
                            ? `${item.code.slice(
                                0,
                                4
                              )}••••${item.code.slice(
                                -4
                              )}`
                            : "N/A"}
                        </td>

                        <td className="py-3 px-4">

                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            {item.type ||
                              "VIP"}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-bold text-emerald-400">
                          +
                          {item.duration_days ||
                            30}{" "}
                          Days
                        </td>

                        <td className="py-3 px-4 text-slate-400">
                          {formatDate(
                            item.used_at
                          )}
                        </td>

                        <td className="py-3 px-4 text-slate-300">
                          {formatDate(
                            item.expires_at
                          )}
                        </td>
                      </tr>
                    )
                  )
                ) : (
                  <tr>

                    <td
                      colSpan="5"
                      className="py-6 text-center text-slate-500 italic"
                    >
                      No redeemed codes
                      found in your
                      account history.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* =================================================
            SUPPORT & FAQ
        ================================================= */}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col overflow-hidden h-[450px]">

            <UserSupportTicket
              supabase={
                supabase
              }
              user={
                user
              }
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl h-fit">

            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              ❓ Frequently Asked
              Questions
            </h3>

            <div className="space-y-3">

              {faqs.map(
                (
                  faq,
                  idx
                ) => (
                  <div
                    key={
                      idx
                    }
                    className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/50"
                  >

                    <button
                      onClick={() =>
                        setOpenFaq(
                          openFaq ===
                            idx
                            ? null
                            : idx
                        )
                      }
                      className="w-full text-left p-3 text-xs font-semibold text-slate-200 flex justify-between items-center hover:bg-slate-900 transition-colors cursor-pointer"
                    >

                      <span>
                        {
                          faq.q
                        }
                      </span>

                      <span className="text-slate-500 font-bold">
                        {openFaq ===
                        idx
                          ? "−"
                          : "+"}
                      </span>
                    </button>

                    {openFaq ===
                      idx && (
                      <div className="p-3 text-xs text-slate-400 border-t border-slate-800/80 bg-slate-950">
                        {
                          faq.a
                        }
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =================================================
          DELETE MODAL
      ================================================= */}

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">

          <div className="bg-slate-900 border border-rose-900/60 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">

            <h3 className="text-xl font-black text-rose-400 flex items-center gap-2">
              🚨 Permanently Delete
              Account?
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              This action permanently
              deletes your
              authentication account,
              profile, and dependent
              account data according
              to the configured
              database cascade rules.
              This cannot be undone.
            </p>

            <div className="space-y-2">

              <label className="text-[11px] font-bold uppercase text-slate-400 block">
                Type{" "}
                <span className="text-white font-mono font-black">
                  DELETE
                </span>{" "}
                to confirm:
              </label>

              <input
                type="text"
                value={
                  deleteConfirmText
                }
                onChange={(
                  e
                ) =>
                  setDeleteConfirmText(
                    e.target.value.toUpperCase()
                  )
                }
                placeholder="DELETE"
                autoComplete="off"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono uppercase text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            {deleteError && (
              <p className="text-xs text-rose-400 font-semibold">
                {
                  deleteError
                }
              </p>
            )}

            <div className="flex gap-3 pt-2">

              <button
                onClick={() => {
                  setShowDeleteModal(
                    false
                  );

                  setDeleteConfirmText(
                    ""
                  );

                  setDeleteError(
                    ""
                  );
                }}
                disabled={
                  deletingAccount
                }
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                onClick={
                  handleDeleteAccount
                }
                disabled={
                  deleteConfirmText !==
                    "DELETE" ||
                  deletingAccount
                }
                className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer"
              >
                {deletingAccount
                  ? "Deleting..."
                  : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}