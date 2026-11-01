import Image from "next/image";
import "./planner-loading.css";

export function PlannerLoading({
  label,
  title,
}: {
  label: string;
  title: string;
}) {
  return (
    <section
      className="planner-loading"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="planner-loading__visual" aria-hidden="true">
        <Image
          src="/fantasy-pancake.svg"
          width={72}
          height={72}
          alt=""
          unoptimized
        />
      </div>
      <div className="planner-loading__copy">
        <span className="planner-loading__eyebrow">
          Fantasy Pancake / In the dugout
        </span>
        <h2>{title}</h2>
        <p>{label}</p>
        <div className="planner-loading__track" aria-hidden="true">
          <span />
        </div>
      </div>
    </section>
  );
}
