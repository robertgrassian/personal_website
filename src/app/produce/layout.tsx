import { AuthFlagSync } from "@/components/auth/AuthFlagSync";
import "./produce.css";

// A Next layout wraps every page under /produce. It owns the surface: produce.css scopes its
// tokens to [data-app="produce"], so the paper/chalkboard palette cannot leak into other pages.
export default function ProduceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-app="produce" className="produce-surface">
      {/* Keeps the pre-paint data-authed flag true after a sign-in or sign-out on this page. In the
          layout because it must never unmount. */}
      <AuthFlagSync />
      {children}
    </div>
  );
}
