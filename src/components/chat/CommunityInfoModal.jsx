import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  addCommunityMember,
  attachConversationToCommunity,
  banCommunityMember,
  createCommunityInviteLink,
  deleteCommunity,
  detachConversationFromCommunity,
  getCommunityBans,
  getCommunityConversations,
  getCommunityInviteLinks,
  getCommunityMembers,
  getCommunityMutes,
  getConversationMembers,
  getUserConversations,
  joinPublicChannel,
  leaveCommunity,
  muteCommunityMember,
  removeCommunityMember,
  revokeCommunityInviteLink,
  searchUsers,
  setCommunityMemberRole,
  transferCommunityOwnership,
  unbanCommunityMember,
  unmuteCommunityMember,
  updateCommunity,
} from "../../services/chatService";

/* =========================================================
   HELPERS
========================================================= */

function normalizeSlug(value) {
  return (
    value || ""
  )
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .replace(
      /[^a-z0-9_-]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(0, 60);
}

function getDisplayName(
  item
) {
  return (
    item?.full_name
      ?.trim() ||
    item?.username
      ?.trim() ||
    "User"
  );
}

function getRoleLabel(role) {
  if (
    role === "owner"
  ) {
    return "Owner";
  }

  if (
    role === "admin"
  ) {
    return "Admin";
  }

  if (
    role === "moderator"
  ) {
    return "Moderator";
  }

  return "Member";
}

function getRoleBadgeClass(
  role
) {
  if (
    role === "owner"
  ) {
    return "bg-amber-100 text-amber-700";
  }

  if (
    role === "admin"
  ) {
    return "bg-purple-100 text-purple-700";
  }

  if (
    role === "moderator"
  ) {
    return "bg-blue-100 text-blue-700";
  }

  return "bg-gray-100 text-gray-600";
}

function getCommunityRoleRank(
  role
) {
  if (
    role ===
    "owner"
  ) {
    return 4;
  }

  if (
    role ===
    "admin"
  ) {
    return 3;
  }

  if (
    role ===
    "moderator"
  ) {
    return 2;
  }

  return 1;
}

function canCommunityRoleActOn(
  actorRole,
  targetRole
) {
  return (
    getCommunityRoleRank(
      actorRole
    ) >
    getCommunityRoleRank(
      targetRole
    )
  );
}

function formatDate(
  value
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date.toLocaleString(
    [],
    {
      month:
        "short",

      day:
        "numeric",

      year:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",
    }
  );
}

/* =========================================================
   COMPONENT
========================================================= */

export default function CommunityInfoModal({
  currentUser,
  conversation,
  onClose,
  onUpdated,
  onLeft,
  onOpenConversation,
}) {
  const communityId =
    conversation?.id;

  /* =========================================================
     TABS
  ========================================================= */

  const [
    activeTab,
    setActiveTab,
  ] = useState(
    "overview"
  );

  /* =========================================================
     DATA
  ========================================================= */

  const [
    members,
    setMembers,
  ] = useState([]);

  const [
    inviteLinks,
    setInviteLinks,
  ] = useState([]);

  const [
    childConversations,
    setChildConversations,
  ] = useState([]);

  const [
    availableConversations,
    setAvailableConversations,
  ] = useState([]);

  const [
    bans,
    setBans,
  ] = useState([]);

  const [
    mutes,
    setMutes,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  /* =========================================================
     EDIT COMMUNITY
  ========================================================= */

  const [
    title,
    setTitle,
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
    avatarUrl,
    setAvatarUrl,
  ] = useState(
    conversation?.avatar_url ||
      ""
  );

  const [
    isPrivate,
    setIsPrivate,
  ] = useState(
    Boolean(
      conversation?.is_private
    )
  );

  const [
    slug,
    setSlug,
  ] = useState(
    conversation?.slug ||
      ""
  );

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    copiedPublicLink,
    setCopiedPublicLink,
  ] = useState(false);

  /* =========================================================
     MEMBER SEARCH
  ========================================================= */

  const [
    userQuery,
    setUserQuery,
  ] = useState("");

  const [
    userResults,
    setUserResults,
  ] = useState([]);

  const [
    searchingUsers,
    setSearchingUsers,
  ] = useState(false);

  const [
    addingUserId,
    setAddingUserId,
  ] = useState(null);

  /* =========================================================
     INVITE
  ========================================================= */

  const [
    creatingInvite,
    setCreatingInvite,
  ] = useState(false);

  const [
    inviteMaxUses,
    setInviteMaxUses,
  ] = useState("");

  /* =========================================================
     ACTION STATE
  ========================================================= */

  const [
    actionUserId,
    setActionUserId,
  ] = useState(null);

  const [
    attachingId,
    setAttachingId,
  ] = useState(null);

  const [
    openingConversationId,
    setOpeningConversationId,
  ] = useState(null);

  const [
    leaving,
    setLeaving,
  ] = useState(false);

  const [
    deleting,
    setDeleting,
  ] = useState(false);

  /* =========================================================
     CURRENT MEMBER / PERMISSIONS
  ========================================================= */

  const myMember =
    useMemo(
      () =>
        members.find(
          (
            member
          ) =>
            member.user_id ===
            currentUser?.id
        ) ||
        null,
      [
        members,
        currentUser?.id,
      ]
    );

  const myRole =
    myMember?.role ||
    conversation?.currentMemberRole ||
    "member";

  const isOwner =
    myRole ===
    "owner";

  const isAdmin =
    myRole ===
    "admin";

  const isModerator =
    myRole ===
    "moderator";

  const canManage =
    isOwner ||
    isAdmin;

  const canModerate =
    canManage ||
    isModerator;

  const canActOnMember =
    (
      member
    ) =>
      Boolean(
        member?.user_id &&
        member.user_id !==
          currentUser?.id &&
        canCommunityRoleActOn(
          myRole,
          member.role
        )
      );

  const cleanSlug =
    normalizeSlug(
      slug
    );

  /* =========================================================
     LOAD COMMUNITY
  ========================================================= */

  const loadCommunityData =
    async () => {
      if (
        !communityId
      ) {
        return;
      }

      try {
        setLoading(
          true
        );

        const [
          memberRows,
          spaces,
        ] =
          await Promise.all([
            getCommunityMembers(
              communityId
            ),

            getCommunityConversations(
              communityId
            ),
          ]);

        setMembers(
          memberRows ||
            []
        );

        setChildConversations(
          spaces ||
            []
        );

        const currentRole =
          (
            memberRows ||
            []
          ).find(
            (
              member
            ) =>
              member.user_id ===
              currentUser?.id
          )?.role;

        if (
          currentRole ===
            "owner" ||
          currentRole ===
            "admin"
        ) {
          const [
            links,
            userConversationRows,
          ] =
            await Promise.all([
              getCommunityInviteLinks(
                communityId
              ),

              getUserConversations(
                currentUser.id
              ),
            ]);

          setInviteLinks(
            links ||
              []
          );

          const attachedIds =
            new Set(
              (
                spaces ||
                []
              ).map(
                (
                  item
                ) =>
                  item.id
              )
            );

          const candidates =
            [];

          for (
            const row of
            userConversationRows ||
            []
          ) {
            const item =
              row?.chat_conversations;

            if (
              !item ||
              ![
                "group",
                "channel",
              ].includes(
                item.type
              ) ||
              attachedIds.has(
                item.id
              )
            ) {
              continue;
            }

            try {
              const childMembers =
                await getConversationMembers(
                  item.id
                );

              const me =
                childMembers.find(
                  (
                    member
                  ) =>
                    member.user_id ===
                    currentUser.id
                );

              if (
                [
                  "owner",
                  "admin",
                ].includes(
                  me?.role
                )
              ) {
                candidates.push({
                  ...item,

                  currentMemberRole:
                    me.role,
                });
              }
            } catch (
              error
            ) {
              console.error(
                "Load attachable conversation error:",
                error
              );
            }
          }

          setAvailableConversations(
            candidates
          );
        } else {
          setInviteLinks(
            []
          );

          setAvailableConversations(
            []
          );
        }

        if (
          [
            "owner",
            "admin",
            "moderator",
          ].includes(
            currentRole
          )
        ) {
          const [
            banRows,
            muteRows,
          ] =
            await Promise.all([
              getCommunityBans(
                communityId
              ),

              getCommunityMutes(
                communityId
              ),
            ]);

          setBans(
            banRows ||
              []
          );

          setMutes(
            muteRows ||
              []
          );
        } else {
          setBans(
            []
          );

          setMutes(
            []
          );
        }
      } catch (
        error
      ) {
        console.error(
          "Load community info error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to load community information."
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  useEffect(() => {
    loadCommunityData();
  }, [
    communityId,
    currentUser?.id,
  ]);

  /* =========================================================
     USER SEARCH
  ========================================================= */

  useEffect(() => {
    const timeout =
      setTimeout(
        async () => {
          const value =
            userQuery.trim();

          if (
            !value ||
            !canManage
          ) {
            setUserResults(
              []
            );

            return;
          }

          try {
            setSearchingUsers(
              true
            );

            const rows =
              await searchUsers(
                value
              );

            const memberIds =
              new Set(
                members.map(
                  (
                    member
                  ) =>
                    member.user_id
                )
              );

            setUserResults(
              (
                rows ||
                []
              ).filter(
                (
                  user
                ) =>
                  user.id !==
                    currentUser?.id &&
                  !memberIds.has(
                    user.id
                  )
              )
            );
          } catch (
            error
          ) {
            console.error(
              "Community member search error:",
              error
            );

            setUserResults(
              []
            );
          } finally {
            setSearchingUsers(
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
    userQuery,
    canManage,
    members,
    currentUser?.id,
  ]);

  /* =========================================================
     PUBLIC COMMUNITY LINK
  ========================================================= */

  const getPublicCommunityUrl =
    () => {
      if (
        typeof window ===
          "undefined" ||
        isPrivate ||
        !cleanSlug
      ) {
        return "";
      }

      return (
        `${window.location.origin}` +
        `/chat?community=${encodeURIComponent(
          cleanSlug
        )}`
      );
    };

  /* =========================================================
     COPY PUBLIC COMMUNITY LINK
  ========================================================= */

  const handleCopyPublicLink =
    async () => {
      const url =
        getPublicCommunityUrl();

      if (!url) {
        window.alert(
          "Save this community as public first."
        );

        return;
      }

      try {
        await navigator.clipboard.writeText(
          url
        );

        setCopiedPublicLink(
          true
        );

        setTimeout(
          () => {
            setCopiedPublicLink(
              false
            );
          },
          1500
        );
      } catch (
        error
      ) {
        console.error(
          "Copy community link error:",
          error
        );

        window.prompt(
          "Copy this community link:",
          url
        );
      }
    };

  /* =========================================================
     SHARE PUBLIC COMMUNITY
  ========================================================= */

  const handleSharePublicCommunity =
    async () => {
      const url =
        getPublicCommunityUrl();

      if (!url) {
        window.alert(
          "Save this community as public first."
        );

        return;
      }

      if (
        navigator.share
      ) {
        try {
          await navigator.share({
            title:
              title ||
              "Community",

            text:
              `Join ${
                title ||
                "this community"
              }.`,

            url,
          });

          return;
        } catch (
          error
        ) {
          if (
            error?.name ===
            "AbortError"
          ) {
            return;
          }

          console.error(
            "Share community error:",
            error
          );
        }
      }

      await handleCopyPublicLink();
    };

  /* =========================================================
     SAVE OVERVIEW
  ========================================================= */

  const handleSave =
    async () => {
      if (
        !canManage
      ) {
        return;
      }

      const cleanTitle =
        title.trim();

      if (
        !cleanTitle
      ) {
        window.alert(
          "Community name is required."
        );

        return;
      }

      if (
        !isPrivate &&
        !cleanSlug
      ) {
        window.alert(
          "Public communities require a username."
        );

        return;
      }

      try {
        setSaving(
          true
        );

        await updateCommunity({
          communityId,

          title:
            cleanTitle,

          description:
            description.trim(),

          avatarUrl:
            avatarUrl.trim() ||
            null,

          isPrivate,

          slug:
            isPrivate
              ? null
              : cleanSlug,
        });

        const updated = {
          ...conversation,

          title:
            cleanTitle,

          displayName:
            cleanTitle,

          description:
            description.trim() ||
            null,

          avatar_url:
            avatarUrl.trim() ||
            null,

          is_private:
            Boolean(
              isPrivate
            ),

          slug:
            isPrivate
              ? null
              : cleanSlug,
        };

        onUpdated?.(
          updated
        );

        window.alert(
          "Community updated."
        );
      } catch (
        error
      ) {
        console.error(
          "Update community error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to update community."
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  /* =========================================================
     ADD MEMBER
  ========================================================= */

  const handleAddMember =
    async (
      user
    ) => {
      try {
        setAddingUserId(
          user.id
        );

        await addCommunityMember(
          communityId,
          user.id
        );

        setUserQuery(
          ""
        );

        setUserResults(
          []
        );

        await loadCommunityData();
      } catch (
        error
      ) {
        console.error(
          "Add community member error:",
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

  /* =========================================================
     ROLE
  ========================================================= */

  const handleRoleChange =
    async (
      member,
      role
    ) => {
      if (
        !canManage ||
        !canActOnMember(
          member
        ) ||
        member.role ===
          "owner"
      ) {
        window.alert(
          "You cannot change this member's role."
        );

        return;
      }

      if (
        !isOwner &&
        role ===
          "admin"
      ) {
        window.alert(
          "Only the community owner can promote an admin."
        );

        return;
      }

      try {
        setActionUserId(
          member.user_id
        );

        await setCommunityMemberRole(
          communityId,
          member.user_id,
          role
        );

        await loadCommunityData();
      } catch (
        error
      ) {
        console.error(
          "Change community role error:",
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
     REMOVE MEMBER
  ========================================================= */

  const handleRemoveMember =
    async (
      member
    ) => {
      if (
        !canModerate ||
        !canActOnMember(
          member
        )
      ) {
        window.alert(
          "You cannot remove this member."
        );

        return;
      }

      const ok =
        window.confirm(
          `Remove ${getDisplayName(
            member
          )} from this community?`
        );

      if (!ok) {
        return;
      }

      try {
        setActionUserId(
          member.user_id
        );

        await removeCommunityMember(
          communityId,
          member.user_id
        );

        await loadCommunityData();
      } catch (
        error
      ) {
        console.error(
          "Remove community member error:",
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

  /* =========================================================
     MUTE
  ========================================================= */

  const handleMuteMember =
    async (
      member
    ) => {
      if (
        !canModerate ||
        !canActOnMember(
          member
        )
      ) {
        window.alert(
          "You cannot mute this member."
        );

        return;
      }

      const reason =
        window.prompt(
          "Mute reason (optional):",
          ""
        );

      if (
        reason ===
        null
      ) {
        return;
      }

      const hoursText =
        window.prompt(
          "Mute duration in hours. Leave blank for indefinite mute:",
          "24"
        );

      if (
        hoursText ===
        null
      ) {
        return;
      }

      let mutedUntil =
        null;

      if (
        hoursText.trim()
      ) {
        const hours =
          Number(
            hoursText
          );

        if (
          !Number.isFinite(
            hours
          ) ||
          hours <= 0
        ) {
          window.alert(
            "Enter a valid number of hours."
          );

          return;
        }

        mutedUntil =
          new Date(
            Date.now() +
              hours *
                60 *
                60 *
                1000
          ).toISOString();
      }

      try {
        setActionUserId(
          member.user_id
        );

        await muteCommunityMember({
          communityId,

          userId:
            member.user_id,

          mutedUntil,

          reason:
            reason.trim() ||
            null,
        });

        await loadCommunityData();
      } catch (
        error
      ) {
        console.error(
          "Mute community member error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to mute member."
        );
      } finally {
        setActionUserId(
          null
        );
      }
    };

  const handleUnmuteMember =
    async (
      userId
    ) => {
      try {
        setActionUserId(
          userId
        );

        await unmuteCommunityMember(
          communityId,
          userId
        );

        await loadCommunityData();
      } catch (
        error
      ) {
        console.error(
          "Unmute community member error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to unmute member."
        );
      } finally {
        setActionUserId(
          null
        );
      }
    };

  /* =========================================================
     BAN
  ========================================================= */

  const handleBanMember =
    async (
      member
    ) => {
      if (
        !canModerate ||
        !canActOnMember(
          member
        )
      ) {
        window.alert(
          "You cannot ban this member."
        );

        return;
      }

      const reason =
        window.prompt(
          `Ban ${getDisplayName(
            member
          )}? Enter a reason or leave blank:`,
          ""
        );

      if (
        reason ===
        null
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `${getDisplayName(
            member
          )} will be removed and prevented from joining this community. Continue?`
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

        await banCommunityMember({
          communityId,

          userId:
            member.user_id,

          reason:
            reason.trim() ||
            null,
        });

        await loadCommunityData();
      } catch (
        error
      ) {
        console.error(
          "Ban community member error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to ban member."
        );
      } finally {
        setActionUserId(
          null
        );
      }
    };

  const handleUnban =
    async (
      userId
    ) => {
      try {
        setActionUserId(
          userId
        );

        await unbanCommunityMember(
          communityId,
          userId
        );

        await loadCommunityData();
      } catch (
        error
      ) {
        console.error(
          "Unban community member error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to unban user."
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
    async (
      member
    ) => {
      if (
        !isOwner ||
        !member?.user_id ||
        member.user_id ===
          currentUser?.id ||
        member.role ===
          "owner"
      ) {
        window.alert(
          "Ownership can only be transferred to another community member."
        );

        return;
      }

      const confirmed =
        window.confirm(
          `Transfer ownership to ${getDisplayName(
            member
          )}? You will become an admin.`
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

        await transferCommunityOwnership(
          communityId,
          member.user_id
        );

        await loadCommunityData();

        onUpdated?.({
          ...conversation,

          currentMemberRole:
            "admin",

          created_by:
            member.user_id,
        });
      } catch (
        error
      ) {
        console.error(
          "Transfer community ownership error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to transfer ownership."
        );
      } finally {
        setActionUserId(
          null
        );
      }
    };

  /* =========================================================
     INVITES
  ========================================================= */

  const handleCreateInvite =
    async () => {
      try {
        setCreatingInvite(
          true
        );

        const token =
          await createCommunityInviteLink({
            communityId,

            maxUses:
              inviteMaxUses.trim() ||
              null,
          });

        setInviteMaxUses(
          ""
        );

        await loadCommunityData();

        if (token) {
          const link =
            `${window.location.origin}/chat?communityinvite=${encodeURIComponent(
              token
            )}`;

          try {
            await navigator.clipboard.writeText(
              link
            );

            window.alert(
              "Invite created and copied."
            );
          } catch {
            window.alert(
              `Invite created:\n${link}`
            );
          }
        }
      } catch (
        error
      ) {
        console.error(
          "Create community invite error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to create invite."
        );
      } finally {
        setCreatingInvite(
          false
        );
      }
    };

  const copyInvite =
    async (
      token
    ) => {
      const link =
        `${window.location.origin}/chat?communityinvite=${encodeURIComponent(
          token
        )}`;

      try {
        await navigator.clipboard.writeText(
          link
        );

        window.alert(
          "Invite copied."
        );
      } catch {
        window.prompt(
          "Copy invite:",
          link
        );
      }
    };

  const handleRevokeInvite =
    async (
      invite
    ) => {
      const confirmed =
        window.confirm(
          "Revoke this invite link?"
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        await revokeCommunityInviteLink(
          invite.id
        );

        await loadCommunityData();
      } catch (
        error
      ) {
        console.error(
          "Revoke community invite error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to revoke invite."
        );
      }
    };

  /* =========================================================
     OPEN CHILD GROUP / CHANNEL
  ========================================================= */

  const handleOpenChildConversation =
    async (
      item
    ) => {
      if (
        !item?.id ||
        !currentUser?.id
      ) {
        return;
      }

      try {
        setOpeningConversationId(
          item.id
        );

        let childMembers =
          await getConversationMembers(
            item.id
          );

        let myMembership =
          (
            childMembers ||
            []
          ).find(
            (
              member
            ) =>
              member.user_id ===
              currentUser.id
          );

        /*
          Community membership does not automatically mean
          membership in a child group/channel.

          Public channels may be joined directly from the
          community. Private channels and groups still require
          their own invite/member flow.
        */
        if (
          !myMembership &&
          item.type ===
            "channel" &&
          !item.is_private
        ) {
          await joinPublicChannel(
            item.id
          );

          childMembers =
            await getConversationMembers(
              item.id
            );

          myMembership =
            (
              childMembers ||
              []
            ).find(
              (
                member
              ) =>
                member.user_id ===
                currentUser.id
            );
        }

        if (!myMembership) {
          window.alert(
            item.type ===
              "channel"
              ? "This private channel requires a channel invite or membership."
              : "This group requires a group invite or membership."
          );

          return;
        }

        const childConversation = {
          ...item,

          type:
            item.type ===
            "channel"
              ? "channel"
              : "group",

          title:
            item.title ||
            (
              item.type ===
              "channel"
                ? "Channel"
                : "Group"
            ),

          displayName:
            item.title ||
            (
              item.type ===
              "channel"
                ? "Channel"
                : "Group"
            ),

          description:
            item.description ||
            null,

          avatar_url:
            item.avatar_url ||
            null,

          slug:
            item.slug ||
            null,

          is_private:
            Boolean(
              item.is_private
            ),

          memberCount:
            childMembers.length,

          currentMemberRole:
            myMembership.role ||
            "member",
        };

        onOpenConversation?.(
          childConversation
        );

        onClose?.();
      } catch (
        error
      ) {
        console.error(
          "Open community child conversation error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to open this conversation."
        );
      } finally {
        setOpeningConversationId(
          null
        );
      }
    };

  /* =========================================================
     ATTACH CHILD GROUP / CHANNEL
  ========================================================= */

  const handleAttachConversation =
    async (
      item
    ) => {
      try {
        setAttachingId(
          item.id
        );

        await attachConversationToCommunity(
          communityId,
          item.id
        );

        await loadCommunityData();
      } catch (
        error
      ) {
        console.error(
          "Attach community conversation error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to add conversation."
        );
      } finally {
        setAttachingId(
          null
        );
      }
    };

  /* =========================================================
     DETACH CHILD GROUP / CHANNEL
  ========================================================= */

  const handleDetachConversation =
    async (
      item
    ) => {
      const confirmed =
        window.confirm(
          `Remove "${
            item.title ||
            "conversation"
          }" from this community?`
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setAttachingId(
          item.id
        );

        await detachConversationFromCommunity(
          communityId,
          item.id
        );

        await loadCommunityData();
      } catch (
        error
      ) {
        console.error(
          "Detach community conversation error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to remove conversation."
        );
      } finally {
        setAttachingId(
          null
        );
      }
    };

  /* =========================================================
     LEAVE COMMUNITY
  ========================================================= */

  const handleLeave =
    async () => {
      if (
        isOwner
      ) {
        window.alert(
          "Transfer ownership before leaving the community."
        );

        return;
      }

      const confirmed =
        window.confirm(
          "Leave this community?"
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setLeaving(
          true
        );

        await leaveCommunity(
          communityId
        );

        onLeft?.(
          communityId
        );

        onClose?.();
      } catch (
        error
      ) {
        console.error(
          "Leave community error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to leave community."
        );
      } finally {
        setLeaving(
          false
        );
      }
    };

  /* =========================================================
     DELETE COMMUNITY
  ========================================================= */

  const handleDeleteCommunity =
    async () => {
      if (!isOwner) {
        window.alert(
          "Only the community owner can delete this community."
        );

        return;
      }

      const confirmation =
        window.prompt(
          `Delete "${title || "this community"}"?\n\nThis permanently deletes the community, its messages, members, invites, moderation records, and community links. Attached groups/channels are NOT deleted.\n\nType DELETE to continue:`,
          ""
        );

      if (
        confirmation !==
        "DELETE"
      ) {
        return;
      }

      try {
        setDeleting(
          true
        );

        await deleteCommunity(
          communityId
        );

        onLeft?.(
          communityId
        );

        onClose?.();
      } catch (
        error
      ) {
        console.error(
          "Delete community error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to delete community."
        );
      } finally {
        setDeleting(
          false
        );
      }
    };

  /* =========================================================
     RENDER
  ========================================================= */

  if (
    !conversation ||
    conversation.type !==
      "community"
  ) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-3">

      <div className="flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* =================================================
            HEADER
        ================================================= */}

        <div className="flex items-center gap-3 border-b px-4 py-3">

          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100">

            {avatarUrl ? (
              <img
                src={
                  avatarUrl
                }
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xl">
                🌐
              </span>
            )}

          </div>

          <div className="min-w-0 flex-1">

            <div className="truncate font-semibold text-gray-900">
              {title ||
                "Community"}
            </div>

            <div className="truncate text-xs text-gray-500">

              {members.length}{" "}

              {members.length ===
              1
                ? "member"
                : "members"}

              {" • "}

              {getRoleLabel(
                myRole
              )}

            </div>

          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ×
          </button>

        </div>

        {/* =================================================
            TABS
        ================================================= */}

        <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b px-3 py-2">

          {[
            [
              "overview",
              "Overview",
            ],

            [
              "members",
              `Members (${members.length})`,
            ],

            [
              "spaces",
              `Groups & Channels (${childConversations.length})`,
            ],

            ...(canManage
              ? [
                  [
                    "invites",
                    "Invites",
                  ],
                ]
              : []),

            ...(canModerate
              ? [
                  [
                    "moderation",
                    "Moderation",
                  ],
                ]
              : []),
          ].map(
            (
              [
                key,
                label,
              ]
            ) => (
              <button
                key={
                  key
                }
                type="button"
                onClick={() =>
                  setActiveTab(
                    key
                  )
                }
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  activeTab ===
                  key
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            )
          )}

        </div>

        {/* =================================================
            BODY
        ================================================= */}

        <div className="flex-1 overflow-y-auto">

          {loading ? (

            <div className="flex h-full items-center justify-center p-8 text-sm text-gray-400">
              Loading community...
            </div>

          ) : (

            <>

              {/* =================================================
                  OVERVIEW
              ================================================= */}

              {activeTab ===
                "overview" && (
                <div className="space-y-5 p-4">

                  <div className="flex flex-col items-center rounded-2xl bg-gray-50 p-5 text-center">

                    <div className="mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gray-200">

                      {avatarUrl ? (
                        <img
                          src={
                            avatarUrl
                          }
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-3xl">
                          🌐
                        </span>
                      )}

                    </div>

                    <div className="text-lg font-bold text-gray-900">
                      {title}
                    </div>

                    {!isPrivate &&
                      cleanSlug && (
                        <>

                          <div className="mt-1 text-sm font-medium text-purple-600">
                            @{cleanSlug}
                          </div>

                          <div className="mt-4 flex flex-wrap justify-center gap-2">

                            <button
                              type="button"
                              onClick={
                                handleSharePublicCommunity
                              }
                              className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700"
                            >
                              ↗ Share Community
                            </button>

                            <button
                              type="button"
                              onClick={
                                handleCopyPublicLink
                              }
                              className="rounded-xl bg-purple-50 px-4 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100"
                            >
                              {copiedPublicLink
                                ? "✓ Copied!"
                                : "🔗 Copy Link"}
                            </button>

                          </div>

                        </>
                      )}

                    <div className="mt-3 text-xs text-gray-500">
                      {isPrivate
                        ? "🔒 Private community"
                        : "🌍 Public community"}
                    </div>

                  </div>

                  {canManage ? (

                    <div className="space-y-4">

                      <div>

                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Community name
                        </label>

                        <input
                          type="text"
                          value={
                            title
                          }
                          onChange={(
                            event
                          ) =>
                            setTitle(
                              event.target.value
                            )
                          }
                          maxLength={80}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />

                      </div>

                      <div>

                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Description
                        </label>

                        <textarea
                          value={
                            description
                          }
                          onChange={(
                            event
                          ) =>
                            setDescription(
                              event.target.value
                            )
                          }
                          rows={4}
                          maxLength={300}
                          className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />

                      </div>

                      <div>

                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Avatar URL
                        </label>

                        <input
                          type="url"
                          value={
                            avatarUrl
                          }
                          onChange={(
                            event
                          ) =>
                            setAvatarUrl(
                              event.target.value
                            )
                          }
                          placeholder="https://..."
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />

                      </div>

                      <div className="rounded-xl border p-3">

                        <div className="flex items-start justify-between gap-3">

                          <div>

                            <div className="text-sm font-medium text-gray-900">
                              Private community
                            </div>

                            <div className="mt-1 text-xs text-gray-500">
                              Private communities require an invite or manual member addition.
                            </div>

                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setIsPrivate(
                                (
                                  previous
                                ) =>
                                  !previous
                              )
                            }
                            className={`relative h-6 w-11 flex-shrink-0 rounded-full ${
                              isPrivate
                                ? "bg-blue-600"
                                : "bg-gray-300"
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                                isPrivate
                                  ? "left-[22px]"
                                  : "left-0.5"
                              }`}
                            />
                          </button>

                        </div>

                      </div>

                      {!isPrivate && (
                        <div>

                          <label className="mb-1 block text-sm font-medium text-gray-700">
                            Community username
                          </label>

                          <div className="flex rounded-xl border border-gray-300">

                            <div className="flex items-center border-r bg-gray-50 px-3 text-sm text-gray-500">
                              @
                            </div>

                            <input
                              value={
                                slug
                              }
                              onChange={(
                                event
                              ) =>
                                setSlug(
                                  event.target.value
                                )
                              }
                              className="min-w-0 flex-1 rounded-r-xl px-3 py-2.5 text-sm outline-none"
                            />

                          </div>

                        </div>
                      )}

                      <button
                        type="button"
                        disabled={
                          saving
                        }
                        onClick={
                          handleSave
                        }
                        className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving
                          ? "Saving..."
                          : "Save Community"}
                      </button>

                    </div>

                  ) : (

                    <div className="rounded-xl border p-4">

                      <div className="text-sm font-semibold text-gray-800">
                        Description
                      </div>

                      <div className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                        {description ||
                          "No description."}
                      </div>

                    </div>

                  )}

                  <div className="border-t pt-4">

                    <button
                      type="button"
                      disabled={
                        leaving
                      }
                      onClick={
                        handleLeave
                      }
                      className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40"
                    >
                      {isOwner
                        ? "Transfer ownership before leaving"
                        : leaving
                        ? "Leaving..."
                        : "Leave Community"}
                    </button>

                    {isOwner && (
                      <button
                        type="button"
                        disabled={
                          deleting
                        }
                        onClick={
                          handleDeleteCommunity
                        }
                        className="mt-3 w-full rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {deleting
                          ? "Deleting Community..."
                          : "Delete Community Permanently"}
                      </button>
                    )}

                  </div>

                </div>
              )}

              {/* =================================================
                  MEMBERS
              ================================================= */}

              {activeTab ===
                "members" && (
                <div className="p-4">

                  {canManage && (
                    <div className="mb-5">

                      <div className="mb-2 text-sm font-semibold text-gray-800">
                        Add member
                      </div>

                      <input
                        type="text"
                        value={
                          userQuery
                        }
                        onChange={(
                          event
                        ) =>
                          setUserQuery(
                            event.target.value
                          )
                        }
                        placeholder="Search users..."
                        className="w-full rounded-xl bg-gray-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      />

                      {userQuery.trim() && (
                        <div className="mt-2 overflow-hidden rounded-xl border">

                          {searchingUsers && (
                            <div className="p-3 text-sm text-gray-400">
                              Searching...
                            </div>
                          )}

                          {!searchingUsers &&
                            userResults.length ===
                              0 && (
                              <div className="p-3 text-sm text-gray-400">
                                No users found.
                              </div>
                            )}

                          {!searchingUsers &&
                            userResults.map(
                              (
                                user
                              ) => (
                                <div
                                  key={
                                    user.id
                                  }
                                  className="flex items-center gap-3 border-b p-3 last:border-b-0"
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
                                      <span>
                                        👤
                                      </span>
                                    )}

                                  </div>

                                  <div className="min-w-0 flex-1">

                                    <div className="truncate text-sm font-medium">
                                      {getDisplayName(
                                        user
                                      )}
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
                                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {addingUserId ===
                                    user.id
                                      ? "Adding..."
                                      : "Add"}
                                  </button>

                                </div>
                              )
                            )}

                        </div>
                      )}

                    </div>
                  )}

                  <div className="space-y-2">

                    {members.map(
                      (
                        member
                      ) => {
                        const self =
                          member.user_id ===
                          currentUser?.id;

                        const busy =
                          actionUserId ===
                          member.user_id;

                        const isTargetOwner =
                          member.role ===
                          "owner";

                        const canEditRole =
                          !self &&
                          !isTargetOwner &&
                          canManage &&
                          canCommunityRoleActOn(
                            myRole,
                            member.role
                          );

                        const canAct =
                          !self &&
                          !isTargetOwner &&
                          canModerate &&
                          canCommunityRoleActOn(
                            myRole,
                            member.role
                          );

                        return (
                          <div
                            key={
                              member.user_id
                            }
                            className="rounded-xl border p-3"
                          >

                            <div className="flex items-start gap-3">

                              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200">

                                {member.avatar_url ? (
                                  <img
                                    src={
                                      member.avatar_url
                                    }
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span>
                                    👤
                                  </span>
                                )}

                              </div>

                              <div className="min-w-0 flex-1">

                                <div className="flex flex-wrap items-center gap-2">

                                  <div className="truncate text-sm font-semibold text-gray-900">
                                    {self
                                      ? "You"
                                      : getDisplayName(
                                          member
                                        )}
                                  </div>

                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getRoleBadgeClass(
                                      member.role
                                    )}`}
                                  >
                                    {getRoleLabel(
                                      member.role
                                    )}
                                  </span>

                                </div>

                                {member.username && (
                                  <div className="mt-0.5 truncate text-xs text-gray-400">
                                    @{member.username}
                                  </div>
                                )}

                              </div>

                            </div>

                            {canEditRole && (
                              <div className="mt-3">

                                <select
                                  value={
                                    member.role
                                  }
                                  disabled={
                                    busy
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    handleRoleChange(
                                      member,
                                      event.target.value
                                    )
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs outline-none"
                                >

                                  <option value="member">
                                    Member
                                  </option>

                                  <option value="moderator">
                                    Moderator
                                  </option>

                                  {isOwner && (
                                    <option value="admin">
                                      Admin
                                    </option>
                                  )}

                                </select>

                              </div>
                            )}

                            {canAct && (
                              <div className="mt-3 flex flex-wrap gap-2">

                                <button
                                  type="button"
                                  disabled={
                                    busy
                                  }
                                  onClick={() =>
                                    handleMuteMember(
                                      member
                                    )
                                  }
                                  className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-40"
                                >
                                  Mute
                                </button>

                                <button
                                  type="button"
                                  disabled={
                                    busy
                                  }
                                  onClick={() =>
                                    handleRemoveMember(
                                      member
                                    )
                                  }
                                  className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                                >
                                  Remove
                                </button>

                                <button
                                  type="button"
                                  disabled={
                                    busy
                                  }
                                  onClick={() =>
                                    handleBanMember(
                                      member
                                    )
                                  }
                                  className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-40"
                                >
                                  Ban
                                </button>

                                {isOwner &&
                                  member.role !==
                                    "owner" && (
                                    <button
                                      type="button"
                                      disabled={
                                        busy
                                      }
                                      onClick={() =>
                                        handleTransferOwnership(
                                          member
                                        )
                                      }
                                      className="rounded-lg bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-40"
                                    >
                                      Transfer Ownership
                                    </button>
                                  )}

                              </div>
                            )}

                          </div>
                        );
                      }
                    )}

                  </div>

                </div>
              )}

              {/* =================================================
                  GROUPS & CHANNELS
              ================================================= */}

              {activeTab ===
                "spaces" && (
                <div className="space-y-5 p-4">

                  <div>

                    <div className="mb-1 text-sm font-semibold text-gray-800">
                      In this community
                    </div>

                    <div className="mb-3 text-xs text-gray-400">
                      Open a group or channel connected to this community.
                    </div>

                    {childConversations.length ===
                    0 ? (
                      <div className="rounded-xl border border-dashed p-5 text-center text-sm text-gray-400">
                        No groups or channels added yet.
                      </div>
                    ) : (
                      <div className="space-y-2">

                        {childConversations.map(
                          (
                            item
                          ) => {
                            const opening =
                              openingConversationId ===
                              item.id;

                            const detaching =
                              attachingId ===
                              item.id;

                            const channel =
                              item.type ===
                              "channel";

                            return (
                              <div
                                key={
                                  item.id
                                }
                                className="rounded-xl border border-gray-200 bg-white p-3 transition hover:border-gray-300 hover:shadow-sm"
                              >

                                <div className="flex items-center gap-3">

                                  <div
                                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full ${
                                      channel
                                        ? "bg-blue-50"
                                        : "bg-gray-100"
                                    }`}
                                  >

                                    {item.avatar_url ? (
                                      <img
                                        src={
                                          item.avatar_url
                                        }
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <span className="text-xl">
                                        {channel
                                          ? "📢"
                                          : "👥"}
                                      </span>
                                    )}

                                  </div>

                                  <div className="min-w-0 flex-1">

                                    <div className="truncate text-sm font-semibold text-gray-900">
                                      {item.title ||
                                        (
                                          channel
                                            ? "Channel"
                                            : "Group"
                                        )}
                                    </div>

                                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">

                                      <span className="capitalize">
                                        {channel
                                          ? "Channel"
                                          : "Group"}
                                      </span>

                                      {item.slug && (
                                        <>
                                          <span>
                                            •
                                          </span>

                                          <span
                                            className={
                                              channel
                                                ? "text-blue-500"
                                                : "text-gray-500"
                                            }
                                          >
                                            @{item.slug}
                                          </span>
                                        </>
                                      )}

                                      {item.is_private && (
                                        <>
                                          <span>
                                            •
                                          </span>

                                          <span>
                                            🔒 Private
                                          </span>
                                        </>
                                      )}

                                    </div>

                                    {item.description && (
                                      <div className="mt-1 line-clamp-2 text-xs text-gray-500">
                                        {item.description}
                                      </div>
                                    )}

                                  </div>

                                </div>

                                <div className="mt-3 flex items-center gap-2 border-t pt-3">

                                  <button
                                    type="button"
                                    disabled={
                                      opening ||
                                      detaching
                                    }
                                    onClick={() =>
                                      handleOpenChildConversation(
                                        item
                                      )
                                    }
                                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${
                                      channel
                                        ? "bg-blue-600 hover:bg-blue-700"
                                        : "bg-gray-900 hover:bg-gray-800"
                                    }`}
                                  >
                                    {opening
                                      ? "Opening..."
                                      : channel
                                      ? "Open Channel"
                                      : "Open Group"}
                                  </button>

                                  {canManage && (
                                    <button
                                      type="button"
                                      disabled={
                                        opening ||
                                        detaching
                                      }
                                      onClick={() =>
                                        handleDetachConversation(
                                          item
                                        )
                                      }
                                      className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {detaching
                                        ? "Removing..."
                                        : "Remove"}
                                    </button>
                                  )}

                                </div>

                              </div>
                            );
                          }
                        )}

                      </div>
                    )}

                  </div>

                  {canManage && (
                    <div className="border-t pt-4">

                      <div className="mb-1 text-sm font-semibold text-gray-800">
                        Add your group or channel
                      </div>

                      <div className="mb-3 text-xs text-gray-400">
                        Only groups and channels that you manage can be attached.
                      </div>

                      {availableConversations.length ===
                      0 ? (
                        <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-400">
                          No available groups or channels that you manage.
                        </div>
                      ) : (
                        <div className="space-y-2">

                          {availableConversations.map(
                            (
                              item
                            ) => {
                              const channel =
                                item.type ===
                                "channel";

                              return (
                                <div
                                  key={
                                    item.id
                                  }
                                  className="flex items-center gap-3 rounded-xl border p-3"
                                >

                                  <div
                                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full ${
                                      channel
                                        ? "bg-blue-50"
                                        : "bg-gray-100"
                                    }`}
                                  >

                                    {item.avatar_url ? (
                                      <img
                                        src={
                                          item.avatar_url
                                        }
                                        alt=""
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <span>
                                        {channel
                                          ? "📢"
                                          : "👥"}
                                      </span>
                                    )}

                                  </div>

                                  <div className="min-w-0 flex-1">

                                    <div className="truncate text-sm font-medium">
                                      {item.title ||
                                        (
                                          channel
                                            ? "Channel"
                                            : "Group"
                                        )}
                                    </div>

                                    <div className="text-xs capitalize text-gray-400">
                                      {channel
                                        ? "Channel"
                                        : "Group"}
                                    </div>

                                  </div>

                                  <button
                                    type="button"
                                    disabled={
                                      attachingId ===
                                      item.id
                                    }
                                    onClick={() =>
                                      handleAttachConversation(
                                        item
                                      )
                                    }
                                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                                  >
                                    {attachingId ===
                                    item.id
                                      ? "Adding..."
                                      : "Add"}
                                  </button>

                                </div>
                              );
                            }
                          )}

                        </div>
                      )}

                    </div>
                  )}

                </div>
              )}

              {/* =================================================
                  INVITES
              ================================================= */}

              {activeTab ===
                "invites" &&
                canManage && (
                  <div className="space-y-5 p-4">

                    <div className="rounded-xl bg-gray-50 p-4">

                      <div className="text-sm font-semibold text-gray-800">
                        Create invite link
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        Optional maximum number of uses.
                      </div>

                      <div className="mt-3 flex gap-2">

                        <input
                          type="number"
                          min="1"
                          value={
                            inviteMaxUses
                          }
                          onChange={(
                            event
                          ) =>
                            setInviteMaxUses(
                              event.target.value
                            )
                          }
                          placeholder="Unlimited"
                          className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none"
                        />

                        <button
                          type="button"
                          disabled={
                            creatingInvite
                          }
                          onClick={
                            handleCreateInvite
                          }
                          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                        >
                          {creatingInvite
                            ? "Creating..."
                            : "Create"}
                        </button>

                      </div>

                    </div>

                    <div>

                      <div className="mb-2 text-sm font-semibold text-gray-800">
                        Invite links
                      </div>

                      {inviteLinks.length ===
                      0 ? (
                        <div className="rounded-xl border border-dashed p-5 text-center text-sm text-gray-400">
                          No invite links yet.
                        </div>
                      ) : (
                        <div className="space-y-2">

                          {inviteLinks.map(
                            (
                              invite
                            ) => (
                              <div
                                key={
                                  invite.id
                                }
                                className="rounded-xl border p-3"
                              >

                                <div className="flex items-start gap-3">

                                  <div className="min-w-0 flex-1">

                                    <div className="truncate font-mono text-xs text-gray-600">
                                      {invite.token}
                                    </div>

                                    <div className="mt-1 text-[11px] text-gray-400">

                                      Uses:{" "}

                                      {invite.use_count ||
                                        0}

                                      {invite.max_uses
                                        ? ` / ${invite.max_uses}`
                                        : " / unlimited"}

                                    </div>

                                    {invite.expires_at && (
                                      <div className="mt-1 text-[11px] text-gray-400">
                                        Expires:{" "}
                                        {formatDate(
                                          invite.expires_at
                                        )}
                                      </div>
                                    )}

                                  </div>

                                  <div className="flex gap-1">

                                    {invite.is_active && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          copyInvite(
                                            invite.token
                                          )
                                        }
                                        className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-100"
                                      >
                                        Copy
                                      </button>
                                    )}

                                    {invite.is_active && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRevokeInvite(
                                            invite
                                          )
                                        }
                                        className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100"
                                      >
                                        Revoke
                                      </button>
                                    )}

                                  </div>

                                </div>

                                {!invite.is_active && (
                                  <div className="mt-2 text-xs font-medium text-red-400">
                                    Revoked
                                  </div>
                                )}

                              </div>
                            )
                          )}

                        </div>
                      )}

                    </div>

                  </div>
                )}

              {/* =================================================
                  MODERATION
              ================================================= */}

              {activeTab ===
                "moderation" &&
                canModerate && (
                  <div className="space-y-6 p-4">

                    <div>

                      <div className="mb-2 text-sm font-semibold text-gray-800">
                        Muted members
                      </div>

                      {mutes.length ===
                      0 ? (
                        <div className="rounded-xl border border-dashed p-4 text-sm text-gray-400">
                          No muted members.
                        </div>
                      ) : (
                        <div className="space-y-2">

                          {mutes.map(
                            (
                              mute
                            ) => (
                              <div
                                key={
                                  mute.user_id
                                }
                                className="flex items-center gap-3 rounded-xl border p-3"
                              >

                                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gray-200">

                                  {mute.avatar_url ? (
                                    <img
                                      src={
                                        mute.avatar_url
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
                                    {getDisplayName(
                                      mute
                                    )}
                                  </div>

                                  {mute.reason && (
                                    <div className="truncate text-xs text-gray-400">
                                      {mute.reason}
                                    </div>
                                  )}

                                  <div className="text-[11px] text-gray-400">
                                    {mute.muted_until
                                      ? `Until ${formatDate(
                                          mute.muted_until
                                        )}`
                                      : "Indefinite"}
                                  </div>

                                </div>

                                {(() => {
                                  const mutedMember =
                                    members.find(
                                      (
                                        member
                                      ) =>
                                        member.user_id ===
                                        mute.user_id
                                    );

                                  const canUnmute =
                                    mutedMember
                                      ? canModerate &&
                                        canCommunityRoleActOn(
                                          myRole,
                                          mutedMember.role
                                        )
                                      : canManage;

                                  if (
                                    !canUnmute
                                  ) {
                                    return null;
                                  }

                                  return (
                                    <button
                                      type="button"
                                      disabled={
                                        actionUserId ===
                                        mute.user_id
                                      }
                                      onClick={() =>
                                        handleUnmuteMember(
                                          mute.user_id
                                        )
                                      }
                                      className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-40"
                                    >
                                      Unmute
                                    </button>
                                  );
                                })()}

                              </div>
                            )
                          )}

                        </div>
                      )}

                    </div>

                    <div>

                      <div className="mb-2 text-sm font-semibold text-gray-800">
                        Banned users
                      </div>

                      {bans.length ===
                      0 ? (
                        <div className="rounded-xl border border-dashed p-4 text-sm text-gray-400">
                          No banned users.
                        </div>
                      ) : (
                        <div className="space-y-2">

                          {bans.map(
                            (
                              ban
                            ) => (
                              <div
                                key={
                                  ban.user_id
                                }
                                className="flex items-center gap-3 rounded-xl border p-3"
                              >

                                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gray-200">

                                  {ban.avatar_url ? (
                                    <img
                                      src={
                                        ban.avatar_url
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
                                    {getDisplayName(
                                      ban
                                    )}
                                  </div>

                                  {ban.reason && (
                                    <div className="truncate text-xs text-gray-400">
                                      {ban.reason}
                                    </div>
                                  )}

                                  <div className="text-[11px] text-gray-400">
                                    Banned{" "}
                                    {formatDate(
                                      ban.created_at
                                    )}
                                  </div>

                                </div>

                                {canManage && (
                                  <button
                                    type="button"
                                    disabled={
                                      actionUserId ===
                                      ban.user_id
                                    }
                                    onClick={() =>
                                      handleUnban(
                                        ban.user_id
                                      )
                                    }
                                    className="rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-40"
                                  >
                                    Unban
                                  </button>
                                )}

                              </div>
                            )
                          )}

                        </div>
                      )}

                    </div>

                  </div>
                )}

            </>
          )}

        </div>

      </div>

    </div>
  );
}