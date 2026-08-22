(function initAfterMeetCapture() {
  function clean(value) {
    const raw = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!raw || !/&/.test(raw)) return raw;
    const textarea = document.createElement("textarea");
    textarea.innerHTML = raw;
    return textarea.value.replace(/\s+/g, " ").trim();
  }

  const PERSONAL_EMAIL_DOMAINS = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com",
    "live.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com", "aol.com",
  ]);

  function emailDomain(email) {
    return clean(email).split("@")[1]?.toLowerCase() || "";
  }

  function guessCompanyDomain(company) {
    const stripped = company.replace(/\([^)]*\)/g, " ").replace(/\b(?:formerly|previously)\b.+/i, "").trim();
    const lowered = stripped.toLowerCase();
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(lowered)) return lowered;

    const slug = lowered.replace(/[^a-z0-9]+/g, "").slice(0, 48);
    const words = lowered.split(/\s+/).filter((word) => word.length > 2);
    const candidates = [
      slug ? `${slug}.com` : "",
      words.length >= 2 ? `${words.slice(0, 2).join("")}.com` : "",
      words[0] ? `${words[0]}.com` : "",
    ].filter(Boolean);

    return candidates[0] || "";
  }

  function isLikelyPersonalEmail(email) {
    return PERSONAL_EMAIL_DOMAINS.has(emailDomain(email));
  }

  function isLikelyWorkEmail(email, company) {
    const normalized = clean(email).toLowerCase();
    if (!normalized.includes("@")) return false;
    const domain = emailDomain(normalized);
    if (domainMatchesCompany(domain, company)) return true;
    const companyDomain = guessCompanyDomain(company);
    if (companyDomain && (domain === companyDomain || domain.endsWith(`.${companyDomain}`))) return true;
    return !isLikelyPersonalEmail(normalized);
  }

  function domainMatchesCompany(domain, company) {
    if (!domain || !company) return false;
    const words = company.replace(/\([^)]*\)/g, " ").split(/\s+/).filter((word) => word.length > 2);
    const candidates = [
      guessCompanyDomain(company),
      words.length >= 2 ? `${words.slice(0, 2).join("").toLowerCase().replace(/[^a-z0-9]/g, "")}.com` : "",
      ...words.map((word) => `${word.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`),
    ].filter(Boolean);
    const stem = domain.replace(/\.[^.]+$/, "");
    return candidates.some((candidate) => {
      const candidateStem = candidate.replace(/\.[^.]+$/, "");
      return domain === candidate || domain.endsWith(`.${candidate}`) || candidateStem.includes(stem) || stem.includes(candidateStem);
    });
  }

  function mergeLinkedInContactEmail(target, email, company) {
    const normalized = clean(email).toLowerCase();
    if (!normalized) return target;

    const domain = emailDomain(normalized);
    if (domainMatchesCompany(domain, company) || (isLikelyWorkEmail(normalized, company) && !isLikelyPersonalEmail(normalized))) {
      if (!target.workEmail) target.workEmail = normalized;
    } else if (!target.personalEmail) {
      target.personalEmail = normalized;
    } else if (!target.workEmail) {
      target.workEmail = normalized;
    }

    target.email = target.workEmail || target.personalEmail || normalized;
    return target;
  }

  function mergeCapturedEmail(target, email, company) {
    const normalized = clean(email).toLowerCase();
    if (!normalized) return target;
    if (isLikelyWorkEmail(normalized, company)) {
      if (!target.workEmail) target.workEmail = normalized;
    } else if (!target.personalEmail) {
      target.personalEmail = normalized;
    } else if (!target.workEmail && isLikelyWorkEmail(normalized, company)) {
      target.workEmail = normalized;
    }
    target.email = target.workEmail || target.personalEmail || normalized;
    return target;
  }

  function normalizeProfileName(value) {
    return clean(value)
      .replace(/\s*\|\s*LinkedIn\s*$/i, "")
      .replace(/\s*[-–-]\s*LinkedIn\s*$/i, "")
      .replace(/\s*·\s*LinkedIn\s*$/i, "");
  }

  function readProfileFullName() {
    const h1 = normalizeProfileName(document.querySelector("h1")?.textContent);
    const ogTitle = normalizeProfileName(readMeta("og:title"));
    const titleName = normalizeProfileName(document.title);
    return h1
      || ogTitle.split(/\s+[-–-]\s+/)[0]
      || titleName.split(/\s+[-–-]\s+/)[0]
      || titleName.split("|")[0]
      || "";
  }

  function normalizeUrl(value) {
    const trimmed = clean(value);
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed.split("?")[0].replace(/\/+$/, "");
    return `https://${trimmed.replace(/^\/\//, "")}`;
  }

  function stripEmploymentSuffix(value) {
    return clean(value.split(" · ")[0]?.split(" | ")[0]);
  }

  function isValidExperienceRole(value) {
    const role = clean(value);
    if (!role || role.length > 80) return false;
    if (/^(uk global talent|open to work|hiring|verified|premium|top voice)$/i.test(role)) return false;
    if (/manage, lead|responsible for|i manage|^[•-]/i.test(role)) return false;
    return true;
  }

  function isValidExperienceCompany(value) {
    const company = clean(value);
    if (!company || company.length > 80) return false;
    if (/manage, lead|responsible for|i manage|^[•-]/i.test(company)) return false;
    return true;
  }

  function sanitizeExperience(input) {
    return {
      role: isValidExperienceRole(input.role) ? clean(input.role) : "",
      company: isValidExperienceCompany(input.company) ? stripEmploymentSuffix(input.company) : "",
    };
  }

  function isJunkExperienceLine(line) {
    const value = clean(line);
    if (!value || value.length > 100) return true;
    if (/^(uk global talent|open to work|hiring|verified|premium|top voice|show all)$/i.test(value)) return true;
    if (/^\d{4}\s*[–-]\s*(present|\d{4})/i.test(value)) return true;
    if (/manage, lead|responsible for|i manage/i.test(value)) return true;
    if (/^(full-time|part-time|contract|self-employed|internship|freelance)$/i.test(value)) return true;
    return false;
  }

  function parseExperienceSectionText(sectionText) {
    const lines = sectionText.split("\n").map(clean).filter(Boolean);
    const experienceIndex = lines.findIndex((line) => /^experience$/i.test(line));
    const startIndex = experienceIndex >= 0 ? experienceIndex + 1 : 0;
    const role = lines.slice(startIndex).find((line) => !isJunkExperienceLine(line) && line.length <= 80) || "";
    if (!role) return { role: "", company: "" };

    const roleIndex = lines.indexOf(role, startIndex);
    const companyLine = lines.slice(roleIndex + 1).find((line) => {
      if (isJunkExperienceLine(line)) return false;
      return line.includes("·") || /full-time|part-time|contract|self-employed|internship|freelance/i.test(line);
    }) || "";

    return sanitizeExperience({
      role,
      company: companyLine ? stripEmploymentSuffix(companyLine) : "",
    });
  }

  function findExperienceSection() {
    const anchor = document.getElementById("experience");
    if (!anchor) return null;
    return anchor.closest("section")
      || anchor.closest(".artdeco-card")
      || anchor.parentElement;
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function scrollContainerFor(node) {
    return node?.closest("main")
      || document.querySelector("main.scaffold-layout__main, .scaffold-layout__main")
      || document.documentElement;
  }

  function scrollNodeIntoView(node) {
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: "instant" });
    const container = scrollContainerFor(node);
    if (container && container !== document.documentElement && container !== document.body) {
      const rect = node.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      container.scrollTop += rect.top - containerRect.top - container.clientHeight / 2;
    }
    window.dispatchEvent(new Event("scroll", { bubbles: true }));
  }

  function findExperienceAnchor() {
    return document.getElementById("experience")
      || document.querySelector('[data-view-name*="experience" i], [componentkey*="Experience"]');
  }

  function hasCompleteExperience(input) {
    return isValidExperienceRole(input.role) && isValidExperienceCompany(input.company);
  }

  async function revealExperienceSection() {
    let anchor = findExperienceAnchor();

    for (let step = 0; !anchor && step < 10; step += 1) {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.75), behavior: "instant" });
      const container = scrollContainerFor(document.body);
      if (container && container.scrollBy) {
        container.scrollBy({ top: Math.round(window.innerHeight * 0.75), behavior: "instant" });
      }
      await sleep(280);
      anchor = findExperienceAnchor();
    }

    if (!anchor) {
      return sanitizeExperience(parseExperienceSectionText(document.body?.innerText ?? ""));
    }

    for (let attempt = 0; attempt < 16; attempt += 1) {
      scrollNodeIntoView(anchor);
      const section = findExperienceSection();
      const captured = captureExperienceFromSection(section);
      if (hasCompleteExperience(captured)) return captured;

      const showMore = section?.querySelector(
        'a[href*="details/experience"], button[aria-label*="experience" i], .pvs-list__footer-wrapper a',
      );
      showMore?.click?.();

      await sleep(320);
    }

    const section = findExperienceSection();
    const captured = captureExperienceFromSection(section);
    if (captured.role || captured.company) return captured;

    return sanitizeExperience(parseExperienceSectionText(document.body?.innerText ?? ""));
  }

  function captureExperienceFromSection(section) {
    if (!section) return { role: "", company: "" };

    const entries = section.querySelectorAll(
      "li.pvs-list__paged-list-item, li.artdeco-list__item, [data-view-name=\"profile-component-entity\"]",
    );
    const firstEntry = entries[0];
    if (firstEntry) {
      const hiddenSpans = [...firstEntry.querySelectorAll('span[aria-hidden="true"]')]
        .map((node) => clean(node.textContent))
        .filter(Boolean);

      if (hiddenSpans.length >= 2) {
        const parsed = sanitizeExperience({
          role: hiddenSpans[0],
          company: stripEmploymentSuffix(hiddenSpans[1]),
        });
        if (parsed.role && parsed.company) return parsed;
      }

      const role = clean(
        firstEntry.querySelector('.t-bold span[aria-hidden="true"]')?.textContent
        || firstEntry.querySelector(".mr1.hoverable-link-text span")?.textContent
        || firstEntry.querySelector(".t-bold")?.textContent,
      );
      const companyLine = clean(
        firstEntry.querySelector('.t-14.t-normal span[aria-hidden="true"]')?.textContent
        || firstEntry.querySelector(".t-14.t-normal")?.textContent,
      );
      const parsed = sanitizeExperience({
        role,
        company: stripEmploymentSuffix(companyLine),
      });
      if (parsed.role && parsed.company) return parsed;
    }

    return parseExperienceSectionText(section.innerText || "");
  }

  function normalizePhone(value) {
    return window.aftermeetSanitizePhoneNumber?.(
      value,
      window.aftermeetReadLinkedInProfileLocation?.() || "",
    ) || "";
  }

  function sanitizePhoneNumber(value) {
    return normalizePhone(value);
  }

  function isEmailLabel(line) {
    return /^(email|e-mail|email address)$/i.test(line);
  }

  function isPhoneLabel(line) {
    return /^(phone|mobile|cell|mobile phone)$/i.test(line);
  }

  function parseContactInfoFromText(pageText) {
    const lines = pageText.split("\n").map(clean).filter(Boolean);
    let email = "";
    let phone = "";

    for (const line of lines) {
      if (!email) {
        const match = line.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
        if (match) email = match[0].toLowerCase();
      }
    }

    const emailIndex = lines.findIndex((line) => isEmailLabel(line));
    if (emailIndex >= 0 && !email) {
      for (const line of lines.slice(emailIndex + 1, emailIndex + 6)) {
        if (isPhoneLabel(line) || isEmailLabel(line)) break;
        const match = line.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
        if (match) {
          email = match[0].toLowerCase();
          break;
        }
      }
    }

    const phoneIndex = lines.findIndex((line) => isPhoneLabel(line));
    if (phoneIndex >= 0) {
      for (const line of lines.slice(phoneIndex + 1, phoneIndex + 6)) {
        if (isEmailLabel(line) || isPhoneLabel(line)) continue;
        if (/^\d{4}\s*[–-]\s*(present|\d{4})/i.test(line)) continue;
        if (/^(19|20)\d{2}$/.test(line)) continue;
        const normalized = sanitizePhoneNumber(line);
        if (normalized) {
          phone = normalized;
          break;
        }
      }
    }

    if (!phone) {
      const match = pageText.match(/(\+\d[\d\s().-]{7,}\d)/);
      if (match) phone = sanitizePhoneNumber(match[1]);
    }

    return { email, phone };
  }

  function extractLinksFrom(root) {
    let email = "";
    let phone = "";
    root.querySelectorAll("a[href^='mailto:'], a[href^='tel:']").forEach((node) => {
      const href = node.getAttribute("href") || "";
      if (!email && href.startsWith("mailto:")) email = clean(href.replace(/^mailto:/i, "").split("?")[0]).toLowerCase();
      if (!phone && href.startsWith("tel:")) phone = normalizePhone(href.replace(/^tel:/i, "").split("?")[0]);
    });
    return { email, phone };
  }

  function isContactPayloadText(text) {
    return /emailAddress|phoneNumbers|"number"\s*:|mailto:|tel:/i.test(String(text));
  }

  function isContactRequestUrl(url) {
    return /contact-info|ContactInfo|profileContactInfo|overlay\/contact-info|voyagerIdentityDashProfileContactInfo|identityDashProfileContactInfo|rsc-action.*ContactInfo|graphql.*ContactInfo/i.test(String(url));
  }

  function parseContactFromResponseText(text) {
    if (typeof window.aftermeetParseContactFromStream === "function") {
      return window.aftermeetParseContactFromStream(text);
    }
    return parseContactInfoFromText(text);
  }

  function mergeContactResult(target, source, company = "", fromLinkedIn = false) {
    const email = clean(source.email).toLowerCase();
    const phone = sanitizePhoneNumber(source.phone);
    const companyHint = company || target.company || "";
    if (email) {
      if (fromLinkedIn) mergeLinkedInContactEmail(target, email, companyHint);
      else mergeCapturedEmail(target, email, companyHint);
    }
    if (phone) target.phone = phone;
    return target;
  }

  function installContactNetworkTap() {
    const captured = [];
    const originalFetch = window.fetch;
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const xhrUrls = new WeakMap();

    window.fetch = async function aftermeetContactFetch(input, init) {
      const response = await originalFetch.call(this, input, init);
      const url = typeof input === "string" ? input : input?.url || "";
      try {
        const text = await response.clone().text();
        if (isContactRequestUrl(url) || ((/graphql|voyager|flagship-web|rsc-action/i.test(url)) && isContactPayloadText(text))) {
          captured.push(text);
        }
      } catch {
        /* ignore unreadable clone */
      }
      return response;
    };

    XMLHttpRequest.prototype.open = function aftermeetContactOpen(method, url, ...rest) {
      xhrUrls.set(this, String(url));
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function aftermeetContactSend(...args) {
      this.addEventListener("load", function aftermeetContactLoad() {
        const url = xhrUrls.get(this) || "";
        if ((isContactRequestUrl(url) || /graphql|voyager|flagship-web|rsc-action/i.test(url))
          && typeof this.responseText === "string"
          && isContactPayloadText(this.responseText)) {
          captured.push(this.responseText);
        }
      });
      return originalSend.apply(this, args);
    };

    return {
      readCaptured() {
        const result = { email: "", phone: "" };
        for (const text of captured) {
          mergeContactResult(result, parseContactFromResponseText(text), "", true);
        }
        return result;
      },
      restore() {
        window.fetch = originalFetch;
        XMLHttpRequest.prototype.open = originalOpen;
        XMLHttpRequest.prototype.send = originalSend;
      },
    };
  }

  function findContactInfoTrigger() {
    const selectors = [
      "#top-card-text-details-contact-info",
      "a[href*='/overlay/contact-info']",
      "a[href*='overlay/contact-info']",
      "button[aria-label*='Contact info' i]",
      "a[aria-label*='Contact info' i]",
      "[data-view-name*='contact-info' i]",
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) return node;
    }
    return [...document.querySelectorAll("a, button, span")].find((node) => /^contact info$/i.test(clean(node.textContent)))?.closest("a, button")
      || [...document.querySelectorAll("a, button")].find((node) => /^contact info$/i.test(clean(node.textContent)))
      || null;
  }

  function findContactInfoSurfaces(root = document) {
    return [...root.querySelectorAll(
      '[role="dialog"], .artdeco-modal, .artdeco-offcanvas, aside, section, .pv-contact-info, .pv-profile-section, [class*="contact-info"], [data-view-name*="contact" i]',
    )]
      .filter((node) => {
        const text = node.innerText || "";
        return /contact info|email address|phone number/i.test(text)
          || Boolean(node.querySelector('a[href^="mailto:"], a[href^="tel:"]'));
      });
  }

  function contactRequirementsMet(result, requireEmail, requirePhone) {
    const hasEmail = Boolean(result.workEmail || result.personalEmail || result.email);
    if (requireEmail && !hasEmail) return false;
    if (requirePhone && !result.phone) return false;
    return true;
  }

  function profilePath(url) {
    return normalizeUrl(String(url ?? "").split("?")[0].split("#")[0]);
  }

  async function restoreProfileUrl(originalUrl) {
    const target = profilePath(originalUrl);
    if (profilePath(window.location.href) === target) return;

    closeContactInfoModal();
    await sleep(220);
    if (profilePath(window.location.href) === target) return;

    const onContactOverlay = /contact-info|overlay/i.test(window.location.href);
    if (onContactOverlay && window.history.length > 1) {
      window.history.back();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await sleep(180);
        if (profilePath(window.location.href) === target) return;
      }
    }

    if (onContactOverlay) {
      try {
        window.history.replaceState(window.history.state, "", target);
      } catch {
        /* ignore replace failures */
      }
    }
  }

  async function scrollProfileToTop() {
    window.scrollTo({ top: 0, behavior: "instant" });
    const container = scrollContainerFor(document.body);
    if (container && container !== document.documentElement && container !== document.body) {
      container.scrollTo({ top: 0, behavior: "instant" });
    }
  }

  function scanForContactInfo(root = document) {
    for (const surface of findContactInfoSurfaces(root)) {
      const parsed = {
        ...extractLinksFrom(surface),
        ...parseContactInfoFromText(surface.innerText || ""),
      };
      if (parsed.email || parsed.phone) return parsed;
    }
    return { email: "", phone: "" };
  }

  function clickElement(node) {
    if (!node) return;
    ["pointerdown", "mousedown", "mouseup", "click"].forEach((type) => {
      node.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
  }

  async function fetchContactInfoFromHref(href) {
    if (!href) return { email: "", phone: "" };
    const url = new URL(href, window.location.origin).href;
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        accept: "text/html,application/xhtml+xml,*/*",
        "x-restli-protocol-version": "2.0.0",
      },
    });
    if (!response.ok) return { email: "", phone: "" };
    const html = await response.text();
    return {
      ...parseContactInfoFromText(html.replace(/<[^>]+>/g, "\n")),
      ...extractLinksFrom({ querySelectorAll(selector) {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return doc.querySelectorAll(selector);
      } }),
    };
  }

  function findContactInfoModal() {
    return findContactInfoSurfaces().find((node) => /contact info/i.test(node.innerText || ""))
      || findContactInfoSurfaces()[0]
      || null;
  }

  function closeContactInfoModal() {
    document.querySelector(".artdeco-modal__dismiss, button[aria-label='Dismiss']")?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
  }

  async function captureContactInfoFromModal(requirements = {}) {
    const companyHint = clean(requirements.company || "");
    const requireEmail = requirements.requireEmail !== false;
    const requirePhone = requirements.requirePhone === true;
    const emptyContact = { workEmail: "", personalEmail: "", email: "", phone: "", company: companyHint };
    const existing = scanForContactInfo();
    const resolved = { ...emptyContact };
    mergeContactResult(resolved, existing, companyHint, true);

    if (contactRequirementsMet(resolved, requireEmail, requirePhone)) {
      return resolved;
    }

    const trigger = findContactInfoTrigger();
    const profileUrl = window.location.href;
    const publicId = window.aftermeetLinkedInPublicId?.(profileUrl) || "";
    const tap = installContactNetworkTap();
    let openedContactUi = false;

    try {
      if (trigger) {
        scrollNodeIntoView(trigger);
        await sleep(120);
        clickElement(trigger);
        openedContactUi = true;
        await sleep(400);
      }

      if (publicId && typeof window.aftermeetFetchLinkedInContactInfo === "function") {
        mergeContactResult(
          resolved,
          await window.aftermeetFetchLinkedInContactInfo(publicId).catch(() => ({})),
          companyHint,
          true,
        );
      }

      if (trigger) {
        const href = trigger.getAttribute("href") || trigger.href || "";
        mergeContactResult(resolved, await fetchContactInfoFromHref(href), companyHint, true);
      }

      for (let attempt = 0; attempt < 40; attempt += 1) {
        mergeContactResult(resolved, scanForContactInfo(), companyHint, true);
        mergeContactResult(resolved, tap.readCaptured(), companyHint, true);

        if (publicId && typeof window.aftermeetFetchLinkedInContactInfo === "function" && attempt % 8 === 7) {
          mergeContactResult(
            resolved,
            await window.aftermeetFetchLinkedInContactInfo(publicId).catch(() => ({})),
            companyHint,
            true,
          );
        }

        if (contactRequirementsMet(resolved, requireEmail, requirePhone)) break;
        await sleep(200);
      }

      return resolved;
    } finally {
      tap.restore();
      closeContactInfoModal();
      if (openedContactUi && profilePath(window.location.href) !== profilePath(profileUrl)) {
        await restoreProfileUrl(profileUrl);
      }
    }
  }

  async function resolveContactDetails(publicId, seed = {}) {
    const companyHint = clean(seed.company || "");
    const resolved = {
      workEmail: "",
      personalEmail: "",
      email: "",
      phone: sanitizePhoneNumber(seed.phone),
      company: companyHint,
    };
    mergeContactResult(resolved, seed, companyHint, true);

    const modal = await captureContactInfoFromModal({
      company: companyHint,
      requireEmail: !(resolved.workEmail || resolved.personalEmail || resolved.email),
      requirePhone: false,
    });
    mergeContactResult(resolved, modal, companyHint, true);

    resolved.email = resolved.workEmail || resolved.personalEmail;
    return resolved;
  }

  function buildLinkedInCaptureContext(profile) {
    const parts = [];
    if (profile.role && profile.company) parts.push(`Current role: ${profile.role} at ${profile.company}.`);
    else if (profile.role) parts.push(`Current role: ${profile.role}.`);
    if (profile.workEmail) parts.push(`Work email visible on LinkedIn: ${profile.workEmail}.`);
    if (profile.personalEmail) parts.push(`Personal email visible on LinkedIn: ${profile.personalEmail}.`);
    else if (profile.email) parts.push(`Email visible on LinkedIn: ${profile.email}.`);
    if (profile.phone) parts.push(`Phone visible on LinkedIn: ${profile.phone}.`);
    if (profile.linkedinUrl) parts.push(`Profile: ${profile.linkedinUrl}.`);
    return parts.join(" ");
  }

  function readMeta(key) {
    const node = document.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
    return clean(node?.content || node?.getAttribute?.("content"));
  }

  function extractLinks() {
    return extractLinksFrom(document);
  }

  function captureLinkedInProfileBase() {
    const pageText = document.body?.innerText ?? "";
    const linkedinUrl = normalizeUrl(window.location.href.split("?")[0]);
    const fullName = readProfileFullName();

    const links = extractLinks();
    const contact = parseContactInfoFromText(pageText);
    const email = links.email || contact.email;
    const phone = links.phone || contact.phone;

    return {
      fullName,
      email,
      phone,
      company: "",
      role: "",
      companyWebsite: "",
      personalWebsite: "",
      linkedinUrl,
      sourceUrl: linkedinUrl,
      source: "extension",
      context: "",
    };
  }

  async function captureLinkedInProfile() {
    const publicId = window.aftermeetLinkedInPublicId?.(window.location.href) || "";
    const baseProfile = captureLinkedInProfileBase();

    let companyHint = "";
    let roleHint = "";
    let voyager = null;

    if (publicId && typeof window.aftermeetFetchLinkedInVoyager === "function") {
      try {
        voyager = await window.aftermeetFetchLinkedInVoyager(publicId);
        companyHint = sanitizeExperience({ role: voyager?.role, company: voyager?.company }).company;
        roleHint = sanitizeExperience({ role: voyager?.role, company: voyager?.company }).role;
      } catch {
        voyager = null;
      }
    }

    if (!companyHint && typeof window.aftermeetParseEmbeddedSnapshot === "function") {
      const snapshot = window.aftermeetParseEmbeddedSnapshot();
      companyHint = clean(snapshot?.company || "");
      roleHint = roleHint || clean(snapshot?.role || "");
    }

    const contact = await resolveContactDetails(publicId, {
      email: baseProfile.email,
      phone: baseProfile.phone,
      company: companyHint,
    });

    let { role, company } = { role: roleHint, company: companyHint || contact.company };

    if (!hasCompleteExperience({ role, company }) && publicId && typeof window.aftermeetFetchLinkedInExperience === "function") {
      try {
        const experience = await window.aftermeetFetchLinkedInExperience(publicId, voyager ?? {});
        role = role || experience.role;
        company = company || experience.company;
      } catch {
        /* keep voyager values if any */
      }
    }

    if (!hasCompleteExperience({ role, company })) {
      const domExperience = await revealExperienceSection();
      role = role || domExperience.role;
      company = company || domExperience.company;
    }

    const merged = {
      ...baseProfile,
      role,
      company,
      workEmail: contact.workEmail,
      personalEmail: contact.personalEmail,
      email: contact.workEmail || contact.personalEmail || baseProfile.email,
      phone: contact.phone,
    };

    if (merged.email && !(merged.workEmail || merged.personalEmail)) {
      mergeLinkedInContactEmail(merged, merged.email, company);
    }
    if (voyager?.email) mergeLinkedInContactEmail(merged, voyager.email, company);
    merged.email = merged.workEmail || merged.personalEmail;
    merged.phone = sanitizePhoneNumber(merged.phone || voyager?.phone);

    if (voyager) {
      const voyagerName = normalizeProfileName(`${clean(voyager.firstName)} ${clean(voyager.lastName)}`.trim());
      if (voyagerName) merged.fullName = voyagerName;
    }

    merged.context = buildLinkedInCaptureContext({
      role: merged.role,
      company: merged.company,
      workEmail: merged.workEmail,
      personalEmail: merged.personalEmail,
      email: merged.email,
      phone: merged.phone,
      linkedinUrl: merged.linkedinUrl,
    });
    return merged;
  }

  function captureGenericProfile() {
    const sourceUrl = normalizeUrl(window.location.href.split("?")[0]);
    const title = clean(document.title);
    const h1 = clean(document.querySelector("h1")?.textContent);
    return {
      fullName: normalizeProfileName(h1 || title.split("|")[0] || title),
      email: "",
      phone: "",
      company: "",
      role: "",
      companyWebsite: "",
      personalWebsite: "",
      linkedinUrl: /linkedin\.com\/in\//i.test(sourceUrl) ? sourceUrl : "",
      sourceUrl,
      source: "extension",
      context: "",
    };
  }

  window.aftermeetCapturePage = async function aftermeetCapturePage() {
    try {
      const profile = /linkedin\.com\/in\//i.test(window.location.href)
        ? await captureLinkedInProfile()
        : captureGenericProfile();
      if (/linkedin\.com\/in\//i.test(window.location.href)) {
        await scrollProfileToTop();
      }
      return {
        profile,
        pageText: document.body?.innerText?.slice(0, 8000) ?? "",
      };
    } catch (error) {
      if (/linkedin\.com\/in\//i.test(window.location.href)) {
        await scrollProfileToTop();
      }
      throw error;
    }
  };
})();
