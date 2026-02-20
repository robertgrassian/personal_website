import type { RoleProps } from "./Role";
import { Role } from "./Role";

export type CompanyProps = {
  name: string;
  location: string;
  subtitle?: string;
  roles: RoleProps[];
};

export function Company({ name, location, subtitle, roles }: CompanyProps) {
  return (
    <div>
      <div className="flex justify-between items-baseline">
        <h3 className="text-xl font-bold">{name}</h3>
        <span className="text-sm text-gray-500">{location}</span>
      </div>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      <div className="mt-3 ml-4 border-l-2 border-gray-200 pl-4 space-y-6">
        {roles.map((role, index) => (
          <Role key={index} {...role} />
        ))}
      </div>
    </div>
  );
}
