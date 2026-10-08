/* =========================================================
   APP SERVICE WORKER MANAGER
========================================================= */

const APP_SW_PATH =
  "/chat-sw.js";

function isLocalDevHost() {
  if (
    typeof window ===
    "undefined"
  ) {
    return false;
  }

  return (
    window.location.hostname ===
      "localhost" ||
    window.location.hostname ===
      "127.0.0.1"
  );
}

function isOurWorker(
  registration
) {
  const urls = [
    registration?.active
      ?.scriptURL,
    registration?.waiting
      ?.scriptURL,
    registration?.installing
      ?.scriptURL,
  ].filter(
    Boolean
  );

  return urls.some(
    (
      url
    ) =>
      url.endsWith(
        APP_SW_PATH
      )
  );
}

async function removeLegacyWorkboxCaches() {
  if (
    typeof caches ===
    "undefined"
  ) {
    return;
  }

  try {
    const keys =
      await caches.keys();

    const legacyKeys =
      keys.filter(
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
      );

    await Promise.all(
      legacyKeys.map(
        (
          key
        ) =>
          caches.delete(
            key
          )
      )
    );
  } catch (
    error
  ) {
    console.warn(
      "Legacy service worker cache cleanup failed:",
      error
    );
  }
}

async function unregisterLegacyWorkers() {
  if (
    !(
      "serviceWorker" in
      navigator
    )
  ) {
    return;
  }

  try {
    const registrations =
      await navigator
        .serviceWorker
        .getRegistrations();

    for (
      const registration of
      registrations
    ) {
      if (
        isOurWorker(
          registration
        )
      ) {
        continue;
      }

      const scriptUrls = [
        registration?.active
          ?.scriptURL,
        registration?.waiting
          ?.scriptURL,
        registration?.installing
          ?.scriptURL,
      ].filter(
        Boolean
      );

      const looksLegacy =
        scriptUrls.some(
          (
            url
          ) => {
            const value =
              url.toLowerCase();

            return (
              value.includes(
                "workbox"
              ) ||
              value.endsWith(
                "/sw.js"
              ) ||
              value.endsWith(
                "/service-worker.js"
              )
            );
          }
        );

      if (
        looksLegacy
      ) {
        await registration.unregister();
      }
    }
  } catch (
    error
  ) {
    console.warn(
      "Legacy service worker unregister failed:",
      error
    );
  }
}

export async function registerAppServiceWorker() {
  if (
    typeof window ===
      "undefined" ||
    !(
      "serviceWorker" in
      navigator
    )
  ) {
    return null;
  }

  /*
    Vite development should not be controlled by a service
    worker. This prevents stale cached JS/CSS while coding.
  */
  if (
    import.meta.env.DEV ||
    isLocalDevHost()
  ) {
    await unregisterLegacyWorkers();
    await removeLegacyWorkboxCaches();

    return null;
  }

  try {
    await unregisterLegacyWorkers();
    await removeLegacyWorkboxCaches();

    const registration =
      await navigator
        .serviceWorker
        .register(
          APP_SW_PATH,
          {
            scope:
              "/",
            updateViaCache:
              "none",
          }
        );

    try {
      await registration.update();
    } catch {
      // An update check failure should not break the app.
    }

    return registration;
  } catch (
    error
  ) {
    console.error(
      "Service worker registration failed:",
      error
    );

    return null;
  }
}

export async function getAppServiceWorkerRegistration() {
  if (
    !(
      "serviceWorker" in
      navigator
    )
  ) {
    return null;
  }

  try {
    const registration =
      await navigator
        .serviceWorker
        .getRegistration(
          "/"
        );

    return registration ||
      null;
  } catch (
    error
  ) {
    console.error(
      "Get service worker registration failed:",
      error
    );

    return null;
  }
}
