import { useEffect, useState } from "react";
import "./mobile-planner-nav.css";

export function MobilePlannerNav({ onCompare }: { onCompare: () => void }) {
  const [activeSection, setActiveSection] = useState("planner-options");
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 780px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!mobile.matches) return;
      const sections = ["planner-options", "planner-compare", "planner-squad"]
        .map((id) => ({
          id,
          top:
            document.getElementById(id)?.getBoundingClientRect().top ??
            Infinity,
        }))
        .filter(({ top }) => top <= 96)
        .sort((a, b) => b.top - a.top);
      setActiveSection(sections[0]?.id ?? "planner-options");
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return (
    <nav className="workspace-mobile-nav" aria-label="Planner sections">
      <a
        href="#planner-options"
        aria-current={
          activeSection === "planner-options" ? "location" : undefined
        }
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="3" />
        </svg>
        <span>Options</span>
      </a>
      <a
        href="#planner-squad"
        aria-current={
          activeSection === "planner-squad" ? "location" : undefined
        }
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M5 12h14M9 3v4h6V3M9 21v-4h6v4" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
        <span>Squad</span>
      </a>
      <a
        href="#planner-compare"
        aria-current={
          activeSection === "planner-compare" ? "location" : undefined
        }
        onClick={onCompare}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" />
        </svg>
        <span>Compare</span>
      </a>
    </nav>
  );
}
