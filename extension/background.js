(() => {
  const encodePayload = (profile) =>
    btoa(unescape(encodeURIComponent(JSON.stringify(profile))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const buildImportUrl = (baseUrl, profile) => {
    const target = new URL("/app/contacts/linkedin", baseUrl);
    if (profile.linkedinUrl || profile.sourceUrl) {
      target.searchParams.set("url", profile.linkedinUrl || profile.sourceUrl);
    }
    target.searchParams.set("capture", encodePayload(profile));
    target.searchParams.set("source", "extension");
    return target.toString();
  };

  const setCaptureStatus = async (status) => {
    await chrome.storage.local.set({ aftermeetCaptureStatus: status });
  };

  const enrichProfile = async (baseUrl, profile, pageText) => {
    const missingContact =
      !profile.workEmail?.trim()
      && !profile.personalEmail?.trim()
      && !profile.email?.trim()
      && !profile.phone?.trim();
    if (profile.role?.trim() && profile.company?.trim() && !missingContact) {
      return { profile, message: "Captured profile details from LinkedIn." };
    }

    try {
      const response = await fetch(`${baseUrl}/api/contacts/capture`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, pageText }),
      });
      if (!response.ok) return { profile, message: "" };
      const payload = await response.json();
      if (!payload?.profile) return { profile, message: "" };

      const merged = { ...profile };
      for (const field of ["fullName", "workEmail", "personalEmail", "email", "phone", "role", "company", "context"]) {
        const next = payload.profile[field]?.trim?.() ?? "";
        const prev = profile[field]?.trim?.() ?? "";
        if (next) merged[field] = payload.profile[field];
        else if (prev) merged[field] = profile[field];
      }
      if (!merged.fullName && (payload.profile.firstName || payload.profile.lastName)) {
        merged.fullName = [payload.profile.firstName, payload.profile.lastName].filter(Boolean).join(" ");
      }
      merged.linkedinUrl = profile.linkedinUrl || payload.profile.linkedinUrl || "";
      merged.sourceUrl = profile.sourceUrl || payload.profile.sourceUrl || "";
      merged.source = "extension";

      return {
        profile: merged,
        message: typeof payload.message === "string" ? payload.message : "Cleaned captured profile details.",
      };
    } catch {
      return { profile, message: "" };
    }
  };

  const finishImport = async ({ baseUrl, payload }) => {
    const profile = payload?.profile;
    if (!profile) {
      await setCaptureStatus({
        state: "error",
        message: "Could not read this page.",
        finishedAt: Date.now(),
      });
      return { ok: false, message: "Could not read this page." };
    }

    const enriched = await enrichProfile(baseUrl, profile, payload.pageText ?? "");
    const importUrl = buildImportUrl(baseUrl, enriched.profile);

    await chrome.storage.local.set({
      aftermeetLastCapture: {
        importUrl,
        profile: enriched.profile,
        capturedAt: Date.now(),
      },
    });

    await chrome.tabs.create({ url: importUrl, active: false });

    const parts = [];
    if (enriched.profile.workEmail || enriched.profile.personalEmail || enriched.profile.email) parts.push("email");
    if (enriched.profile.phone) parts.push("phone");
    const message = parts.length
      ? `Captured ${parts.join(" and ")}. ehllo opened in a background tab.`
      : "Profile saved. ehllo opened in a background tab.";

    await setCaptureStatus({
      state: "done",
      message,
      profile: enriched.profile,
      importUrl,
      finishedAt: Date.now(),
    });

    try {
      await chrome.action.setBadgeText({ text: "OK" });
      await chrome.action.setBadgeBackgroundColor({ color: "#163300" });
      setTimeout(() => {
        void chrome.action.setBadgeText({ text: "" });
      }, 8000);
    } catch {
      /* optional */
    }

    return { ok: true, message, profile: enriched.profile, importUrl };
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "aftermeet-finish-import") {
      finishImport(message)
        .then(sendResponse)
        .catch((error) => {
          void setCaptureStatus({
            state: "error",
            message: "Capture failed. Try again on the LinkedIn profile page.",
            finishedAt: Date.now(),
          });
          sendResponse({ ok: false, message: String(error) });
        });
      return true;
    }

    if (message?.type === "aftermeet-open-import" && message.importUrl) {
      chrome.tabs.create({ url: message.importUrl, active: Boolean(message.active) }, () => {
        sendResponse({ ok: true });
      });
      return true;
    }

    return undefined;
  });
})();
