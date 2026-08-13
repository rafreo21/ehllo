const baseUrlInput = document.getElementById("base-url");
const preview = document.getElementById("preview");
const status = document.getElementById("status");
const captureButton = document.getElementById("capture");
const openAfterMeetButton = document.getElementById("open-aftermeet");
const versionLabel = document.getElementById("version");

if (versionLabel) versionLabel.textContent = "v0.3.6";

function renderPreview(profile) {
  const lines = [
    profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Unknown name",
    [profile.role, profile.company].filter(Boolean).join(" · "),
    profile.workEmail ? `Work: ${profile.workEmail}` : "",
    profile.personalEmail ? `Personal: ${profile.personalEmail}` : profile.email || "",
    profile.phone,
    profile.linkedinUrl,
  ].filter(Boolean);
  preview.textContent = lines.length ? lines.join("\n") : "No profile details found on this page.";
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(["aftermeetBaseUrl"]);
  baseUrlInput.value = stored.aftermeetBaseUrl || "https://ehllo.io";
}

async function saveSettings() {
  await chrome.storage.sync.set({
    aftermeetBaseUrl: baseUrlInput.value.trim() || "https://ehllo.io",
  });
}

async function refreshFromStorage() {
  const { aftermeetLastCapture, aftermeetCaptureStatus } = await chrome.storage.local.get([
    "aftermeetLastCapture",
    "aftermeetCaptureStatus",
  ]);

  if (aftermeetLastCapture?.profile) {
    renderPreview(aftermeetLastCapture.profile);
    openAfterMeetButton.classList.remove("hidden");
    openAfterMeetButton.onclick = () => {
      if (aftermeetLastCapture.importUrl) {
        void chrome.runtime.sendMessage({
          type: "aftermeet-open-import",
          importUrl: aftermeetLastCapture.importUrl,
          active: true,
        });
      }
    };
  }

  if (aftermeetCaptureStatus?.state === "running") {
    const startedAt = aftermeetCaptureStatus.startedAt || 0;
    const stale = Date.now() - startedAt > 90_000;
    if (stale) {
      await chrome.storage.local.set({
        aftermeetCaptureStatus: {
          state: "error",
          message: "Previous capture timed out. You can capture again.",
          finishedAt: Date.now(),
        },
      });
      status.textContent = "Previous capture timed out. You can capture again.";
      captureButton.disabled = false;
      return;
    }
    status.textContent = "Capture running on LinkedIn… You can close this popup.";
    captureButton.disabled = true;
    return;
  }

  captureButton.disabled = false;

  if (aftermeetCaptureStatus?.state === "done" && aftermeetCaptureStatus.message) {
    status.textContent = aftermeetCaptureStatus.message;
    if (aftermeetCaptureStatus.profile) renderPreview(aftermeetCaptureStatus.profile);
    return;
  }

  if (aftermeetCaptureStatus?.state === "error" && aftermeetCaptureStatus.message) {
    status.textContent = aftermeetCaptureStatus.message;
  }
}

async function injectCaptureScripts(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["phone-utils.js", "linkedin-voyager.js", "capture-profile.js"],
  });
}

async function startCapture(tabId, baseUrl) {
  await chrome.storage.local.set({
    aftermeetCaptureStatus: {
      state: "running",
      startedAt: Date.now(),
    },
  });

  try {
    await chrome.tabs.sendMessage(tabId, { type: "aftermeet-capture-and-finish", baseUrl });
    return;
  } catch {
    await injectCaptureScripts(tabId);
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    func: async (aftermeetBaseUrl) => {
      const payload = await window.aftermeetCapturePage();
      return chrome.runtime.sendMessage({
        type: "aftermeet-finish-import",
        baseUrl: aftermeetBaseUrl,
        payload,
      });
    },
    args: [baseUrl],
  });
}

captureButton.addEventListener("click", async () => {
  openAfterMeetButton.classList.add("hidden");
  captureButton.disabled = true;
  status.textContent = "Reading Contact info on this profile… Stay on the LinkedIn tab.";
  await saveSettings();

  const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, "") || "https://ehllo.io";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    status.textContent = "No active tab found.";
    captureButton.disabled = false;
    return;
  }

  if (!/linkedin\.com\/in\//i.test(tab.url || "")) {
    status.textContent = "Open a LinkedIn profile page first, then capture.";
    captureButton.disabled = false;
    return;
  }

  try {
    void startCapture(tab.id, baseUrl);
    status.textContent = "Capture running… ehllo will open in a background tab when done.";
    captureButton.disabled = true;
  } catch {
    status.textContent = "Could not start capture on this tab. Remove and re-add the extension, then try again.";
    captureButton.disabled = false;
  }
});

const resetButton = document.getElementById("reset");

async function resetCaptureState() {
  await chrome.storage.local.set({
    aftermeetCaptureStatus: {
      state: "idle",
      message: "Ready to capture another profile.",
      finishedAt: Date.now(),
    },
  });
  status.textContent = "Ready to capture another profile on LinkedIn.";
  captureButton.disabled = false;
}

if (resetButton) {
  resetButton.addEventListener("click", () => {
    void resetCaptureState();
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.aftermeetCaptureStatus || changes.aftermeetLastCapture) {
    void refreshFromStorage();
  }
});

baseUrlInput.addEventListener("change", saveSettings);
void loadSettings();
void refreshFromStorage();
