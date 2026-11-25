import {
  useMemo,
  useState,
} from "react";

import {
  createCommunity,
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

/* =========================================================
   COMPONENT
========================================================= */

export default function CreateCommunityModal({
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
    avatarUrl,
    setAvatarUrl,
  ] = useState("");

  const [
    isPrivate,
    setIsPrivate,
  ] = useState(false);

  const [
    slug,
    setSlug,
  ] = useState("");

  const [
    creating,
    setCreating,
  ] = useState(false);

  /* =========================================================
     DERIVED
  ========================================================= */

  const cleanSlug =
    useMemo(
      () =>
        normalizeSlug(
          slug
        ),
      [
        slug,
      ]
    );

  const canCreate =
    Boolean(
      title.trim()
    ) &&
    (
      isPrivate ||
      Boolean(
        cleanSlug
      )
    ) &&
    !creating;

  /* =========================================================
     CREATE
  ========================================================= */

  const handleCreate =
    async () => {
      const communityName =
        title.trim();

      if (
        !currentUser?.id
      ) {
        window.alert(
          "You must be signed in."
        );

        return;
      }

      if (
        !communityName
      ) {
        window.alert(
          "Enter a community name."
        );

        return;
      }

      if (
        !isPrivate &&
        !cleanSlug
      ) {
        window.alert(
          "Enter a community username."
        );

        return;
      }

      try {
        setCreating(
          true
        );

        const communityId =
          await createCommunity({
            title:
              communityName,

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

        if (
          !communityId
        ) {
          throw new Error(
            "Community was created but no ID was returned."
          );
        }

        const conversation = {
          id:
            communityId,

          type:
            "community",

          title:
            communityName,

          displayName:
            communityName,

          description:
            description.trim() ||
            null,

          avatar_url:
            avatarUrl.trim() ||
            null,

          slug:
            isPrivate
              ? null
              : cleanSlug,

          is_private:
            Boolean(
              isPrivate
            ),

          memberCount:
            1,

          currentMemberRole:
            "owner",

          created_by:
            currentUser.id,
        };

        onCreated?.(
          conversation
        );

        onClose?.();
      } catch (
        error
      ) {
        console.error(
          "Create community error:",
          error
        );

        window.alert(
          error?.message ||
            "Unable to create community."
        );
      } finally {
        setCreating(
          false
        );
      }
    };

  /* =========================================================
     KEYBOARD
  ========================================================= */

  const handleKeyDown =
    (event) => {
      if (
        event.key ===
        "Escape"
      ) {
        if (
          !creating
        ) {
          onClose?.();
        }

        return;
      }

      if (
        event.key ===
          "Enter" &&
        (
          event.ctrlKey ||
          event.metaKey
        )
      ) {
        if (
          canCreate
        ) {
          handleCreate();
        }
      }
    };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div
      className="
        fixed
        inset-0
        z-[9999]
        flex
        items-center
        justify-center
        bg-black/50
        p-4
      "
      onKeyDown={
        handleKeyDown
      }
    >
      <div
        className="
          flex
          max-h-[90vh]
          w-full
          max-w-md
          flex-col
          overflow-hidden
          rounded-2xl
          bg-white
          shadow-xl
        "
      >
        {/* =================================================
            HEADER
        ================================================= */}

        <div
          className="
            flex
            items-center
            justify-between
            border-b
            px-4
            py-3
          "
        >
          <div>
            <h2
              className="
                text-base
                font-semibold
                text-gray-900
              "
            >
              Create Community
            </h2>

            <p
              className="
                mt-0.5
                text-xs
                text-gray-500
              "
            >
              Create a space for groups and channels.
            </p>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              creating
            }
            className="
              flex
              h-9
              w-9
              items-center
              justify-center
              rounded-full
              text-xl
              text-gray-500
              transition
              hover:bg-gray-100
              disabled:opacity-40
            "
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* =================================================
            BODY
        ================================================= */}

        <div
          className="
            flex-1
            overflow-y-auto
            p-4
          "
        >
          <div
            className="
              space-y-4
            "
          >
            {/* COMMUNITY PREVIEW */}

            <div
              className="
                flex
                items-center
                gap-3
                rounded-xl
                border
                bg-gray-50
                p-3
              "
            >
              <div
                className="
                  flex
                  h-14
                  w-14
                  flex-shrink-0
                  items-center
                  justify-center
                  overflow-hidden
                  rounded-full
                  bg-gray-200
                  text-2xl
                "
              >
                {avatarUrl.trim() ? (
                  <img
                    src={
                      avatarUrl.trim()
                    }
                    alt=""
                    className="
                      h-full
                      w-full
                      object-cover
                    "
                    onError={(
                      event
                    ) => {
                      event.currentTarget.style.display =
                        "none";
                    }}
                  />
                ) : (
                  <span>
                    👥
                  </span>
                )}
              </div>

              <div
                className="
                  min-w-0
                  flex-1
                "
              >
                <div
                  className="
                    truncate
                    font-semibold
                    text-gray-900
                  "
                >
                  {title.trim() ||
                    "Community name"}
                </div>

                <div
                  className="
                    truncate
                    text-xs
                    text-gray-500
                  "
                >
                  {isPrivate
                    ? "Private community"
                    : cleanSlug
                    ? `@${cleanSlug}`
                    : "Public community"}
                </div>
              </div>
            </div>

            {/* NAME */}

            <div>
              <label
                className="
                  mb-1
                  block
                  text-sm
                  font-medium
                  text-gray-700
                "
              >
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
                placeholder="My Community"
                maxLength={80}
                disabled={
                  creating
                }
                autoFocus
                className="
                  w-full
                  rounded-xl
                  border
                  border-gray-300
                  px-3
                  py-2.5
                  text-sm
                  outline-none
                  transition
                  focus:border-blue-500
                  focus:ring-2
                  focus:ring-blue-100
                  disabled:bg-gray-100
                "
              />

              <div
                className="
                  mt-1
                  text-right
                  text-[11px]
                  text-gray-400
                "
              >
                {title.length}/80
              </div>
            </div>

            {/* DESCRIPTION */}

            <div>
              <label
                className="
                  mb-1
                  block
                  text-sm
                  font-medium
                  text-gray-700
                "
              >
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
                placeholder="What is this community about?"
                rows={3}
                maxLength={300}
                disabled={
                  creating
                }
                className="
                  w-full
                  resize-none
                  rounded-xl
                  border
                  border-gray-300
                  px-3
                  py-2.5
                  text-sm
                  outline-none
                  transition
                  focus:border-blue-500
                  focus:ring-2
                  focus:ring-blue-100
                  disabled:bg-gray-100
                "
              />

              <div
                className="
                  mt-1
                  text-right
                  text-[11px]
                  text-gray-400
                "
              >
                {description.length}/300
              </div>
            </div>

            {/* AVATAR URL */}

            <div>
              <label
                className="
                  mb-1
                  block
                  text-sm
                  font-medium
                  text-gray-700
                "
              >
                Avatar URL
                <span
                  className="
                    ml-1
                    font-normal
                    text-gray-400
                  "
                >
                  optional
                </span>
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
                disabled={
                  creating
                }
                className="
                  w-full
                  rounded-xl
                  border
                  border-gray-300
                  px-3
                  py-2.5
                  text-sm
                  outline-none
                  transition
                  focus:border-blue-500
                  focus:ring-2
                  focus:ring-blue-100
                  disabled:bg-gray-100
                "
              />
            </div>

            {/* PRIVACY */}

            <div
              className="
                rounded-xl
                border
                p-3
              "
            >
              <div
                className="
                  flex
                  items-start
                  justify-between
                  gap-3
                "
              >
                <div
                  className="
                    min-w-0
                    flex-1
                  "
                >
                  <div
                    className="
                      text-sm
                      font-medium
                      text-gray-900
                    "
                  >
                    Private community
                  </div>

                  <div
                    className="
                      mt-0.5
                      text-xs
                      leading-5
                      text-gray-500
                    "
                  >
                    Private communities can only be joined using an invite link or by being added by a manager.
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
                  disabled={
                    creating
                  }
                  className={`
                    relative
                    h-6
                    w-11
                    flex-shrink-0
                    rounded-full
                    transition
                    ${
                      isPrivate
                        ? "bg-blue-600"
                        : "bg-gray-300"
                    }
                    ${
                      creating
                        ? "opacity-40"
                        : ""
                    }
                  `}
                  aria-pressed={
                    isPrivate
                  }
                >
                  <span
                    className={`
                      absolute
                      top-0.5
                      h-5
                      w-5
                      rounded-full
                      bg-white
                      shadow
                      transition
                      ${
                        isPrivate
                          ? "left-[22px]"
                          : "left-0.5"
                      }
                    `}
                  />
                </button>
              </div>
            </div>

            {/* PUBLIC USERNAME */}

            {!isPrivate && (
              <div>
                <label
                  className="
                    mb-1
                    block
                    text-sm
                    font-medium
                    text-gray-700
                  "
                >
                  Community username
                </label>

                <div
                  className="
                    flex
                    rounded-xl
                    border
                    border-gray-300
                    focus-within:border-blue-500
                    focus-within:ring-2
                    focus-within:ring-blue-100
                  "
                >
                  <div
                    className="
                      flex
                      items-center
                      border-r
                      bg-gray-50
                      px-3
                      text-sm
                      text-gray-500
                    "
                  >
                    @
                  </div>

                  <input
                    type="text"
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
                    placeholder="my-community"
                    maxLength={60}
                    disabled={
                      creating
                    }
                    className="
                      min-w-0
                      flex-1
                      rounded-r-xl
                      px-3
                      py-2.5
                      text-sm
                      outline-none
                      disabled:bg-gray-100
                    "
                  />
                </div>

                {slug &&
                  cleanSlug !==
                    slug
                      .trim()
                      .replace(
                        /^@/,
                        ""
                      )
                      .toLowerCase() && (
                    <div
                      className="
                        mt-1
                        text-xs
                        text-gray-500
                      "
                    >
                      Will be saved as{" "}
                      <span
                        className="
                          font-medium
                          text-gray-700
                        "
                      >
                        @{cleanSlug}
                      </span>
                    </div>
                  )}

                <div
                  className="
                    mt-1
                    text-xs
                    leading-5
                    text-gray-400
                  "
                >
                  Public communities can be discovered and joined by other users.
                </div>
              </div>
            )}

            {/* INFO */}

            <div
              className="
                rounded-xl
                bg-blue-50
                p-3
                text-xs
                leading-5
                text-blue-700
              "
            >
              You will become the owner. After creating the community, you can add members, assign roles, create invite links, and attach groups or channels.
            </div>
          </div>
        </div>

        {/* =================================================
            FOOTER
        ================================================= */}

        <div
          className="
            flex
            items-center
            justify-end
            gap-2
            border-t
            bg-white
            px-4
            py-3
          "
        >
          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              creating
            }
            className="
              rounded-xl
              px-4
              py-2.5
              text-sm
              font-medium
              text-gray-600
              transition
              hover:bg-gray-100
              disabled:opacity-40
            "
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={
              handleCreate
            }
            disabled={
              !canCreate
            }
            className="
              rounded-xl
              bg-blue-600
              px-4
              py-2.5
              text-sm
              font-semibold
              text-white
              transition
              hover:bg-blue-700
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
          >
            {creating
              ? "Creating..."
              : "Create Community"}
          </button>
        </div>
      </div>
    </div>
  );
}