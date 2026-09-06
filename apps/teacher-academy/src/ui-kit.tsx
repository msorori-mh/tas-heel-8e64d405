import { useEffect, useState } from "react";
import { Award, Flame, Medal, Sparkle, Star, Trophy } from "lucide-react";

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="tk-progress" role="progressbar" aria-valuenow={safe} aria-label={label ?? "التقدم"} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${safe}%` }} />
    </div>
  );
}

export function ProgressRing({
  value,
  size = 74,
  caption,
}: {
  value: number;
  size?: number;
  caption?: string;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = Math.max(5, Math.round(size / 11));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="tk-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} className="tk-ring-track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="tk-ring-value"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (circumference * safe) / 100}
        />
      </svg>
      <span className="tk-ring-label">
        <strong>{safe}%</strong>
        {caption ? <small>{caption}</small> : null}
      </span>
    </div>
  );
}

export type AchievementInput = {
  completedLessons: number;
  totalLessons: number;
  passedAssessment?: boolean;
};

export function AchievementBadges({ completedLessons, totalLessons, passedAssessment }: AchievementInput) {
  const ratio = totalLessons > 0 ? completedLessons / totalLessons : 0;
  const badges = [
    {
      key: "first",
      icon: <Sparkle />,
      title: "الانطلاقة",
      hint: "أكملت أول درس",
      earned: completedLessons >= 1,
    },
    {
      key: "half",
      icon: <Flame />,
      title: "منتصف الطريق",
      hint: "أنجزت نصف الدروس",
      earned: ratio >= 0.5 && totalLessons > 0,
    },
    {
      key: "all",
      icon: <Medal />,
      title: "إتمام الدروس",
      hint: "أنهيت كل دروس البرنامج",
      earned: totalLessons > 0 && completedLessons >= totalLessons,
    },
    {
      key: "assessment",
      icon: <Trophy />,
      title: "اجتياز التقييم",
      hint: "حصلت على الشهادة",
      earned: Boolean(passedAssessment),
    },
  ];

  return (
    <div className="tk-badges" aria-label="الإنجازات">
      {badges.map((badge) => (
        <div className={badge.earned ? "tk-badge earned" : "tk-badge"} key={badge.key} title={badge.hint}>
          <span className="tk-badge-icon">{badge.icon}</span>
          <span className="tk-badge-text">
            <strong>{badge.title}</strong>
            <small>{badge.earned ? badge.hint : "لم تُفتح بعد"}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

export function NextStepCard({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
  progress,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  progress?: number;
}) {
  return (
    <section className="tk-next-step">
      <div className="tk-next-step-main">
        <p className="tk-next-step-eyebrow">
          <Star aria-hidden="true" /> {eyebrow}
        </p>
        <h2>{title}</h2>
        <p className="tk-next-step-desc">{description}</p>
        <button className="primary-button" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
      {typeof progress === "number" ? <ProgressRing value={progress} caption="إنجازك" /> : <Award className="tk-next-step-art" aria-hidden="true" />}
    </section>
  );
}

export function Celebration({ show, message }: { show: boolean; message: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 2600);
    return () => window.clearTimeout(timer);
  }, [show]);

  if (!visible) return null;

  return (
    <div className="tk-celebration" role="status" aria-live="polite">
      <div className="tk-confetti" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, index) => (
          <i key={index} style={{ ["--i" as string]: index }} />
        ))}
      </div>
      <div className="tk-celebration-card">
        <Trophy aria-hidden="true" />
        <strong>{message}</strong>
      </div>
    </div>
  );
}
