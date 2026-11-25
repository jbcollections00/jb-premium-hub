/* =========================================================
   JB PREMIUM HUB SERVICE WORKER
   PHASE 5F-1

   Purpose:
   - notification display support
   - notification click navigation
   - NO fetch interception
   - NO Supabase REST caching
   - NO Workbox precache/runtime warnings
========================================================= */

const VERSION =
  "phase5f1-v1";

self.addEventListener(
  "install",
  (
    event
  ) => {
    event.waitUntil(
      self.skipWaiting()
    );
  }
);

self.addEventListener(
  "activate",
  (
    event
  ) => {
    event.waitUntil(
      Promise.all([
        self.clients.claim(),

        caches
          .keys()
          .then(
            (
              keys
            ) =>
              Promise.all(
                keys
                  .filter(
                    (
                      key
                    ) => {
                      const value =
                        key.toLowerCase();

                      return (
                        value.includes(
                          "workbox"
                        ) ||
                        value.includes(
                          "precache"
                        ) ||
                        value.includes(
                          "runtime"
                        )
                      );
                    }
                  )
                  .map(
                    (
                      key
                    ) =>
                      caches.delete(
                        key
                      )
                  )
              )
          ),
      ])
    );
  }
);

/*
  Intentionally no "fetch" event listener.

  Supabase:
    /rest/v1/*
    /auth/v1/*
    /storage/v1/*
    /realtime/*
    /functions/v1/*

  will go directly to the network instead of Workbox routing.
*/

self.addEventListener(
  "message",
  (
    event
  ) => {
    const payload =
      event.data ||
      {};

    if (
      payload.type ===
      "SKIP_WAITING"
    ) {
      self.skipWaiting();

      return;
    }

    if (
      payload.type ===
      "SHOW_NOTIFICATION"
    ) {
      const title =
        payload.title ||
        "JB Premium Hub";

      const options = {
        body:
          payload.body ||
          "",

        icon:
          payload.icon ||
          "/android-chrome-192x192.png",

        badge:
          payload.badge ||
          "/favicon-32x32.png",

        tag:
          payload.tag ||
          undefined,

        renotify:
          Boolean(
            payload.renotify
          ),

        data: {
          url:
            payload.url ||
            "/chat",

          ...(payload.data ||
            {}),
        },
      };

      event.waitUntil(
        self.registration
          .showNotification(
            title,
            options
          )
      );
    }
  }
);

self.addEventListener(
  "notificationclick",
  (
    event
  ) => {
    event.notification.close();

    const targetUrl =
      event.notification
        ?.data
        ?.url ||
      "/chat";

    event.waitUntil(
      self.clients
        .matchAll({
          type:
            "window",

          includeUncontrolled:
            true,
        })
        .then(
          async (
            clients
          ) => {
            for (
              const client of
              clients
            ) {
              try {
                const clientUrl =
                  new URL(
                    client.url
                  );

                if (
                  clientUrl.origin ===
                  self.location.origin
                ) {
                  await client.focus();

                  if (
                    "navigate" in
                    client
                  ) {
                    await client.navigate(
                      targetUrl
                    );
                  }

                  return;
                }
              } catch {
                // Continue to next client.
              }
            }

            if (
              self.clients
                .openWindow
            ) {
              await self.clients.openWindow(
                targetUrl
              );
            }
          }
        )
    );
  }
);

/*
  Reserved for future push delivery.
  If server-side push is added later, this worker can receive
  payloads without introducing request caching.
*/
self.addEventListener(
  "push",
  (
    event
  ) => {
    if (
      !event.data
    ) {
      return;
    }

    let payload =
      {};

    try {
      payload =
        event.data.json();
    } catch {
      payload = {
        body:
          event.data.text(),
      };
    }

    const title =
      payload.title ||
      "JB Premium Hub";

    event.waitUntil(
      self.registration
        .showNotification(
          title,
          {
            body:
              payload.body ||
              "",

            icon:
              payload.icon ||
              "/android-chrome-192x192.png",

            badge:
              payload.badge ||
              "/favicon-32x32.png",

            tag:
              payload.tag ||
              undefined,

            data: {
              url:
                payload.url ||
                "/chat",

              ...(payload.data ||
                {}),
            },
          }
        )
    );
  }
);

console.info(
  `[JB Premium Hub SW] ${VERSION}`
);
