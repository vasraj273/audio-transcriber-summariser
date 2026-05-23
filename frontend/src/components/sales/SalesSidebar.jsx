import { NavLink } from "react-router-dom";

const ITEMS = [
  {
    to: "/sales-assistant",
    label: "Analytics",
    desc: "Overview",
    end: true,
    icon: (
      <path d="M3 13.5L9 7.5L13 11.5L21 3.5M21 3.5H15M21 3.5V9.5M3 21H21" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    to: "/sales-assistant/leads",
    label: "Leads",
    desc: "CRM pipeline",
    icon: (
      <path d="M16 21V19C16 16.7909 14.2091 15 12 15H6C3.79086 15 2 16.7909 2 19V21M22 21V19C21.9986 17.1771 20.7635 15.5857 19 15.13M16 3.13C17.7699 3.58317 19.0078 5.17522 19.0078 7.005C19.0078 8.83478 17.7699 10.4268 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    to: "/sales-assistant/tasks",
    label: "Tasks",
    desc: "Action items",
    icon: (
      <path d="M9 11L12 14L22 4M21 12V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H16" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    to: "/sales-assistant/kpi",
    label: "KPIs",
    desc: "Performance",
    icon: (
      <path d="M18 20V10M12 20V4M6 20V14" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
];

export default function SalesSidebar() {
  return (
    <aside className="lg:w-64 lg:flex-shrink-0">
      <div className="sticky top-[80px] card p-3">
        <div className="px-3 pt-2 pb-3 border-b border-ink-100 mb-2">
          <p className="eyebrow">Workspace</p>
          <p className="h-section mt-0.5">Sales Assistant</p>
        </div>
        <nav className="flex flex-col gap-0.5">
          {ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  isActive
                    ? "bg-ink-900 text-white"
                    : "text-ink-700 hover:bg-ink-50"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`grid place-items-center w-8 h-8 rounded-lg border ${
                      isActive
                        ? "bg-white/10 border-white/15 text-white"
                        : "bg-ink-50 border-ink-200 text-ink-600 group-hover:text-ink-900 group-hover:border-ink-300"
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      {item.icon}
                    </svg>
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13.5px] font-medium leading-tight">{item.label}</span>
                    <span className={`text-[11px] leading-tight mt-0.5 ${isActive ? "text-white/60" : "text-ink-400"}`}>
                      {item.desc}
                    </span>
                  </div>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
