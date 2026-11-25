import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../services/supabaseClient";

import {
  addChannelMember,
  createChannelInviteLink,
  getChannelInviteLinks,
  getConversationMembers,
  leaveChannel,
  removeChannelMember,
  revokeChannelInviteLink,
  searchUsers,
  setChannelMemberRole,
  transferChannelOwnership,
  updateChannelSettings,
} from "../../services/chatService";

/* =========================================================
   HELPERS
========================================================= */

function displayName(member) {
  return (
    member?.profiles
      ?.full_name?.trim() ||
    member?.profiles
      ?.username?.trim() ||
    "User"
  );
}

function formatDate(value) {
  if (!value) {
    return "No expiry";
  }

  try {
    return new Date(
      value
    ).toLocaleString();
  } catch {
    return value;
  }
}

/* =========================================================
   COMPONENT
========================================================= */

export default function ChannelInfoModal({
  conversation,
  currentUser,
  onClose,
  onChannelUpdated,
  onLeftChannel,
}) {
  /* =========================================================
     MEMBERS
  ========================================================= */

  const [
    members,
    setMembers,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  /* =========================================================
     CHANNEL SETTINGS
  ========================================================= */

  const [
    channelName,
    setChannelName,
  ] = useState(
    conversation?.title ||
      conversation?.displayName ||
      ""
  );

  const [
    description,
    setDescription,
  ] = useState(
    conversation?.description ||
      ""
  );

  const [
    isPrivate,
    setIsPrivate,
  ] = useState(
    conversation?.is_private !==
      false
  );

  const [
    slug,
    setSlug,
  ] = useState(
    conversation?.slug ||
      ""
  );

  const [
    savingSettings,
    setSavingSettings,
  ] = useState(false);

  /* =========================================================
     CHANNEL AVATAR
  ========================================================= */

  const [
    channelAvatarUrl,
    setChannelAvatarUrl,
  ] = useState(
    conversation?.avatar_url ||
      ""
  );

  const [
    channelAvatarFile,
    setChannelAvatarFile,
  ] = useState(null);

  const [
    channelAvatarPreview,
    setChannelAvatarPreview,
  ] = useState("");

  const [
    uploadingChannelAvatar,
    setUploadingChannelAvatar,
  ] = useState(false);

  const [
    channelAvatarMsg,
    setChannelAvatarMsg,
  ] = useState({
    type: "",
    text: "",
  });

  /* =========================================================
     USER SEARCH
  ========================================================= */

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    searchResults,
    setSearchResults,
  ] = useState([]);

  const [
    searching,
    setSearching,
  ] = useState(false);

  const [
    addingUserId,
    setAddingUserId,
  ] = useState(null);

  /* =========================================================
     MEMBER ACTIONS
  ========================================================= */

  const [
    actionUserId,
    setActionUserId,
  ] = useState(null);

  const [
    transferring,
    setTransferring,
  ] = useState(false);

  /* =========================================================
     INVITES
  ========================================================= */

  const [
    inviteLinks,
    setInviteLinks,
  ] = useState([]);

  const [
    loadingInvites,
    setLoadingInvites,
  ] = useState(false);

  const [
    creatingInvite,
    setCreatingInvite,
  ] = useState(false);

  const [
    maxUses,
    setMaxUses,
  ] = useState("");

  const [
    expiresAt,
    setExpiresAt,
  ] = useState("");

  const [
    copiedToken,
    setCopiedToken,
  ] = useState(null);

  const [
    copiedPublicLink,
    setCopiedPublicLink,
  ] = useState(false);

  /* =========================================================
     ROLE
  ========================================================= */

  const myMember =
    members.find(
      (member) =>
        member.user_id ===
        currentUser?.id
    );

  const myRole =
    myMember?.role ||
    conversation
      ?.currentMemberRole ||
    "member";

  const isOwner =
    myRole === "owner";

  const isAdmin =
    myRole === "admin";

  const isModerator =
    myRole === "moderator";

  const canAddMembers =
    isOwner ||
    isAdmin ||
    isModerator;

  const canManageInvites =
    isOwner ||
    isAdmin;

  /* =========================================================
     ACTIVE INVITES
  ========================================================= */

  const activeInvites =
    useMemo(
      () =>
        inviteLinks.filter(
          (invite) =>
            invite.is_active
        ),
      [
        inviteLinks,
      ]
    );

  /* =========================================================
     LOAD MEMBERS
  ========================================================= */

  const loadMembers =
    async () => {
      if (!conversation?.id) {
        return;
      }

      try {
        setLoading(
          true
        );

        const rows =
          await getConversationMembers(
            conversation.id
          );

        const list =
          rows || [];

        setMembers(
          list
        );

        const membership =
          list.find(
            (member) =>
              member.user_id ===
              currentUser?.id
          );

        onChannelUpdated?.({
          ...conversation,

          memberCount:
            list.length,

          currentMemberRole:
            membership?.role ||
            null,
        });
      } catch (error) {
        console.error(
          "Load channel members error:",
          error
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  /* =========================================================
     LOAD INVITES
  ========================================================= */

  const loadInviteLinks =
    async () => {
      if (
        !conversation?.id ||
        !canManageInvites
      ) {
        setInviteLinks(
          []
        );

        return;
      }

      try {
        setLoadingInvites(
          true
        );

        const rows =
          await getChannelInviteLinks(
            conversation.id
          );

        setInviteLinks(
          rows || []
        );
      } catch (error) {
        console.error(
          "Load invite links error:",
          error
        );
      } finally {
        setLoadingInvites(
          false
        );
      }
    };

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    setChannelName(
      conversation?.title ||
        conversation?.displayName ||
        ""
    );

    setDescription(
      conversation?.description ||
        ""
    );

    setIsPrivate(
      conversation?.is_private !==
        false
    );

    setSlug(
      conversation?.slug ||
        ""
    );

    setChannelAvatarUrl(
      conversation?.avatar_url ||
        ""
    );

    setChannelAvatarFile(null);
    setChannelAvatarPreview("");
    setChannelAvatarMsg({
      type: "",
      text: "",
    });

    loadMembers();
  }, [
    conversation?.id,
  ]);

  useEffect(() => {
    return () => {
      if (
        channelAvatarPreview &&
        channelAvatarPreview.startsWith(
          "blob:"
        )
      ) {
        URL.revokeObjectURL(
          channelAvatarPreview
        );
      }
    };
  }, [
    channelAvatarPreview,
  ]);

  useEffect(() => {
    if (
      canManageInvites
    ) {
      loadInviteLinks();
    }
  }, [
    conversation?.id,
    canManageInvites,
  ]);

  /* =========================================================
     SEARCH USERS
  ========================================================= */

  useEffect(() => {
    const timeout =
      setTimeout(
        async () => {
          const value =
            query.trim();

          if (
            !value ||
            !canAddMembers
          ) {
            setSearchResults(
              []
            );

            return;
          }

          try {
            setSearching(
              true
            );

            const users =
              await searchUsers(
                value
              );

            const existingIds =
              new Set(
                members.map(
                  (member) =>
                    member.user_id
                )
              );

            setSearchResults(
              (users || []).filter(
                (user) =>
                  !existingIds.has(
                    user.id
                  )
              )
            );
          } catch (error) {
            console.error(
              "Search channel members error:",
              error
            );
          } finally {
            setSearching(
              false
            );
          }
        },
        300
      );

    return () =>
      clearTimeout(
        timeout
      );
  }, [
    query,
    canAddMembers,
    members,
  ]);

  /* =========================================================
     SAVE CHANNEL SETTINGS
  ========================================================= */

  const handleSaveSettings =
    async () => {
      if (!isOwner) {
        return;
      }

      const cleanName =
        channelName.trim();

      if (!cleanName) {
        window.alert(
          "Channel name is required."
        );

        return;
      }

      if (
        !isPrivate &&
        !slug.trim()
      ) {
        window.alert(
          "Public channels require a channel username."
        );

        return;
      }

      try {
        setSavingSettings(
          true
        );

        const updated =
          await updateChannelSettings({
            conversationId:
              conversation.id,

            title:
              cleanName,

            description:
              description.trim(),

            isPrivate,

            slug:
              slug.trim(),
          });

        onChannelUpdated?.({
          ...conversation,
          ...updated,

          memberCount:
            members.length,

          currentMemberRole:
            myRole,
        });

        window.alert(
          "Channel settings saved."
        );
      } catch (error) {
        console.error(
          "Save channel settings error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to save channel settings."
        );
      } finally {
        setSavingSettings(
          false
        );
      }
    };

  /* =========================================================
     CHANNEL AVATAR FILE
  ========================================================= */

  const handleChannelAvatarFileChange =
    (event) => {
      const file =
        event.target.files?.[0];

      setChannelAvatarMsg({
        type: "",
        text: "",
      });

      if (!file) {
        setChannelAvatarFile(null);
        return;
      }

      if (
        !file.type.startsWith(
          "image/"
        )
      ) {
        setChannelAvatarMsg({
          type: "error",
          text: "Please select an image file.",
        });
        event.target.value = "";
        return;
      }

      const maxSize =
        5 * 1024 * 1024;

      if (file.size > maxSize) {
        setChannelAvatarMsg({
          type: "error",
          text: "Image is too large. Maximum size is 5 MB.",
        });
        event.target.value = "";
        return;
      }

      if (
        channelAvatarPreview &&
        channelAvatarPreview.startsWith(
          "blob:"
        )
      ) {
        URL.revokeObjectURL(
          channelAvatarPreview
        );
      }

      setChannelAvatarFile(file);
      setChannelAvatarPreview(
        URL.createObjectURL(file)
      );
    };

  /* =========================================================
     CLEAN OLD CHANNEL AVATAR FILES
  ========================================================= */

  const cleanupOldChannelAvatarFiles =
    async (keepPath = null) => {
      if (!conversation?.id) {
        return;
      }

      const {
        data,
        error,
      } =
        await supabase.storage
          .from(
            "channel-avatars"
          )
          .list(
            conversation.id,
            {
              limit: 100,
            }
          );

      if (error) {
        console.error(
          "List channel avatar files error:",
          error
        );
        return;
      }

      const paths =
        (data || [])
          .filter(
            (item) => item?.name
          )
          .map(
            (item) =>
              `${conversation.id}/${item.name}`
          )
          .filter(
            (path) =>
              path !== keepPath
          );

      if (paths.length === 0) {
        return;
      }

      const {
        error: removeError,
      } =
        await supabase.storage
          .from(
            "channel-avatars"
          )
          .remove(paths);

      if (removeError) {
        console.error(
          "Cleanup old channel avatars error:",
          removeError
        );
      }
    };

  /* =========================================================
     UPLOAD CHANNEL AVATAR
  ========================================================= */

  const handleUploadChannelAvatar =
    async () => {
      if (
        !isOwner ||
        !conversation?.id ||
        !channelAvatarFile
      ) {
        return;
      }

      try {
        setUploadingChannelAvatar(true);
        setChannelAvatarMsg({
          type: "",
          text: "",
        });

        const safeName =
          channelAvatarFile.name
            .replace(
              /[^a-zA-Z0-9._-]/g,
              "_"
            )
            .slice(0, 100);

        const storagePath =
          `${conversation.id}/${Date.now()}-${safeName}`;

        const { error: uploadError } =
          await supabase.storage
            .from(
              "channel-avatars"
            )
            .upload(
              storagePath,
              channelAvatarFile,
              {
                upsert: false,
                cacheControl: "3600",
                contentType:
                  channelAvatarFile.type,
              }
            );

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: publicUrlData,
        } =
          supabase.storage
            .from(
              "channel-avatars"
            )
            .getPublicUrl(
              storagePath
            );

        const publicUrl =
          publicUrlData?.publicUrl;

        if (!publicUrl) {
          await supabase.storage
            .from(
              "channel-avatars"
            )
            .remove([storagePath]);
          throw new Error(
            "Unable to create channel avatar URL."
          );
        }

        const { error: rpcError } =
          await supabase.rpc(
            "update_channel_avatar",
            {
              p_conversation_id:
                conversation.id,
              p_avatar_url:
                publicUrl,
            }
          );

        if (rpcError) {
          await supabase.storage
            .from(
              "channel-avatars"
            )
            .remove([storagePath]);
          throw rpcError;
        }

        setChannelAvatarUrl(
          publicUrl
        );
        setChannelAvatarFile(null);

        if (
          channelAvatarPreview &&
          channelAvatarPreview.startsWith(
            "blob:"
          )
        ) {
          URL.revokeObjectURL(
            channelAvatarPreview
          );
        }

        setChannelAvatarPreview("");

        setChannelAvatarMsg({
          type: "success",
          text: "Channel picture updated successfully!",
        });

        onChannelUpdated?.({
          ...conversation,
          avatar_url: publicUrl,
          memberCount: members.length,
          currentMemberRole: myRole,
        });

        await cleanupOldChannelAvatarFiles(
          storagePath
        );
      } catch (error) {
        console.error(
          "Upload channel avatar error:",
          error
        );
        setChannelAvatarMsg({
          type: "error",
          text:
            error?.message ||
            "Unable to upload channel picture.",
        });
      } finally {
        setUploadingChannelAvatar(false);
      }
    };

  /* =========================================================
     REMOVE CHANNEL AVATAR
  ========================================================= */

  const handleRemoveChannelAvatar =
    async () => {
      if (
        !isOwner ||
        !conversation?.id
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          "Remove this channel picture?"
        );

      if (!confirmed) {
        return;
      }

      try {
        setUploadingChannelAvatar(true);
        setChannelAvatarMsg({
          type: "",
          text: "",
        });

        const { error: rpcError } =
          await supabase.rpc(
            "update_channel_avatar",
            {
              p_conversation_id:
                conversation.id,
              p_avatar_url: null,
            }
          );

        if (rpcError) {
          throw rpcError;
        }

        setChannelAvatarUrl("");
        setChannelAvatarFile(null);

        if (
          channelAvatarPreview &&
          channelAvatarPreview.startsWith(
            "blob:"
          )
        ) {
          URL.revokeObjectURL(
            channelAvatarPreview
          );
        }

        setChannelAvatarPreview("");

        setChannelAvatarMsg({
          type: "success",
          text: "Channel picture removed.",
        });

        onChannelUpdated?.({
          ...conversation,
          avatar_url: null,
          memberCount: members.length,
          currentMemberRole: myRole,
        });

        await cleanupOldChannelAvatarFiles();
      } catch (error) {
        console.error(
          "Remove channel avatar error:",
          error
        );
        setChannelAvatarMsg({
          type: "error",
          text:
            error?.message ||
            "Unable to remove channel picture.",
        });
      } finally {
        setUploadingChannelAvatar(false);
      }
    };

  /* =========================================================
     ADD MEMBER
  ========================================================= */

  const handleAddMember =
    async (user) => {
      try {
        setAddingUserId(
          user.id
        );

        await addChannelMember(
          conversation.id,
          user.id
        );

        setQuery("");
        setSearchResults([]);

        await loadMembers();
      } catch (error) {
        console.error(
          "Add channel member error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to add subscriber."
        );
      } finally {
        setAddingUserId(
          null
        );
      }
    };

  /* =========================================================
     REMOVE MEMBER
  ========================================================= */

  const handleRemoveMember =
    async (member) => {
      const name =
        displayName(
          member
        );

      const confirmed =
        window.confirm(
          `Remove ${name} from this channel?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionUserId(
          member.user_id
        );

        await removeChannelMember(
          conversation.id,
          member.user_id
        );

        await loadMembers();
      } catch (error) {
        console.error(
          "Remove channel member error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to remove subscriber."
        );
      } finally {
        setActionUserId(
          null
        );
      }
    };

  /* =========================================================
     ROLE CHANGE
  ========================================================= */

  const handleRoleChange =
    async (
      member,
      nextRole
    ) => {
      if (
        !member?.user_id ||
        !nextRole
      ) {
        return;
      }

      const name =
        displayName(
          member
        );

      const confirmed =
        window.confirm(
          `Change ${name}'s role to ${nextRole}?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionUserId(
          member.user_id
        );

        await setChannelMemberRole(
          conversation.id,
          member.user_id,
          nextRole
        );

        await loadMembers();
      } catch (error) {
        console.error(
          "Change channel role error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to change role."
        );
      } finally {
        setActionUserId(
          null
        );
      }
    };

  /* =========================================================
     TRANSFER OWNERSHIP
  ========================================================= */

  const handleTransferOwnership =
    async (member) => {
      if (
        !isOwner ||
        member.user_id ===
          currentUser.id
      ) {
        return;
      }

      const name =
        displayName(
          member
        );

      const confirmed =
        window.confirm(
          `Transfer channel ownership to ${name}? You will become an admin.`
        );

      if (!confirmed) {
        return;
      }

      try {
        setTransferring(
          true
        );

        setActionUserId(
          member.user_id
        );

        await transferChannelOwnership(
          conversation.id,
          member.user_id
        );

        await loadMembers();

        window.alert(
          `${name} is now the channel owner.`
        );
      } catch (error) {
        console.error(
          "Transfer ownership error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to transfer ownership."
        );
      } finally {
        setTransferring(
          false
        );

        setActionUserId(
          null
        );
      }
    };

  /* =========================================================
     CREATE INVITE
  ========================================================= */

  const handleCreateInvite =
    async () => {
      if (
        !canManageInvites
      ) {
        return;
      }

      try {
        setCreatingInvite(
          true
        );

        let expiry =
          null;

        if (
          expiresAt
        ) {
          expiry =
            new Date(
              expiresAt
            ).toISOString();
        }

        const token =
          await createChannelInviteLink({
            conversationId:
              conversation.id,

            expiresAt:
              expiry,

            maxUses:
              maxUses || null,
          });

        if (!token) {
          throw new Error(
            "Invite token was not created."
          );
        }

        setMaxUses("");
        setExpiresAt("");

        await loadInviteLinks();
      } catch (error) {
        console.error(
          "Create invite link error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to create invite link."
        );
      } finally {
        setCreatingInvite(
          false
        );
      }
    };

  /* =========================================================
     INVITE URL
  ========================================================= */

  const getInviteUrl =
    (token) => {
      if (
        typeof window ===
        "undefined"
      ) {
        return token;
      }

      return (
        `${window.location.origin}` +
        `/chat?invite=${encodeURIComponent(
          token
        )}`
      );
    };

  /* =========================================================
     PUBLIC CHANNEL URL
  ========================================================= */

  const getPublicChannelUrl =
    () => {
      if (
        typeof window ===
          "undefined" ||
        !slug
      ) {
        return "";
      }

      return (
        `${window.location.origin}` +
        `/chat?channel=${encodeURIComponent(
          slug
        )}`
      );
    };

  /* =========================================================
     COPY PUBLIC CHANNEL LINK
  ========================================================= */

  const handleCopyPublicLink =
    async () => {
      const url =
        getPublicChannelUrl();

      if (!url) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          url
        );

        setCopiedPublicLink(true);

        setTimeout(
          () => {
            setCopiedPublicLink(false);
          },
          1500
        );
      } catch (error) {
        console.error(
          "Copy public channel link error:",
          error
        );

        window.prompt(
          "Copy this public channel link:",
          url
        );
      }
    };

  /* =========================================================
     COPY INVITE
  ========================================================= */

  const handleCopyInvite =
    async (token) => {
      const url =
        getInviteUrl(
          token
        );

      try {
        await navigator.clipboard.writeText(
          url
        );

        setCopiedToken(
          token
        );

        setTimeout(
          () => {
            setCopiedToken(
              null
            );
          },
          1500
        );
      } catch (error) {
        console.error(
          "Copy invite link error:",
          error
        );

        window.prompt(
          "Copy this invite link:",
          url
        );
      }
    };

  /* =========================================================
     REVOKE INVITE
  ========================================================= */

  const handleRevokeInvite =
    async (invite) => {
      const confirmed =
        window.confirm(
          "Revoke this invite link?"
        );

      if (!confirmed) {
        return;
      }

      try {
        await revokeChannelInviteLink(
          invite.id
        );

        await loadInviteLinks();
      } catch (error) {
        console.error(
          "Revoke invite error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to revoke invite link."
        );
      }
    };

  /* =========================================================
     LEAVE CHANNEL
  ========================================================= */

  const handleLeave =
    async () => {
      if (
        myRole ===
        "owner"
      ) {
        window.alert(
          "Transfer channel ownership before leaving."
        );

        return;
      }

      const confirmed =
        window.confirm(
          "Leave this channel?"
        );

      if (!confirmed) {
        return;
      }

      try {
        await leaveChannel(
          conversation.id
        );

        onLeftChannel?.(
          conversation.id
        );

        onClose?.();
      } catch (error) {
        console.error(
          "Leave channel error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to leave channel."
        );
      }
    };

  /* =========================================================
     ROLE PERMISSIONS
  ========================================================= */

  const canRemoveMember =
    (member) => {
      if (
        member.user_id ===
        currentUser.id
      ) {
        return false;
      }

      if (
        member.role ===
        "owner"
      ) {
        return false;
      }

      if (isOwner) {
        return true;
      }

      if (isAdmin) {
        return (
          member.role ===
            "member" ||
          member.role ===
            "moderator"
        );
      }

      if (isModerator) {
        return (
          member.role ===
          "member"
        );
      }

      return false;
    };

  const canManageRole =
    (member) => {
      if (
        member.user_id ===
        currentUser.id
      ) {
        return false;
      }

      if (
        member.role ===
        "owner"
      ) {
        return false;
      }

      if (isOwner) {
        return true;
      }

      if (isAdmin) {
        return (
          member.role ===
            "member" ||
          member.role ===
            "moderator"
        );
      }

      return false;
    };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-3">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">

        {/* HEADER */}
        <div className="flex flex-shrink-0 items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-lg font-bold">
              Channel Info
            </div>

            <div className="text-xs text-gray-400">
              {members.length}{" "}
              {members.length === 1
                ? "subscriber"
                : "subscribers"}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div className="overflow-y-auto">

          {/* =================================================
              CHANNEL HEADER
          ================================================= */}
          <div className="border-b p-5">
            <div className="flex flex-col items-center">

              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-3xl">
                {(channelAvatarPreview ||
                  channelAvatarUrl) ? (
                  <img
                    src={
                      channelAvatarPreview ||
                      channelAvatarUrl
                    }
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "📢"
                )}
              </div>

              <div className="mt-3 text-center text-xl font-bold">
                {channelName ||
                  "Channel"}
              </div>

              {description && (
                <div className="mt-1 max-w-md text-center text-sm text-gray-500">
                  {description}
                </div>
              )}

              <div className="mt-2 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                Your role:{" "}
                <span className="font-semibold capitalize">
                  {myRole}
                </span>
              </div>

              <div className="mt-2 text-xs text-gray-400">
                {isPrivate
                  ? "🔒 Private Channel"
                  : "🌐 Public Channel"}
              </div>

              {!isPrivate &&
                slug && (
                  <>
                    <div className="mt-1 text-xs font-medium text-blue-600">
                      @{slug}
                    </div>

                    <button
                      type="button"
                      onClick={
                        handleCopyPublicLink
                      }
                      className="mt-3 rounded-xl bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-100"
                    >
                      {copiedPublicLink
                        ? "✓ Copied!"
                        : "🔗 Copy Public Link"}
                    </button>
                  </>
                )}
            </div>
          </div>

          {/* =================================================
              CHANNEL SETTINGS
              OWNER ONLY
          ================================================= */}
          {isOwner && (
            <div className="border-b p-4">

              <div className="mb-4 text-sm font-bold">
                Channel Settings
              </div>

              {/* CHANNEL PICTURE */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-semibold text-gray-500">
                  Channel picture
                </label>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-3xl">
                    {(channelAvatarPreview ||
                      channelAvatarUrl) ? (
                      <img
                        src={
                          channelAvatarPreview ||
                          channelAvatarUrl
                        }
                        alt="Channel preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      "📢"
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={
                        handleChannelAvatarFileChange
                      }
                      disabled={
                        uploadingChannelAvatar
                      }
                      className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-blue-700"
                    />

                    <div className="mt-2 text-[11px] text-gray-400">
                      JPG, PNG, WEBP or other image formats. Maximum 5 MB.
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={
                      handleUploadChannelAvatar
                    }
                    disabled={
                      uploadingChannelAvatar ||
                      !channelAvatarFile
                    }
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {uploadingChannelAvatar
                      ? "Uploading..."
                      : channelAvatarUrl
                      ? "Replace Picture"
                      : "Upload Picture"}
                  </button>

                  {(channelAvatarUrl ||
                    channelAvatarPreview) && (
                    <button
                      type="button"
                      onClick={
                        handleRemoveChannelAvatar
                      }
                      disabled={
                        uploadingChannelAvatar
                      }
                      className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40"
                    >
                      Remove Picture
                    </button>
                  )}
                </div>

                {channelAvatarFile && (
                  <div className="mt-2 text-[11px] font-medium text-green-600">
                    Selected: {channelAvatarFile.name}
                  </div>
                )}

                {channelAvatarMsg.text && (
                  <div
                    className={`mt-2 text-xs font-semibold ${
                      channelAvatarMsg.type ===
                      "success"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {channelAvatarMsg.text}
                  </div>
                )}
              </div>

              {/* NAME */}
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                  Channel name
                </label>

                <input
                  value={
                    channelName
                  }
                  onChange={(event) =>
                    setChannelName(
                      event.target.value
                    )
                  }
                  maxLength={80}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* DESCRIPTION */}
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                  Description
                </label>

                <textarea
                  value={
                    description
                  }
                  onChange={(event) =>
                    setDescription(
                      event.target.value
                    )
                  }
                  rows={3}
                  maxLength={300}
                  placeholder="Channel description..."
                  className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* PRIVACY */}
              <div className="mb-4">
                <div className="mb-2 text-xs font-semibold text-gray-500">
                  Channel type
                </div>

                <div className="grid grid-cols-2 gap-2">

                  <button
                    type="button"
                    onClick={() =>
                      setIsPrivate(
                        true
                      )
                    }
                    className={`rounded-xl border p-3 text-left ${
                      isPrivate
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="text-sm font-semibold">
                      🔒 Private
                    </div>

                    <div className="mt-1 text-xs text-gray-400">
                      Users join through invite links.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setIsPrivate(
                        false
                      )
                    }
                    className={`rounded-xl border p-3 text-left ${
                      !isPrivate
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="text-sm font-semibold">
                      🌐 Public
                    </div>

                    <div className="mt-1 text-xs text-gray-400">
                      Has a public channel username.
                    </div>
                  </button>
                </div>
              </div>

              {/* PUBLIC SLUG */}
              {!isPrivate && (
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                    Channel username
                  </label>

                  <div className="flex items-center rounded-xl border border-gray-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                    <span className="pl-4 text-sm text-gray-400">
                      @
                    </span>

                    <input
                      value={slug}
                      onChange={(event) =>
                        setSlug(
                          event.target.value
                            .toLowerCase()
                            .replace(
                              /[^a-z0-9_-]/g,
                              ""
                            )
                        )
                      }
                      maxLength={40}
                      placeholder="jb-premium-news"
                      className="min-w-0 flex-1 bg-transparent px-1 py-3 pr-4 text-sm outline-none"
                    />
                  </div>

                  <div className="mt-1 text-[11px] text-gray-400">
                    3–40 characters. Lowercase letters, numbers, _ and - only.
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={
                  handleSaveSettings
                }
                disabled={
                  savingSettings ||
                  !channelName.trim() ||
                  (
                    !isPrivate &&
                    !slug.trim()
                  )
                }
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingSettings
                  ? "Saving..."
                  : "Save Channel Settings"}
              </button>
            </div>
          )}

          {/* =================================================
              INVITE LINKS
          ================================================= */}
          {canManageInvites && (
            <div className="border-b p-4">

              <div className="mb-1 text-sm font-bold">
                Invite Links
              </div>

              <div className="mb-4 text-xs text-gray-400">
                Create links that allow users to join this channel.
              </div>

              {/* OPTIONS */}
              <div className="grid gap-3 sm:grid-cols-2">

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">
                    Maximum uses
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={
                      maxUses
                    }
                    onChange={(event) =>
                      setMaxUses(
                        event.target.value
                      )
                    }
                    placeholder="Unlimited"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">
                    Expires
                  </label>

                  <input
                    type="datetime-local"
                    value={
                      expiresAt
                    }
                    onChange={(event) =>
                      setExpiresAt(
                        event.target.value
                      )
                    }
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={
                  handleCreateInvite
                }
                disabled={
                  creatingInvite
                }
                className="mt-3 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
              >
                {creatingInvite
                  ? "Creating..."
                  : "+ Create Invite Link"}
              </button>

              {/* INVITE LIST */}
              <div className="mt-4">

                {loadingInvites ? (
                  <div className="py-4 text-sm text-gray-400">
                    Loading invite links...
                  </div>
                ) : activeInvites.length ===
                  0 ? (
                  <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-400">
                    No active invite links.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeInvites.map(
                      (invite) => (
                        <div
                          key={
                            invite.id
                          }
                          className="rounded-xl border border-gray-200 p-3"
                        >
                          <div className="flex items-start gap-3">

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium text-blue-600">
                                {getInviteUrl(
                                  invite.token
                                )}
                              </div>

                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400">

                                <span>
                                  Uses:{" "}
                                  {invite.use_count ||
                                    0}
                                  {invite.max_uses
                                    ? ` / ${invite.max_uses}`
                                    : ""}
                                </span>

                                <span>
                                  {formatDate(
                                    invite.expires_at
                                  )}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                handleCopyInvite(
                                  invite.token
                                )
                              }
                              className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100"
                            >
                              {copiedToken ===
                              invite.token
                                ? "Copied"
                                : "Copy"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleRevokeInvite(
                                  invite
                                )
                              }
                              className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =================================================
              ADD SUBSCRIBERS
          ================================================= */}
          {canAddMembers && (
            <div className="border-b p-4">

              <div className="mb-2 text-sm font-semibold">
                Add subscribers
              </div>

              <input
                value={query}
                onChange={(event) =>
                  setQuery(
                    event.target.value
                  )
                }
                placeholder="Search users..."
                className="w-full rounded-xl bg-gray-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />

              {query.trim() && (
                <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border">

                  {searching && (
                    <div className="p-4 text-sm text-gray-400">
                      Searching...
                    </div>
                  )}

                  {!searching &&
                    searchResults.length ===
                      0 && (
                      <div className="p-4 text-sm text-gray-400">
                        No users found.
                      </div>
                    )}

                  {searchResults.map(
                    (user) => (
                      <div
                        key={
                          user.id
                        }
                        className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0"
                      >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200">
                          {user.avatar_url ? (
                            <img
                              src={
                                user.avatar_url
                              }
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            "👤"
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {user.full_name ||
                              user.username ||
                              "User"}
                          </div>

                          {user.username && (
                            <div className="truncate text-xs text-gray-400">
                              @
                              {
                                user.username
                              }
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={
                            addingUserId ===
                            user.id
                          }
                          onClick={() =>
                            handleAddMember(
                              user
                            )
                          }
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          {addingUserId ===
                          user.id
                            ? "..."
                            : "Add"}
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* =================================================
              SUBSCRIBERS
          ================================================= */}
          <div className="p-4">

            <div className="mb-3 text-sm font-semibold">
              Subscribers ·{" "}
              {members.length}
            </div>

            {loading ? (
              <div className="py-6 text-center text-sm text-gray-400">
                Loading subscribers...
              </div>
            ) : (
              <div className="space-y-1">

                {members.map(
                  (member) => {
                    const profile =
                      member.profiles ||
                      {};

                    const mine =
                      member.user_id ===
                      currentUser.id;

                    const canRemove =
                      canRemoveMember(
                        member
                      );

                    const canRole =
                      canManageRole(
                        member
                      );

                    const canTransfer =
                      isOwner &&
                      !mine &&
                      member.role !==
                        "owner";

                    return (
                      <div
                        key={
                          member.user_id
                        }
                        className="rounded-xl px-2 py-3 hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-3">

                          {/* AVATAR */}
                          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200">
                            {profile.avatar_url ? (
                              <img
                                src={
                                  profile.avatar_url
                                }
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              "👤"
                            )}
                          </div>

                          {/* USER */}
                          <div className="min-w-0 flex-1">

                            <div className="flex flex-wrap items-center gap-2">

                              <span className="truncate text-sm font-medium">
                                {displayName(
                                  member
                                )}

                                {mine
                                  ? " (You)"
                                  : ""}
                              </span>

                              {member.role ===
                                "owner" && (
                                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                                  Owner
                                </span>
                              )}

                              {member.role ===
                                "admin" && (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                  Admin
                                </span>
                              )}

                              {member.role ===
                                "moderator" && (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                                  Moderator
                                </span>
                              )}

                              {member.role ===
                                "member" && (
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                                  Subscriber
                                </span>
                              )}
                            </div>

                            {profile.username && (
                              <div className="truncate text-xs text-gray-400">
                                @
                                {
                                  profile.username
                                }
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ACTIONS */}
                        {(canRole ||
                          canRemove ||
                          canTransfer) && (
                          <div className="mt-2 flex flex-wrap justify-end gap-3 pl-14">

                            {canTransfer && (
                              <button
                                type="button"
                                disabled={
                                  transferring ||
                                  actionUserId ===
                                    member.user_id
                                }
                                onClick={() =>
                                  handleTransferOwnership(
                                    member
                                  )
                                }
                                className="text-[11px] font-semibold text-purple-600 hover:underline disabled:opacity-40"
                              >
                                Transfer ownership
                              </button>
                            )}

                            {canRole &&
                              member.role !==
                                "member" && (
                                <button
                                  type="button"
                                  disabled={
                                    actionUserId ===
                                    member.user_id
                                  }
                                  onClick={() =>
                                    handleRoleChange(
                                      member,
                                      "member"
                                    )
                                  }
                                  className="text-[11px] font-medium text-gray-600 hover:underline disabled:opacity-40"
                                >
                                  Make subscriber
                                </button>
                              )}

                            {canRole &&
                              member.role !==
                                "moderator" && (
                                <button
                                  type="button"
                                  disabled={
                                    actionUserId ===
                                    member.user_id
                                  }
                                  onClick={() =>
                                    handleRoleChange(
                                      member,
                                      "moderator"
                                    )
                                  }
                                  className="text-[11px] font-medium text-green-600 hover:underline disabled:opacity-40"
                                >
                                  Make moderator
                                </button>
                              )}

                            {isOwner &&
                              member.role !==
                                "admin" &&
                              member.role !==
                                "owner" && (
                                <button
                                  type="button"
                                  disabled={
                                    actionUserId ===
                                    member.user_id
                                  }
                                  onClick={() =>
                                    handleRoleChange(
                                      member,
                                      "admin"
                                    )
                                  }
                                  className="text-[11px] font-medium text-blue-600 hover:underline disabled:opacity-40"
                                >
                                  Make admin
                                </button>
                              )}

                            {canRemove && (
                              <button
                                type="button"
                                disabled={
                                  actionUserId ===
                                  member.user_id
                                }
                                onClick={() =>
                                  handleRemoveMember(
                                    member
                                  )
                                }
                                className="text-[11px] font-medium text-red-500 hover:underline disabled:opacity-40"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </div>

          {/* =================================================
              LEAVE
          ================================================= */}
          <div className="border-t p-4">

            <button
              type="button"
              onClick={
                handleLeave
              }
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Leave Channel
            </button>

            {myRole ===
              "owner" && (
              <div className="mt-2 text-center text-xs text-gray-400">
                Transfer ownership to another subscriber before leaving.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}