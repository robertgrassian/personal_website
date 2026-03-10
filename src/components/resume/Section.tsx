export type SectionProps = {
  label?: string;
  items: string[];
};

export function Section({ label, items }: SectionProps) {
  return (
    <>
      {label && <p className="mt-3 text-sm font-semibold text-body">{label}</p>}
      <ul className="mt-2 list-disc list-inside text-body space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={`${item}-${i}`}>{item}</li>
        ))}
      </ul>
    </>
  );
}
