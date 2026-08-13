"use client";

import { useEffect } from "react";

export function DraftMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".homepage-draft");
    if (!root) return;
    root.classList.add("motion-ready");

    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8%" });

    root.querySelectorAll(".draft-reveal, .draft-reveal-item").forEach((item) => revealObserver.observe(item));

    let frame = 0;
    const updateScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - innerHeight;
        root.style.setProperty("--draft-scroll", `${max > 0 ? scrollY / max : 0}`);
        root.classList.toggle("has-scrolled", scrollY > 32);
      });
    };
    updateScroll();
    addEventListener("scroll", updateScroll, { passive: true });

    const hero = root.querySelector<HTMLElement>(".draft-hero");
    const moveHero = (event: PointerEvent) => {
      if (!hero || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const rect = hero.getBoundingClientRect();
      hero.style.setProperty("--pointer-x", `${(event.clientX - rect.left) / rect.width - .5}`);
      hero.style.setProperty("--pointer-y", `${(event.clientY - rect.top) / rect.height - .5}`);
    };
    hero?.addEventListener("pointermove", moveHero);

    return () => {
      revealObserver.disconnect();
      removeEventListener("scroll", updateScroll);
      hero?.removeEventListener("pointermove", moveHero);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <div className="draft-scroll-progress" aria-hidden="true" />;
}
