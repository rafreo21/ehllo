import { capturedNodes, type CapturedNode } from "./captured-node.ts";
function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function stripEmploymentSuffix(value: string) {
  return clean(value.split(" · ")[0]?.split(" | ")[0]);
}

export function isValidExperienceRole(value: string) {
  const role = clean(value);
  if (!role || role.length > 80) return false;
  if (/^(uk global talent|open to work|hiring|verified|premium|top voice)$/i.test(role)) return false;
  if (/manage, lead|responsible for|i manage|^[•-]/i.test(role)) return false;
  return true;
}

export function isValidExperienceCompany(value: string) {
  const company = clean(value);
  if (!company || company.length > 80) return false;
  if (/manage, lead|responsible for|i manage|^[•-]/i.test(company)) return false;
  return true;
}

export function sanitizeExperienceRoleCompany(input: { role?: string; company?: string }) {
  const role = isValidExperienceRole(input.role ?? "") ? clean(input.role) : "";
  const company = isValidExperienceCompany(input.company ?? "") ? stripEmploymentSuffix(input.company ?? "") : "";
  return { role, company };
}

function isJunkExperienceLine(line: string) {
  const value = clean(line);
  if (!value) return true;
  if (value.length > 100) return true;
  if (/^\d+\+?\s*connections?$/i.test(value)) return true;
  if (/^(message|connect|follow|more|show all|contact info|about|activity|skills)$/i.test(value)) return true;
  if (/^(open to work|hiring|verified|premium|top voice|uk global talent)$/i.test(value)) return true;
  if (/^[A-Z][a-z]+(?:,\s*[A-Z][a-z]+){0,3},\s*[A-Z][a-z]+(?: Area)?(?:,\s*[A-Z][a-z]+)?$/.test(value)) return true;
  if (/^•/.test(value)) return true;
  if (/^(full-time|part-time|contract|self-employed|internship|freelance)$/i.test(value)) return true;
  if (/^\d{4}\s*[–-]\s*(present|\d{4})/i.test(value)) return true;
  if (/manage, lead|responsible for|i manage/i.test(value)) return true;
  return false;
}

/** Parse the first job listed under an Experience section. */
export function parseExperienceSectionText(sectionText: string) {
  const lines = sectionText.split("\n").map(clean).filter(Boolean);
  const experienceIndex = lines.findIndex((line) => /^experience$/i.test(line));
  const startIndex = experienceIndex >= 0 ? experienceIndex + 1 : 0;

  const role = lines.slice(startIndex).find((line) => !isJunkExperienceLine(line) && line.length <= 80) ?? "";
  if (!role || !isValidExperienceRole(role)) return { role: "", company: "" };

  const roleIndex = lines.indexOf(role, startIndex);
  const companyLine = lines.slice(roleIndex + 1).find((line) => {
    if (isJunkExperienceLine(line)) return false;
    return line.includes("·") || /full-time|part-time|contract|self-employed|internship|freelance/i.test(line);
  }) ?? "";

  return sanitizeExperienceRoleCompany({
    role,
    company: companyLine ? stripEmploymentSuffix(companyLine) : "",
  });
}

export type ExperienceSectionLike = {
  innerText?: string | null;
  querySelectorAll?: (selector: string) => ArrayLike<CapturedNode>;
};

export function captureExperienceFromSection(section: ExperienceSectionLike | null | undefined) {
  if (!section) return { role: "", company: "" };

  const entries = section.querySelectorAll?.(
    "li.pvs-list__paged-list-item, li.artdeco-list__item, [data-view-name=\"profile-component-entity\"]",
  );
  const firstEntry = entries?.[0];
  if (firstEntry) {
    const hiddenSpans = capturedNodes(firstEntry.querySelectorAll?.("span[aria-hidden=\"true\"]"))
      .map((node) => clean(node.textContent))
      .filter(Boolean);

    if (hiddenSpans.length >= 2) {
      return sanitizeExperienceRoleCompany({
        role: hiddenSpans[0],
        company: stripEmploymentSuffix(hiddenSpans[1]),
      });
    }

    const role = clean(
      firstEntry.querySelector?.(".t-bold span[aria-hidden=\"true\"]")?.textContent
      || firstEntry.querySelector?.(".mr1.hoverable-link-text span")?.textContent
      || firstEntry.querySelector?.(".t-bold")?.textContent,
    );
    const companyLine = clean(
      firstEntry.querySelector?.(".t-14.t-normal span[aria-hidden=\"true\"]")?.textContent
      || firstEntry.querySelector?.(".t-14.t-normal")?.textContent,
    );

    const parsed = sanitizeExperienceRoleCompany({
      role,
      company: stripEmploymentSuffix(companyLine),
    });
    if (parsed.role && parsed.company) return parsed;
  }

  return parseExperienceSectionText(section.innerText ?? "");
}
