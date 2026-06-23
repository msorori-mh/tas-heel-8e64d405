const MESSAGES = [
  "الاستمرارية اليومية أهم من المذاكرة الطويلة مرة واحدة.",
  "كل درس تكمّله يقربك من الثانوية العامة.",
  "راجع ما تعلّمته أمس قبل أن تبدأ درسًا جديدًا.",
  "النجاح يُبنى خطوة بخطوة — وأنت على الطريق.",
];

export function MotivationFooter() {
  const index = new Date().getDate() % MESSAGES.length;
  const message = MESSAGES[index];

  return (
    <footer className="rounded-xl border border-border/40 bg-muted/30 px-4 py-3 text-center">
      <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
    </footer>
  );
}
