import React, {
  useEffect,
  useState,
} from "react";

import {
  Send,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

export default function UserSupportTicket({
  supabase,
  user,
}) {
  const [
    ticket,
    setTicket,
  ] = useState(null);

  const [
    messages,
    setMessages,
  ] = useState([]);

  const [
    replyText,
    setReplyText,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    sending,
    setSending,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState(null);

  /* =========================================================
     LOAD USER'S LATEST TICKET
  ========================================================= */

  useEffect(() => {
    if (
      user?.id &&
      supabase
    ) {
      fetchUserTicket();
    }
  }, [
    user?.id,
    supabase,
  ]);

  /* =========================================================
     LOAD MESSAGES WHEN TICKET CHANGES
  ========================================================= */

  useEffect(() => {
    if (
      ticket?.id
    ) {
      fetchMessages(
        ticket.id
      );
    } else {
      setMessages(
        []
      );
    }
  }, [
    ticket?.id,
  ]);

  /* =========================================================
     FETCH LATEST USER TICKET
  ========================================================= */

  const fetchUserTicket =
    async () => {
      if (
        !user?.id ||
        !supabase
      ) {
        return;
      }

      try {
        setLoading(
          true
        );

        setError(
          null
        );

        /*
          IMPORTANT:
          maybeSingle() returns null when no row exists.

          This prevents the 406 error that .single()
          can produce for users with no support ticket yet.
        */
        const {
          data,
          error,
        } =
          await supabase
            .from(
              "support_tickets"
            )
            .select(
              "*"
            )
            .eq(
              "user_id",
              user.id
            )
            .order(
              "created_at",
              {
                ascending:
                  false,
              }
            )
            .limit(
              1
            )
            .maybeSingle();

        if (
          error
        ) {
          throw error;
        }

        setTicket(
          data ||
            null
        );
      } catch (err) {
        console.error(
          "Error fetching user ticket:",
          err
        );

        setError(
          err?.message ||
            "Unable to load support ticket."
        );

        setTicket(
          null
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  /* =========================================================
     FETCH TICKET MESSAGES
  ========================================================= */

  const fetchMessages =
    async (
      ticketId
    ) => {
      if (
        !ticketId ||
        !supabase
      ) {
        return;
      }

      try {
        setError(
          null
        );

        const {
          data,
          error,
        } =
          await supabase
            .from(
              "ticket_messages"
            )
            .select(
              "*"
            )
            .eq(
              "ticket_id",
              ticketId
            )
            .order(
              "created_at",
              {
                ascending:
                  true,
              }
            );

        if (
          error
        ) {
          throw error;
        }

        setMessages(
          data ||
            []
        );
      } catch (err) {
        console.error(
          "Error fetching messages:",
          err
        );

        setError(
          err?.message ||
            "Unable to load ticket messages."
        );
      }
    };

  /* =========================================================
     REFRESH
  ========================================================= */

  const handleRefresh =
    async () => {
      if (
        !ticket?.id
      ) {
        await fetchUserTicket();
        return;
      }

      setError(
        null
      );

      await Promise.all([
        fetchUserTicket(),
        fetchMessages(
          ticket.id
        ),
      ]);
    };

  /* =========================================================
     SEND USER REPLY
  ========================================================= */

  const handleSendMessage =
    async (
      event
    ) => {
      event.preventDefault();

      const cleanReply =
        replyText.trim();

      if (
        !cleanReply ||
        !ticket?.id ||
        sending
      ) {
        return;
      }

      try {
        setSending(
          true
        );

        setError(
          null
        );

        const newMessage = {
          ticket_id:
            ticket.id,

          sender_type:
            "user",

          message:
            cleanReply,
        };

        const {
          data,
          error,
        } =
          await supabase
            .from(
              "ticket_messages"
            )
            .insert(
              [
                newMessage,
              ]
            )
            .select()
            .single();

        if (
          error
        ) {
          throw error;
        }

        /*
          Re-open/update ticket so Admin knows
          there is a fresh user reply.
        */
        const {
          error:
            ticketUpdateError,
        } =
          await supabase
            .from(
              "support_tickets"
            )
            .update({
              updated_at:
                new Date().toISOString(),

              status:
                "open",
            })
            .eq(
              "id",
              ticket.id
            );

        if (
          ticketUpdateError
        ) {
          console.error(
            "Ticket status update error:",
            ticketUpdateError
          );
        }

        setMessages(
          (
            previous
          ) => [
            ...previous,
            data,
          ]
        );

        setTicket(
          (
            previous
          ) =>
            previous
              ? {
                  ...previous,

                  status:
                    "open",

                  updated_at:
                    new Date().toISOString(),
                }
              : previous
        );

        setReplyText(
          ""
        );
      } catch (err) {
        console.error(
          "Send support message error:",
          err
        );

        setError(
          "Failed to send message: " +
            (
              err?.message ||
              "Unknown error"
            )
        );
      } finally {
        setSending(
          false
        );
      }
    };

  /* =========================================================
     LOADING
  ========================================================= */

  if (
    loading
  ) {
    return (
      <div className="p-8 text-center text-gray-400 text-xs">
        Nilo-load ang iyong ticket...
      </div>
    );
  }

  /* =========================================================
     NO TICKET
  ========================================================= */

  if (
    !ticket
  ) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-900 p-6">

        <div className="max-w-sm text-center">

          <div className="text-3xl mb-3">
            🎫
          </div>

          <div className="text-sm font-semibold text-gray-200">
            Wala ka pang aktibong support ticket.
          </div>

          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            Kapag mayroon kang support request, lalabas dito ang conversation mo with Admin Support.
          </p>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/30 p-3 text-left text-xs text-red-300">

              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />

              <span>
                {
                  error
                }
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={
              fetchUserTicket
            }
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-300 transition hover:bg-gray-700"
          >
            <RefreshCw className="w-4 h-4" />

            Refresh
          </button>
        </div>
      </div>
    );
  }

  /* =========================================================
     TICKET UI
  ========================================================= */

  return (
    <div className="flex flex-col h-full w-full bg-gray-900 text-gray-100 rounded-xl border border-gray-800 overflow-hidden shadow-xl">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="p-3 sm:p-4 bg-gray-800 border-b border-gray-700 flex justify-between items-center shrink-0">

        <div className="min-w-0 pr-2">

          <h2 className="font-bold text-sm sm:text-base truncate">
            {
              ticket.subject
            }
          </h2>

          <p className="text-[11px] text-gray-400">
            Status:{" "}

            <span className="text-indigo-400 font-bold uppercase">
              {
                ticket.status
              }
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={
            handleRefresh
          }
          className="p-2 hover:bg-gray-700 rounded-lg transition shrink-0 cursor-pointer"
          aria-label="Refresh support ticket"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* =====================================================
          ERROR
      ===================================================== */}

      {error && (
        <div className="p-2.5 bg-red-900/50 text-red-300 text-xs flex items-center gap-2 shrink-0">

          <AlertCircle className="w-4 h-4 shrink-0" />

          <span className="break-words">
            {
              error
            }
          </span>
        </div>
      )}

      {/* =====================================================
          MESSAGE HISTORY
      ===================================================== */}

      <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-4 bg-gray-950">

        {/* ORIGINAL SUBMISSION */}

        <div className="flex flex-col max-w-[90%] sm:max-w-[85%] ml-auto items-end">

          <span className="text-[10px] text-gray-400 mb-1">
            Ikaw (Orihinal na Submission)
          </span>

          <div className="p-3 rounded-xl rounded-tr-none bg-indigo-600/50 border border-indigo-500/30 text-xs sm:text-sm whitespace-pre-wrap break-words [word-break:break-word] w-full">
            {
              ticket.message
            }
          </div>
        </div>

        {/* REPLIES */}

        {messages.map(
          (
            msg
          ) => {
            const isUser =
              msg.sender_type ===
              "user";

            return (
              <div
                key={
                  msg.id
                }
                className={`flex flex-col max-w-[90%] sm:max-w-[85%] ${
                  isUser
                    ? "ml-auto items-end"
                    : "mr-auto items-start"
                }`}
              >

                <span className="text-[10px] text-gray-400 mb-1">
                  {isUser
                    ? "Ikaw"
                    : "Admin Support"}

                  {" • "}

                  {msg.created_at
                    ? new Date(
                        msg.created_at
                      ).toLocaleTimeString(
                        [],
                        {
                          hour:
                            "2-digit",

                          minute:
                            "2-digit",
                        }
                      )
                    : ""}
                </span>

                <div
                  className={`p-3 rounded-xl text-xs sm:text-sm whitespace-pre-wrap break-words [word-break:break-word] w-full ${
                    isUser
                      ? "bg-indigo-600 text-white rounded-tr-none"
                      : "bg-gray-800 border border-gray-700 text-gray-200 rounded-tl-none"
                  }`}
                >
                  {
                    msg.message
                  }
                </div>
              </div>
            );
          }
        )}
      </div>

      {/* =====================================================
          REPLY BOX
      ===================================================== */}

      <form
        onSubmit={
          handleSendMessage
        }
        className="p-3 sm:p-4 bg-gray-800 border-t border-gray-700 flex gap-2 shrink-0"
      >

        <input
          type="text"
          value={
            replyText
          }
          onChange={(
            event
          ) =>
            setReplyText(
              event.target.value
            )
          }
          placeholder="Mag-reply sa admin..."
          disabled={
            sending
          }
          className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-indigo-500 text-white disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={
            sending ||
            !replyText.trim()
          }
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-2 transition cursor-pointer shrink-0 text-xs font-bold"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />

          <span className="hidden sm:inline">
            {sending
              ? "Sending..."
              : "Send"}
          </span>
        </button>
      </form>
    </div>
  );
}