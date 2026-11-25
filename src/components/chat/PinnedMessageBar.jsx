import {
  useEffect,
  useState,
} from "react";

export default function PinnedMessageBar({
  pinnedMessages = [],
  onJump,
}) {
  const [
    activeIndex,
    setActiveIndex,
  ] = useState(0);

  /*
    Whenever the pin list changes,
    reset to the latest pinned message.
  */
  useEffect(() => {
    setActiveIndex(0);
  }, [
    pinnedMessages.length,
  ]);

  if (
    !pinnedMessages.length
  ) {
    return null;
  }

  const safeIndex =
    Math.min(
      activeIndex,
      pinnedMessages.length - 1
    );

  const activePin =
    pinnedMessages[
      safeIndex
    ];

  const preview =
    activePin.message?.trim() ||
    (
      activePin.message_type ===
      "image"
        ? "📷 Photo"
        : activePin.message_type ===
          "video"
        ? "🎥 Video"
        : activePin.message_type ===
          "file"
        ? "📎 File"
        : "📎 Attachment"
    );

  /*
    getPinnedMessages() is ordered
    newest -> oldest.

    So:
      index 0 = 3/3
      index 1 = 2/3
      index 2 = 1/3
  */
  const currentNumber =
    pinnedMessages.length -
    safeIndex;

  const total =
    pinnedMessages.length;

  const handleClick =
    () => {
      /*
        Jump to the currently shown
        pinned message first.
      */
      onJump?.(
        activePin.message_id
      );

      /*
        Then prepare the previous pin
        for the next click.

        3/3 -> 2/3 -> 1/3 -> 3/3
      */
      if (
        pinnedMessages.length >
        1
      ) {
        setActiveIndex(
          (
            previous
          ) =>
            previous + 1 >=
            pinnedMessages.length
              ? 0
              : previous + 1
        );
      }
    };

  return (
    <button
      type="button"
      onClick={
        handleClick
      }
      className="group flex w-full flex-shrink-0 items-center gap-3 border-b bg-white px-4 py-2 text-left transition hover:bg-gray-50"
    >
      {/* TELEGRAM-LIKE POSITION INDICATOR */}
      <div className="flex h-10 flex-shrink-0 flex-col justify-center gap-[2px]">
        {pinnedMessages
          .slice(
            0,
            4
          )
          .map(
            (
              pin,
              index
            ) => (
              <div
                key={
                  pin.message_id
                }
                className={`w-1 rounded-full transition-all ${
                  index ===
                  safeIndex
                    ? "h-4 bg-blue-600"
                    : "h-1.5 bg-blue-200"
                }`}
              />
            )
          )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
          <span>
            📌
          </span>

          <span>
            Pinned message
          </span>

          {total > 1 && (
            <span className="font-medium text-gray-400">
              · {currentNumber}/{total}
            </span>
          )}
        </div>

        <div className="truncate text-sm text-gray-600">
          {activePin.sender_name
            ? `${activePin.sender_name}: `
            : ""}

          {preview}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        {total > 1 && (
          <span className="hidden text-[10px] text-gray-400 sm:inline">
            Click for next pin
          </span>
        )}

        <span className="text-lg text-gray-400 transition group-hover:text-blue-600">
          ›
        </span>
      </div>
    </button>
  );
}