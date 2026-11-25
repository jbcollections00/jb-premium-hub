import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createChannelConversation,
  getConversationMembers,
  searchUsers,
} from "../../services/chatService";

export default function CreateChannelModal({
  currentUser,
  onClose,
  onCreated,
}) {
  const [
    title,
    setTitle,
  ] = useState("");

  const [
    description,
    setDescription,
  ] = useState("");

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
    selectedUsers,
    setSelectedUsers,
  ] = useState([]);

  const [
    creating,
    setCreating,
  ] = useState(false);

  /* =========================================================
     SEARCH USERS
  ========================================================= */

  useEffect(() => {
    const timeout =
      setTimeout(
        async () => {
          const value =
            query.trim();

          if (!value) {
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

            const filtered =
              (users || []).filter(
                (user) =>
                  user.id !==
                  currentUser?.id
              );

            setSearchResults(
              filtered
            );
          } catch (error) {
            console.error(
              "Search users for channel error:",
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
    currentUser?.id,
  ]);

  /* =========================================================
     SELECTED IDS
  ========================================================= */

  const selectedIds =
    useMemo(
      () =>
        new Set(
          selectedUsers.map(
            (user) =>
              user.id
          )
        ),
      [
        selectedUsers,
      ]
    );

  /* =========================================================
     TOGGLE USER
  ========================================================= */

  const toggleUser =
    (
      user
    ) => {
      if (
        !user?.id ||
        user.id ===
          currentUser?.id
      ) {
        return;
      }

      setSelectedUsers(
        (
          previous
        ) => {
          const exists =
            previous.some(
              (item) =>
                item.id ===
                user.id
            );

          if (exists) {
            return previous.filter(
              (item) =>
                item.id !==
                user.id
            );
          }

          return [
            ...previous,
            user,
          ];
        }
      );
    };

  /* =========================================================
     REMOVE SELECTED
  ========================================================= */

  const removeSelected =
    (
      userId
    ) => {
      setSelectedUsers(
        (
          previous
        ) =>
          previous.filter(
            (user) =>
              user.id !==
              userId
          )
      );
    };

  /* =========================================================
     CREATE CHANNEL
  ========================================================= */

  const handleCreate =
    async () => {
      const cleanTitle =
        title.trim();

      if (!cleanTitle) {
        window.alert(
          "Channel name is required."
        );

        return;
      }

      try {
        setCreating(
          true
        );

        const conversationId =
          await createChannelConversation({
            title:
              cleanTitle,

            description:
              description.trim(),

            avatarUrl:
              null,

            memberIds:
              selectedUsers.map(
                (user) =>
                  user.id
              ),
          });

        if (!conversationId) {
          throw new Error(
            "Channel was not created."
          );
        }

        /*
          Load members so we can make
          a normalized conversation object.
        */
        let memberCount =
          selectedUsers.length +
          1;

        try {
          const members =
            await getConversationMembers(
              conversationId
            );

          memberCount =
            members?.length ||
            memberCount;
        } catch (error) {
          console.error(
            "Load newly created channel members error:",
            error
          );
        }

        const channelConversation = {
          id:
            conversationId,

          type:
            "channel",

          title:
            cleanTitle,

          displayName:
            cleanTitle,

          description:
            description.trim() ||
            null,

          avatar_url:
            null,

          created_by:
            currentUser?.id ||
            null,

          is_private:
            true,

          memberCount,

          currentMemberRole:
            "owner",
        };

        await onCreated?.(
          channelConversation
        );

        onClose?.();
      } catch (error) {
        console.error(
          "Create channel error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to create channel."
        );
      } finally {
        setCreating(
          false
        );
      }
    };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-3">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">

        {/* HEADER */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-lg font-bold">
              Create Channel
            </div>

            <div className="text-xs text-gray-400">
              Broadcast updates to members
            </div>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              creating
            }
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* BODY */}
        <div className="overflow-y-auto p-4">

          {/* CHANNEL ICON */}
          <div className="mb-5 flex flex-col items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-3xl">
              📢
            </div>

            <div className="mt-2 text-xs text-gray-400">
              Channel
            </div>
          </div>

          {/* CHANNEL NAME */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">
              Channel name
            </label>

            <input
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
              maxLength={
                80
              }
              placeholder="Enter channel name"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* DESCRIPTION */}
          <div className="mb-5">
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">
              Description
              <span className="ml-1 font-normal text-gray-400">
                (optional)
              </span>
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
              maxLength={
                300
              }
              rows={
                3
              }
              placeholder="What is this channel about?"
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* SELECTED USERS */}
          {selectedUsers.length >
            0 && (
            <div className="mb-5">
              <div className="mb-2 text-xs font-semibold text-gray-500">
                Selected members ·{" "}
                {
                  selectedUsers.length
                }
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedUsers.map(
                  (
                    user
                  ) => (
                    <div
                      key={
                        user.id
                      }
                      className="flex max-w-full items-center gap-2 rounded-full bg-blue-50 py-1 pl-1 pr-2"
                    >
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-xs">
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

                      <span className="max-w-[150px] truncate text-xs font-medium text-blue-700">
                        {user.full_name ||
                          user.username ||
                          "User"}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          removeSelected(
                            user.id
                          )
                        }
                        className="flex h-5 w-5 items-center justify-center rounded-full text-xs text-blue-500 hover:bg-blue-100"
                      >
                        ✕
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* SEARCH USERS */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">
              Add members
              <span className="ml-1 font-normal text-gray-400">
                (optional)
              </span>
            </label>

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
              placeholder="Search name or username..."
              className="w-full rounded-xl bg-gray-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />

            {query.trim() && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border">

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
                  ) => {
                    const selected =
                      selectedIds.has(
                        user.id
                      );

                    return (
                      <button
                        key={
                          user.id
                        }
                        type="button"
                        onClick={() =>
                          toggleUser(
                            user
                          )
                        }
                        className={`flex w-full items-center gap-3 border-b px-3 py-3 text-left last:border-b-0 ${
                          selected
                            ? "bg-blue-50"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        {/* AVATAR */}
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

                        {/* NAME */}
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

                        {/* SELECT */}
                        <div
                          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                            selected
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-gray-300 text-transparent"
                          }`}
                        >
                          ✓
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              creating
            }
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={
              handleCreate
            }
            disabled={
              creating ||
              !title.trim()
            }
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating
              ? "Creating..."
              : "Create Channel"}
          </button>
        </div>
      </div>
    </div>
  );
}