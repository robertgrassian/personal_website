import type { SectionProps } from "./Section";
import { Section } from "./Section";

export type RoleProps = {
  title: string;
  dateRange: string;
  sections: SectionProps[];
};

export function Role({ title, dateRange, sections }: RoleProps) {
  return (
    <div>
      <p className="font-medium text-gray-800">{title}</p>
      <p className="text-sm text-gray-500">{dateRange}</p>
      {sections.map((section, index) => (
        <Section key={index} {...section} />
      ))}
    </div>
  );
}
