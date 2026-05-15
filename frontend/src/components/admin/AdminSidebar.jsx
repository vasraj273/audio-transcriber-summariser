import { NavLink } from "react-router-dom";

const ITEMS = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/failed-jobs", label: "Failed jobs" },
  { to: "/admin/api-monitoring", label: "API monitoring" },
  { to: "/admin/analytics", label: "Analytics" },
  { to: "/admin/settings", label: "Settings" },
];

export default function AdminSidebar() {
  return (
    <aside className="lg:w-56 lg:flex-shrink-0">
      <div className="sticky top-[78px] rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Admin</p>
        <nav className="flex flex-col gap-1">
          {ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
