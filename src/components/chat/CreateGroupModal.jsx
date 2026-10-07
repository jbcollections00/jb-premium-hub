import {
  useEffect,
  useState,
} from "react";

import {
  createGroupConversation,
  searchUsers,
} from "../../services/chatService";

const hiddenScrollbarClass = `
  overflow-y-auto
  [scrollbar-width:none]
  [-ms-overflow-style:none]
  [&::-webkit-scrollbar]:hidden
`;

export default function CreateGroupModal({
  currentUser,
  onClose,
  onCreated,
}) {
  const [title, setTitle] =
    useState("");

  const [query, setQuery] =
    useState("");

  const [
    searchResults,
    setSearchResults,
  ] = useState([]);

  const [
    selectedUsers,
    setSelectedUsers,
  ] = useState([]);

  const [
    searching,
    setSearching,
  ] = useState(false);

  const [
    creating,
    setCreating,
  ] = useState(false);

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

            setSearchResults(
              users || []
            );
          } catch (error) {
            console.error(
              "Group user search error:",
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
  ]);

  const isSelected =
    (userId) =>
      selectedUsers.some(
        (user) =>
          user.id === userId
      );

  const toggleUser =
    (user) => {
      if (
        isSelected(
          user.id
        )
      ) {
        setSelectedUsers(
          (
            previous
          ) =>
            previous.filter(
              (
                item
              ) =>
                item.id !==
                user.id
            )
        );

        return;
      }

      setSelectedUsers(
        (
          previous
        ) => [
          ...previous,
          user,
        ]
      );
    };

  const handleCreate =
    async () => {
      const groupName =
        title.trim();

      if (
        !groupName
      ) {
        window.alert(
          "Enter a group name."
        );

        return;
      }

      if (
        selectedUsers.length ===
        0
      ) {
        window.alert(
          "Select at least one member."
        );

        return;
      }

      try {
        setCreating(
          true
        );

        const conversationId =
          await createGroupConversation({
            title:
              groupName,

            memberIds:
              selectedUsers.map(
                (
                  user
                ) =>
                  user.id
              ),
          });

        const conversation = {
          id:
            conversationId,

          type:
            "group",

          title:
            groupName,

          displayName:
            groupName,

          avatar_url:
            null,
        };

        onCreated?.(
          conversation
        );

        onClose?.();
      } catch (error) {
        console.error(
          "Create group error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to create group."
        );
      } finally {
        setCreating(
          false
        );
      }
    };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">

        {/* HEADER */}
        <div className="flex flex-shrink-0 items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-lg font-bold">
              New Group
            </div>

            <div className="text-xs text-gray-400">
              Create a group conversation
            </div>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* CONTENT */}
        <div
          className={`flex-1 p-4 ${hiddenScrollbarClass}`}
        >
          <label className="mb-2 block text-xs font-semibold text-gray-500">
            Group name
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
            placeholder="Enter group name"
            maxLength={80}
            className="mb-4 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-blue-500"
          />

          {selectedUsers.length >
            0 && (
            <div className="mb-4">
              <div className="mb-2 text-xs font-semibold text-gray-500">
                Selected members (
                {
                  selectedUsers.length
                }
                )
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedUsers.map(
                  (
                    user
                  ) => (
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
                      className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs text-blue-700"
                    >
                      <span>
                        {user.full_name ||
                          user.username ||
                          "User"}
                      </span>

                      <span>
                        ✕
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          <label className="mb-2 block text-xs font-semibold text-gray-500">
            Add members
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
            placeholder="Search users..."
            className="w-full rounded-xl bg-gray-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="mt-3">
            {searching && (
              <div className="py-4 text-center text-sm text-gray-400">
                Searching...
              </div>
            )}

            {!searching &&
              query.trim() &&
              searchResults.length ===
                0 && (
                <div className="py-4 text-center text-sm text-gray-400">
                  No users found.
                </div>
              )}

            {searchResults.map(
              (
                user
              ) => {
                const selected =
                  isSelected(
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
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${
                      selected
                        ? "bg-blue-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200">
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
                      <div className="truncate font-medium">
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

                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                        selected
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-gray-300"
                      }`}
                    >
                      {selected
                        ? "✓"
                        : ""}
                    </div>
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex-shrink-0 border-t p-4">
          <button
            type="button"
            onClick={
              handleCreate
            }
            disabled={
              creating ||
              !title.trim() ||
              selectedUsers.length ===
                0
            }
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating
              ? "Creating..."
              : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}