import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  reportChatMessage,
} from "../../services/chatService";

const REPORT_REASONS = [
  {
    value:
      "spam",

    label:
      "Spam",

    description:
      "Repeated, unwanted, or irrelevant messages.",
  },

  {
    value:
      "harassment",

    label:
      "Harassment or bullying",

    description:
      "Targeted insults, intimidation, or unwanted behavior.",
  },

  {
    value:
      "hate",

    label:
      "Hate or abusive content",

    description:
      "Attacks or abusive content aimed at a protected group.",
  },

  {
    value:
      "sexual",

    label:
      "Sexual content",

    description:
      "Inappropriate sexual content or solicitation.",
  },

  {
    value:
      "violence",

    label:
      "Violence or threats",

    description:
      "Threatening, violent, or dangerous content.",
  },

  {
    value:
      "scam",

    label:
      "Scam or fraud",

    description:
      "Attempts to deceive, steal money, or collect credentials.",
  },

  {
    value:
      "privacy",

    label:
      "Privacy violation",

    description:
      "Personal or private information shared without permission.",
  },

  {
    value:
      "other",

    label:
      "Other",

    description:
      "Something else that should be reviewed.",
  },
];

function getSenderName(
  message
) {
  return (
    message?.sender
      ?.full_name
      ?.trim() ||
    message?.sender
      ?.username
      ?.trim() ||
    "User"
  );
}

export default function ReportMessageModal({
  isOpen,
  onClose,
  message,
}) {
  const [
    reason,
    setReason,
  ] =
    useState(
      ""
    );

  const [
    details,
    setDetails,
  ] =
    useState(
      ""
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const [
    submitted,
    setSubmitted,
  ] =
    useState(
      false
    );

  const senderName =
    useMemo(
      () =>
        getSenderName(
          message
        ),
      [
        message,
      ]
    );

  useEffect(() => {
    if (
      !isOpen
    ) {
      return;
    }

    setReason(
      ""
    );

    setDetails(
      ""
    );

    setError(
      ""
    );

    setSubmitted(
      false
    );

    setSubmitting(
      false
    );
  }, [
    isOpen,
    message?.id,
  ]);

  useEffect(() => {
    if (
      !isOpen
    ) {
      return;
    }

    const handleKeyDown =
      (
        event
      ) => {
        if (
          event.key ===
          "Escape" &&
          !submitting
        ) {
          onClose?.();
        }
      };

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () =>
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
  }, [
    isOpen,
    onClose,
    submitting,
  ]);

  const submitReport =
    async () => {
      if (
        !message?.id ||
        !reason ||
        submitting
      ) {
        return;
      }

      try {
        setSubmitting(
          true
        );

        setError(
          ""
        );

        await reportChatMessage({
          messageId:
            message.id,

          reason,

          details:
            details.trim(),
        });

        setSubmitted(
          true
        );
      } catch (
        submitError
      ) {
        console.error(
          "Report message error:",
          submitError
        );

        setError(
          submitError?.message ||
            "Unable to submit report."
        );
      } finally {
        setSubmitting(
          false
        );
      }
    };

  if (
    !isOpen
  ) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
            event.currentTarget &&
          !submitting
        ) {
          onClose?.();
        }
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="text-base font-bold text-gray-900">
              Report message
            </div>

            <div className="mt-0.5 text-xs text-gray-400">
              Message from {senderName}
            </div>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              submitting
            }
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close report dialog"
          >
            ✕
          </button>
        </div>

        {submitted ? (
          <div className="px-6 py-10 text-center">
            <div className="text-4xl">
              ✓
            </div>

            <div className="mt-3 text-base font-semibold text-gray-900">
              Report submitted
            </div>

            <div className="mt-2 text-sm text-gray-500">
              The message was sent for review.
            </div>

            <button
              type="button"
              onClick={
                onClose
              }
              className="mt-6 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="text-sm font-semibold text-gray-800">
                Why are you reporting this message?
              </div>

              <div className="mt-3 space-y-2">
                {REPORT_REASONS.map(
                  (
                    item
                  ) => (
                    <label
                      key={
                        item.value
                      }
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                        reason ===
                        item.value
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="message-report-reason"
                        value={
                          item.value
                        }
                        checked={
                          reason ===
                          item.value
                        }
                        onChange={() =>
                          setReason(
                            item.value
                          )
                        }
                        className="mt-1"
                      />

                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {
                            item.label
                          }
                        </div>

                        <div className="mt-0.5 text-xs leading-relaxed text-gray-500">
                          {
                            item.description
                          }
                        </div>
                      </div>
                    </label>
                  )
                )}
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="message-report-details"
                    className="text-sm font-semibold text-gray-800"
                  >
                    Additional details
                  </label>

                  <span className="text-[11px] text-gray-400">
                    {details.length}/1000
                  </span>
                </div>

                <textarea
                  id="message-report-details"
                  value={
                    details
                  }
                  onChange={(
                    event
                  ) =>
                    setDetails(
                      event.target.value.slice(
                        0,
                        1000
                      )
                    )
                  }
                  rows={
                    4
                  }
                  placeholder="Optional: add context that may help the review."
                  className="mt-2 w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {error && (
                <div className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-5 py-4">
              <button
                type="button"
                onClick={
                  onClose
                }
                disabled={
                  submitting
                }
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  submitReport
                }
                disabled={
                  !reason ||
                  submitting
                }
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? "Submitting..."
                  : "Submit report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
