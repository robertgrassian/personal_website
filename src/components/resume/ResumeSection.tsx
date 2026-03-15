import type { ReactNode } from "react";

type ResumeSectionProps = {
  title: string;
  children: ReactNode;
};

export function ResumeSection({ title, children }: ResumeSectionProps) {
  return (
    <section>
      <h2 className="text-2xl font-semibold border-b border-link/30 pb-2">{title}</h2>
      {children}
    </section>
  );
}
