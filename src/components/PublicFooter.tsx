import { Link } from "@tanstack/react-router";

const footerLinks = [
  { to: "/about", label: "عن تنوير" },
  { to: "/privacy-policy", label: "سياسة الخصوصية" },
  { to: "/terms-of-service", label: "شروط الاستخدام" },
  { to: "/contact", label: "تواصل معنا" },
  { to: "/whatsapp-policy", label: "سياسة واتساب" },
];

export default function PublicFooter() {
  return (
    <footer className="border-t border-border bg-card px-4 py-6">
      <div className="container mx-auto max-w-5xl">
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {footerLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="hover:text-primary transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="mt-4 pt-4 border-t border-border text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} تنوير — جميع الحقوق محفوظة
        </p>
      </div>
    </footer>
  );
}
