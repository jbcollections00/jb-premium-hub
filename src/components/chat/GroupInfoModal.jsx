import {
  useEffect,
  useState,
} from "react";

import { supabase } from "../../services/supabaseClient";

import {
  addGroupMember,
  createGroupInviteLink,
  getConversationMembers,
  getGroupInviteLinks,
  leaveGroup,
  removeGroupMember,
  revokeGroupInviteLink,
  searchUsers,
  setGroupMemberRole,
  transferGroupOwnership,
  updateGroupDetails,
} from "../../services/chatService";

const hiddenScrollbarClass = `
  overflow-y-auto
  [scrollbar-width:none]
  [-ms-overflow-style:none]
  [&::-webkit-scrollbar]:hidden
`;

function displayName(member) {
  return (
    member?.profiles
      ?.full_name?.trim() ||
    member?.profiles
      ?.username?.trim() ||
    "User"
  );
}

export default function GroupInfoModal({
  conversation,
  currentUser,
  onClose,
  onGroupUpdated,
  onLeftGroup,
}) {
  const [
    members,
    setMembers,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    groupName,
    setGroupName,
  ] = useState(
    conversation?.title ||
      conversation?.displayName ||
      ""
  );

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    groupAvatarUrl,
    setGroupAvatarUrl,
  ] = useState(
    conversation?.avatar_url ||
      ""
  );

  const [
    groupAvatarFile,
    setGroupAvatarFile,
  ] = useState(null);

  const [
    groupAvatarPreview,
    setGroupAvatarPreview,
  ] = useState("");

  const [
    uploadingGroupAvatar,
    setUploadingGroupAvatar,
  ] = useState(false);

  const [
    groupAvatarMsg,
    setGroupAvatarMsg,
  ] = useState({
    type: "",
    text: "",
  });

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

  const [
    actionUserId,
    setActionUserId,
  ] = useState(null);

  const [
    transferring,
    setTransferring,
  ] = useState(false);

  const [
    groupInviteLinks,
    setGroupInviteLinks,
  ] = useState([]);

  const [
    loadingGroupInvites,
    setLoadingGroupInvites,
  ] = useState(false);

  const [
    creatingGroupInvite,
    setCreatingGroupInvite,
  ] = useState(false);

  const [
    groupInviteMaxUses,
    setGroupInviteMaxUses,
  ] = useState("");

  const [
    groupInviteExpiresAt,
    setGroupInviteExpiresAt,
  ] = useState("");

  const [
    copiedGroupInviteToken,
    setCopiedGroupInviteToken,
  ] = useState(null);

  const myMember =
    members.find(
      (member) =>
        member.user_id ===
        currentUser?.id
    );

  const myRole =
    myMember?.role ||
    "member";

  const canManage =
    myRole === "owner" ||
    myRole === "admin";

  const isOwner =
    myRole === "owner";

  const activeGroupInvites =
    groupInviteLinks.filter(
      (invite) =>
        invite.is_active
    );

  const loadGroupInviteLinks =
    async () => {
      if (
        !conversation?.id ||
        !canManage
      ) {
        setGroupInviteLinks(
          []
        );

        return;
      }

      try {
        setLoadingGroupInvites(
          true
        );

        const rows =
          await getGroupInviteLinks(
            conversation.id
          );

        setGroupInviteLinks(
          rows || []
        );
      } catch (error) {
        console.error(
          "Load group invite links error:",
          error
        );
      } finally {
        setLoadingGroupInvites(
          false
        );
      }
    };

  const loadMembers =
    async () => {
      if (
        !conversation?.id
      ) {
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

        setMembers(
          rows || []
        );
      } catch (error) {
        console.error(
          "Load group members error:",
          error
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  useEffect(() => {
    setGroupName(
      conversation?.title ||
        conversation?.displayName ||
        ""
    );

    setGroupAvatarUrl(
      conversation?.avatar_url ||
        ""
    );

    setGroupAvatarFile(
      null
    );

    setGroupAvatarPreview(
      ""
    );

    setGroupAvatarMsg({
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
        groupAvatarPreview &&
        groupAvatarPreview.startsWith(
          "blob:"
        )
      ) {
        URL.revokeObjectURL(
          groupAvatarPreview
        );
      }
    };
  }, [
    groupAvatarPreview,
  ]);

  useEffect(() => {
    if (
      canManage
    ) {
      loadGroupInviteLinks();
    }
  }, [
    conversation?.id,
    canManage,
  ]);

  useEffect(() => {
    const timeout =
      setTimeout(
        async () => {
          const value =
            query.trim();

          if (
            !value ||
            !canManage
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
                  (
                    member
                  ) =>
                    member.user_id
                )
              );

            setSearchResults(
              (
                users ||
                []
              ).filter(
                (
                  user
                ) =>
                  !existingIds.has(
                    user.id
                  )
              )
            );
          } catch (error) {
            console.error(
              "Search group members error:",
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
    canManage,
    members,
  ]);

  const handleSaveGroup =
    async () => {
      const cleanName =
        groupName.trim();

      if (
        !cleanName
      ) {
        window.alert(
          "Group name is required."
        );

        return;
      }

      try {
        setSaving(
          true
        );

        await updateGroupDetails({
          conversationId:
            conversation.id,

          title:
            cleanName,

          avatarUrl:
            groupAvatarUrl ||
            null,
        });

        onGroupUpdated?.({
          ...conversation,

          title:
            cleanName,

          displayName:
            cleanName,

          avatar_url:
            groupAvatarUrl ||
            null,
        });
      } catch (error) {
        console.error(
          "Update group error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to update group."
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  const handleGroupAvatarFileChange =
    (event) => {
      const file =
        event.target.files?.[0];

      setGroupAvatarMsg({
        type: "",
        text: "",
      });

      if (!file) {
        setGroupAvatarFile(
          null
        );

        return;
      }

      if (
        !file.type.startsWith(
          "image/"
        )
      ) {
        setGroupAvatarMsg({
          type: "error",
          text: "Please select an image file.",
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
        setGroupAvatarMsg({
          type: "error",
          text: "Image is too large. Maximum size is 5 MB.",
        });

        event.target.value =
          "";

        return;
      }

      if (
        groupAvatarPreview &&
        groupAvatarPreview.startsWith(
          "blob:"
        )
      ) {
        URL.revokeObjectURL(
          groupAvatarPreview
        );
      }

      setGroupAvatarFile(
        file
      );

      setGroupAvatarPreview(
        URL.createObjectURL(
          file
        )
      );
    };

  const cleanupOldGroupAvatarFiles =
    async (
      keepPath = null
    ) => {
      if (
        !conversation?.id
      ) {
        return;
      }

      const {
        data,
        error,
      } =
        await supabase.storage
          .from(
            "group-avatars"
          )
          .list(
            conversation.id,
            {
              limit: 100,
            }
          );

      if (error) {
        console.error(
          "List group avatar files error:",
          error
        );

        return;
      }

      const paths =
        (data || [])
          .filter(
            (item) =>
              item?.name
          )
          .map(
            (item) =>
              `${conversation.id}/${item.name}`
          )
          .filter(
            (path) =>
              path !== keepPath
          );

      if (
        paths.length === 0
      ) {
        return;
      }

      const {
        error:
          removeError,
      } =
        await supabase.storage
          .from(
            "group-avatars"
          )
          .remove(
            paths
          );

      if (
        removeError
      ) {
        console.error(
          "Cleanup old group avatars error:",
          removeError
        );
      }
    };

  const handleUploadGroupAvatar =
    async () => {
      if (
        !canManage ||
        !conversation?.id ||
        !groupAvatarFile
      ) {
        return;
      }

      try {
        setUploadingGroupAvatar(
          true
        );

        setGroupAvatarMsg({
          type: "",
          text: "",
        });

        const safeName =
          groupAvatarFile.name
            .replace(
              /[^a-zA-Z0-9._-]/g,
              "_"
            )
            .slice(
              0,
              100
            );

        const storagePath =
          `${conversation.id}/${Date.now()}-${safeName}`;

        const {
          error:
            uploadError,
        } =
          await supabase.storage
            .from(
              "group-avatars"
            )
            .upload(
              storagePath,
              groupAvatarFile,
              {
                upsert:
                  false,

                cacheControl:
                  "3600",

                contentType:
                  groupAvatarFile.type,
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
              "group-avatars"
            )
            .getPublicUrl(
              storagePath
            );

        const publicUrl =
          publicUrlData?.publicUrl;

        if (
          !publicUrl
        ) {
          await supabase.storage
            .from(
              "group-avatars"
            )
            .remove([
              storagePath,
            ]);

          throw new Error(
            "Unable to create group avatar URL."
          );
        }

        const savedTitle =
          conversation?.title ||
          conversation?.displayName ||
          groupName.trim() ||
          "Group";

        try {
          await updateGroupDetails({
            conversationId:
              conversation.id,

            title:
              savedTitle,

            avatarUrl:
              publicUrl,
          });
        } catch (error) {
          await supabase.storage
            .from(
              "group-avatars"
            )
            .remove([
              storagePath,
            ]);

          throw error;
        }

        setGroupAvatarUrl(
          publicUrl
        );

        setGroupAvatarFile(
          null
        );

        if (
          groupAvatarPreview &&
          groupAvatarPreview.startsWith(
            "blob:"
          )
        ) {
          URL.revokeObjectURL(
            groupAvatarPreview
          );
        }

        setGroupAvatarPreview(
          ""
        );

        setGroupAvatarMsg({
          type:
            "success",

          text:
            "Group picture updated successfully!",
        });

        onGroupUpdated?.({
          ...conversation,

          avatar_url:
            publicUrl,

          title:
            savedTitle,

          displayName:
            savedTitle,
        });

        await cleanupOldGroupAvatarFiles(
          storagePath
        );
      } catch (error) {
        console.error(
          "Upload group avatar error:",
          error
        );

        setGroupAvatarMsg({
          type:
            "error",

          text:
            error?.message ||
            "Unable to upload group picture.",
        });
      } finally {
        setUploadingGroupAvatar(
          false
        );
      }
    };

  const handleRemoveGroupAvatar =
    async () => {
      if (
        !canManage ||
        !conversation?.id
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          "Remove this group picture?"
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setUploadingGroupAvatar(
          true
        );

        setGroupAvatarMsg({
          type: "",
          text: "",
        });

        const savedTitle =
          conversation?.title ||
          conversation?.displayName ||
          groupName.trim() ||
          "Group";

        await updateGroupDetails({
          conversationId:
            conversation.id,

          title:
            savedTitle,

          avatarUrl:
            null,
        });

        setGroupAvatarUrl(
          ""
        );

        setGroupAvatarFile(
          null
        );

        if (
          groupAvatarPreview &&
          groupAvatarPreview.startsWith(
            "blob:"
          )
        ) {
          URL.revokeObjectURL(
            groupAvatarPreview
          );
        }

        setGroupAvatarPreview(
          ""
        );

        setGroupAvatarMsg({
          type:
            "success",

          text:
            "Group picture removed.",
        });

        onGroupUpdated?.({
          ...conversation,

          avatar_url:
            null,

          title:
            savedTitle,

          displayName:
            savedTitle,
        });

        await cleanupOldGroupAvatarFiles();
      } catch (error) {
        console.error(
          "Remove group avatar error:",
          error
        );

        setGroupAvatarMsg({
          type:
            "error",

          text:
            error?.message ||
            "Unable to remove group picture.",
        });
      } finally {
        setUploadingGroupAvatar(
          false
        );
      }
    };

  const getGroupInviteUrl =
    (token) => {
      if (
        typeof window ===
        "undefined"
      ) {
        return token;
      }

      return (
        `${window.location.origin}` +
        `/chat?groupinvite=${encodeURIComponent(
          token
        )}`
      );
    };

  const handleCreateGroupInvite =
    async () => {
      if (
        !canManage
      ) {
        return;
      }

      try {
        setCreatingGroupInvite(
          true
        );

        let expiry =
          null;

        if (
          groupInviteExpiresAt
        ) {
          expiry =
            new Date(
              groupInviteExpiresAt
            ).toISOString();
        }

        const token =
          await createGroupInviteLink({
            conversationId:
              conversation.id,

            expiresAt:
              expiry,

            maxUses:
              groupInviteMaxUses ||
              null,
          });

        if (!token) {
          throw new Error(
            "Group invite token was not created."
          );
        }

        setGroupInviteMaxUses(
          ""
        );

        setGroupInviteExpiresAt(
          ""
        );

        await loadGroupInviteLinks();
      } catch (error) {
        console.error(
          "Create group invite link error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to create group invite link."
        );
      } finally {
        setCreatingGroupInvite(
          false
        );
      }
    };

  const handleCopyGroupInvite =
    async (
      token
    ) => {
      const url =
        getGroupInviteUrl(
          token
        );

      try {
        await navigator.clipboard.writeText(
          url
        );

        setCopiedGroupInviteToken(
          token
        );

        setTimeout(
          () => {
            setCopiedGroupInviteToken(
              null
            );
          },
          1500
        );
      } catch (error) {
        console.error(
          "Copy group invite link error:",
          error
        );

        window.prompt(
          "Copy this group invite link:",
          url
        );
      }
    };

  const handleRevokeGroupInvite =
    async (
      invite
    ) => {
      const confirmed =
        window.confirm(
          "Revoke this group invite link?"
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        await revokeGroupInviteLink(
          invite.id
        );

        await loadGroupInviteLinks();
      } catch (error) {
        console.error(
          "Revoke group invite error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to revoke group invite link."
        );
      }
    };

  const handleAddMember =
    async (
      user
    ) => {
      try {
        setAddingUserId(
          user.id
        );

        await addGroupMember(
          conversation.id,
          user.id
        );

        setQuery(
          ""
        );

        setSearchResults(
          []
        );

        await loadMembers();
      } catch (error) {
        console.error(
          "Add member error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to add member."
        );
      } finally {
        setAddingUserId(
          null
        );
      }
    };

  const handleRemoveMember =
    async (
      member
    ) => {
      const name =
        displayName(
          member
        );

      const confirmed =
        window.confirm(
          `Remove ${name} from this group?`
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setActionUserId(
          member.user_id
        );

        await removeGroupMember(
          conversation.id,
          member.user_id
        );

        await loadMembers();
      } catch (error) {
        console.error(
          "Remove member error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to remove member."
        );
      } finally {
        setActionUserId(
          null
        );
      }
    };

  const handleRoleChange =
    async (
      member
    ) => {
      const nextRole =
        member.role ===
        "admin"
          ? "member"
          : "admin";

      try {
        setActionUserId(
          member.user_id
        );

        await setGroupMemberRole(
          conversation.id,
          member.user_id,
          nextRole
        );

        await loadMembers();
      } catch (error) {
        console.error(
          "Change role error:",
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

  const handleTransferOwnership =
    async (
      member
    ) => {
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
          `Transfer ownership to ${name}? You will become an admin.`
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setTransferring(
          true
        );

        setActionUserId(
          member.user_id
        );

        await transferGroupOwnership(
          conversation.id,
          member.user_id
        );

        await loadMembers();

        window.alert(
          `${name} is now the group owner.`
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

  const handleLeave =
    async () => {
      if (
        myRole ===
        "owner"
      ) {
        window.alert(
          "Transfer ownership to another member before leaving."
        );

        return;
      }

      const confirmed =
        window.confirm(
          "Leave this group?"
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        await leaveGroup(
          conversation.id
        );

        onLeftGroup?.(
          conversation.id
        );

        onClose?.();
      } catch (error) {
        console.error(
          "Leave group error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to leave group."
        );
      }
    };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-3">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">

        {/* HEADER */}
        <div className="flex flex-shrink-0 items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-lg font-bold">
              Group Info
            </div>

            <div className="text-xs text-gray-400">
              {members.length}{" "}
              {members.length === 1
                ? "member"
                : "members"}
            </div>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Close group info"
          >
            ✕
          </button>
        </div>

        {/* MAIN SCROLL AREA */}
        <div
          className={`flex-1 ${hiddenScrollbarClass}`}
        >

          {/* GROUP DETAILS */}
          <div className="border-b p-4">
            <div className="mb-4 flex flex-col items-center">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-3xl">
                {(groupAvatarPreview ||
                  groupAvatarUrl) ? (
                  <img
                    src={
                      groupAvatarPreview ||
                      groupAvatarUrl
                    }
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "👥"
                )}
              </div>

              <div className="mt-2 text-sm text-gray-400">
                Group chat
              </div>
            </div>

            {canManage ? (
              <>
                <div className="mb-5">
                  <label className="mb-2 block text-xs font-semibold text-gray-500">
                    Group picture
                  </label>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

                    <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-3xl">
                      {(groupAvatarPreview ||
                        groupAvatarUrl) ? (
                        <img
                          src={
                            groupAvatarPreview ||
                            groupAvatarUrl
                          }
                          alt="Group preview"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        "👥"
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={
                          handleGroupAvatarFileChange
                        }
                        disabled={
                          uploadingGroupAvatar
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
                        handleUploadGroupAvatar
                      }
                      disabled={
                        uploadingGroupAvatar ||
                        !groupAvatarFile
                      }
                      className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {uploadingGroupAvatar
                        ? "Uploading..."
                        : groupAvatarUrl
                        ? "Replace Picture"
                        : "Upload Picture"}
                    </button>

                    {(groupAvatarUrl ||
                      groupAvatarPreview) && (
                      <button
                        type="button"
                        onClick={
                          handleRemoveGroupAvatar
                        }
                        disabled={
                          uploadingGroupAvatar
                        }
                        className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40"
                      >
                        Remove Picture
                      </button>
                    )}
                  </div>

                  {groupAvatarFile && (
                    <div className="mt-2 text-[11px] font-medium text-green-600">
                      Selected:{" "}
                      {
                        groupAvatarFile.name
                      }
                    </div>
                  )}

                  {groupAvatarMsg.text && (
                    <div
                      className={`mt-2 text-xs font-semibold ${
                        groupAvatarMsg.type ===
                        "success"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {
                        groupAvatarMsg.text
                      }
                    </div>
                  )}
                </div>

                <label className="mb-2 block text-xs font-semibold text-gray-500">
                  Group name
                </label>

                <div className="flex gap-2">
                  <input
                    value={
                      groupName
                    }
                    onChange={(
                      event
                    ) =>
                      setGroupName(
                        event.target.value
                      )
                    }
                    maxLength={80}
                    className="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
                  />

                  <button
                    type="button"
                    onClick={
                      handleSaveGroup
                    }
                    disabled={
                      saving ||
                      !groupName.trim()
                    }
                    className="rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving
                      ? "..."
                      : "Save"}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center text-xl font-bold">
                {
                  groupName
                }
              </div>
            )}
          </div>

          {/* GROUP INVITE LINKS */}
          {canManage && (
            <div className="border-b p-4">

              <div className="mb-1 text-sm font-bold">
                Group Invite Links
              </div>

              <div className="mb-4 text-xs text-gray-400">
                Create a link that lets users join this group.
              </div>

              <div className="grid gap-3 sm:grid-cols-2">

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">
                    Maximum uses
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={
                      groupInviteMaxUses
                    }
                    onChange={(event) =>
                      setGroupInviteMaxUses(
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
                      groupInviteExpiresAt
                    }
                    onChange={(event) =>
                      setGroupInviteExpiresAt(
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
                  handleCreateGroupInvite
                }
                disabled={
                  creatingGroupInvite
                }
                className="mt-3 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
              >
                {creatingGroupInvite
                  ? "Creating..."
                  : "+ Create Invite Link"}
              </button>

              <div className="mt-4">

                {loadingGroupInvites ? (
                  <div className="py-4 text-sm text-gray-400">
                    Loading invite links...
                  </div>
                ) : activeGroupInvites.length ===
                  0 ? (
                  <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-400">
                    No active invite links.
                  </div>
                ) : (
                  <div className="space-y-2">

                    {activeGroupInvites.map(
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
                                {getGroupInviteUrl(
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
                                  {invite.expires_at
                                    ? new Date(
                                        invite.expires_at
                                      ).toLocaleString()
                                    : "No expiry"}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                handleCopyGroupInvite(
                                  invite.token
                                )
                              }
                              className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100"
                            >
                              {copiedGroupInviteToken ===
                              invite.token
                                ? "Copied"
                                : "Copy"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleRevokeGroupInvite(
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

          {/* ADD MEMBERS */}
          {canManage && (
            <div className="border-b p-4">
              <div className="mb-2 text-sm font-semibold">
                Add members
              </div>

              <input
                value={
                  query
                }
                onChange={(
                  event
                ) =>
                  setQuery(
                    event.target.value
                  )
                }
                placeholder="Search users..."
                className="w-full rounded-xl bg-gray-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />

              {query.trim() && (
                <div
                  className={`
                    mt-2
                    max-h-52
                    rounded-xl
                    border
                    ${hiddenScrollbarClass}
                  `}
                >
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
                    (
                      user
                    ) => (
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
                              @{user.username}
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
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
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

          {/* MEMBERS */}
          <div className="p-4">
            <div className="mb-3 text-sm font-semibold">
              Members ·{" "}
              {
                members.length
              }
            </div>

            {loading ? (
              <div className="py-6 text-center text-sm text-gray-400">
                Loading members...
              </div>
            ) : (
              <div className="space-y-1">
                {members.map(
                  (
                    member
                  ) => {
                    const profile =
                      member.profiles ||
                      {};

                    const mine =
                      member.user_id ===
                      currentUser.id;

                    const targetIsOwner =
                      member.role ===
                      "owner";

                    const targetIsAdmin =
                      member.role ===
                      "admin";

                    const canRemove =
                      canManage &&
                      !mine &&
                      !targetIsOwner &&
                      !(
                        myRole ===
                          "admin" &&
                        targetIsAdmin
                      );

                    const canChangeRole =
                      isOwner &&
                      !mine &&
                      !targetIsOwner;

                    const canTransfer =
                      isOwner &&
                      !mine &&
                      !targetIsOwner;

                    return (
                      <div
                        key={
                          member.user_id
                        }
                        className="rounded-xl px-2 py-3 hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-3">
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
                            </div>

                            {profile.username && (
                              <div className="truncate text-xs text-gray-400">
                                @{profile.username}
                              </div>
                            )}
                          </div>
                        </div>

                        {(canTransfer ||
                          canChangeRole ||
                          canRemove) && (
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

                            {canChangeRole && (
                              <button
                                type="button"
                                disabled={
                                  actionUserId ===
                                  member.user_id
                                }
                                onClick={() =>
                                  handleRoleChange(
                                    member
                                  )
                                }
                                className="text-[11px] font-medium text-blue-600 hover:underline disabled:opacity-40"
                              >
                                {member.role ===
                                "admin"
                                  ? "Remove admin"
                                  : "Make admin"}
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

          {/* LEAVE GROUP */}
          <div className="border-t p-4">
            <button
              type="button"
              onClick={
                handleLeave
              }
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Leave Group
            </button>

            {myRole ===
              "owner" && (
              <div className="mt-2 text-center text-xs text-gray-400">
                Transfer ownership to another member before leaving.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}