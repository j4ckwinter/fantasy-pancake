import {
  ArrowLeftRightIcon,
  CalendarRangeIcon,
  DownloadIcon,
  type LucideIcon,
} from "lucide-react";
import "./planner-information.css";

const steps: { title: string; description: string; Icon: LucideIcon }[] = [
  {
    title: "Import your squad",
    description: "Start with your public deadline picks.",
    Icon: DownloadIcon,
  },
  {
    title: "Compare four gameweeks",
    description: "See how transfers change your starting XI.",
    Icon: CalendarRangeIcon,
  },
  {
    title: "Move or hold",
    description: "Compare every option with keeping your team.",
    Icon: ArrowLeftRightIcon,
  },
];

export function PlannerPrinciples() {
  return (
    <ol className="landing-steps" aria-label="How the planner works">
      {steps.map(({ title, description, Icon }, index) => (
        <li key={title} className="landing-step">
          <div className="landing-step__marker" aria-hidden="true">
            <span className="landing-step__icon">
              <Icon className="size-4" />
            </span>
            <span className="landing-step__number">
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>
          <h2>{title}</h2>
          <p>{description}</p>
        </li>
      ))}
    </ol>
  );
}
