import { useEffect, useState } from "react";
import { ArrowLeftRightIcon, Grid2x2Icon, ListIcon } from "lucide-react";
import { mobileLayoutQuery } from "@/app/breakpoints";
import "./mobile-planner-nav.css";

export function MobilePlannerNav({ onCompare }: { onCompare: () => void }) {
  const [activeSection, setActiveSection] = useState("planner-options");
  useEffect(() => {
    const mobile = window.matchMedia(mobileLayoutQuery);
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
        <ListIcon aria-hidden="true" className="size-4" />
        <span>Options</span>
      </a>
      <a
        href="#planner-squad"
        aria-current={
          activeSection === "planner-squad" ? "location" : undefined
        }
      >
        <Grid2x2Icon aria-hidden="true" className="size-4" />
        <span>Squad</span>
      </a>
      <a
        href="#planner-compare"
        aria-current={
          activeSection === "planner-compare" ? "location" : undefined
        }
        onClick={onCompare}
      >
        <ArrowLeftRightIcon aria-hidden="true" className="size-4" />
        <span>Compare</span>
      </a>
    </nav>
  );
}
