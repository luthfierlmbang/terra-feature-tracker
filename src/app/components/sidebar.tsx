import { useState } from "react";
import {
  LayoutDashboard,
  Settings,
  Sliders,
  CircleHelp,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Brain,
} from "lucide-react";

type NavKey = "dashboard" | "customize" | "settings" | "ai-training";

const SECTIONS: {
  title: string;
  items: { key: NavKey; label: string; icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number; color?: string }> }[];
}[] = [
  {
    title: "GENERAL",
    items: [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "CONFIGURATION",
    items: [
      { key: "customize", label: "Customize Types", icon: Sliders },
      { key: "settings", label: "Settings", icon: Settings },
    ],
  },
  {
    title: "AI",
    items: [
      { key: "ai-training", label: "AI Training", icon: Brain },
    ],
  },
];

export function Sidebar({
  active,
  onChange,
  onLogout,
  user,
}: {
  active: NavKey;
  onChange: (key: NavKey) => void;
  onLogout: () => void;
  user: { name: string; email: string; initials: string };
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`flex h-full shrink-0 flex-col rounded-xl bg-[#024042] transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-[72px]" : "w-[260px]"
      }`}
      style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}
    >
      {/* Header */}
      <div
        className={`flex items-center ${
          isCollapsed ? "flex-col gap-4 py-4 px-2" : "justify-between p-5"
        } border-b border-[#012a2c] transition-all`}
      >
        {isCollapsed ? (
          <>
            <div className="text-[#e6f1f2] opacity-95 py-1" title="Tepat">
              <svg width="18" height="27" viewBox="0 0 16 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M12.2681 1.93719C9.69546 -0.6415 5.51946 -0.64639 2.94077 1.92652C0.362078 4.49921 0.35741 8.67521 2.9301 11.2539C5.50278 13.8326 9.67879 13.8373 12.2575 11.2646C14.8362 8.69188 14.8408 4.51588 12.2681 1.93719Z" fill="currentColor"/>
                <path fillRule="evenodd" clipRule="evenodd" d="M1.22435 14.2597C1.29326 14.001 1.56133 13.8478 1.82473 13.9105C5.14384 14.6871 10.0647 14.7014 13.3967 13.9445C13.6608 13.8845 13.9275 14.0381 13.9951 14.2973C13.9944 14.2979 13.994 14.2988 13.9933 14.2997C13.9955 14.3064 13.9989 14.3124 14.0004 14.3188C14.3939 15.8819 14.7866 17.4448 15.179 19.0081C15.245 19.2675 15.0345 19.5456 14.7077 19.6209C13.7341 19.8459 12.7528 20.023 11.7665 20.1526C11.4373 20.1955 11.193 20.4405 11.2215 20.7072C11.3184 21.5814 11.4151 22.4561 11.5118 23.3308C11.542 23.5975 11.2666 23.8467 10.8958 23.8807C8.69079 24.0863 6.47108 24.0799 4.26716 23.8614C3.89662 23.8238 3.62277 23.574 3.65455 23.3074C3.75636 22.4332 3.85816 21.5597 3.96019 20.6859C3.9902 20.4193 3.74747 20.1728 3.41827 20.1279C2.43289 19.9926 1.45263 19.8098 0.480372 19.5791C0.154063 19.5018 -0.0548819 19.2226 0.0126917 18.9636C0.414132 17.4028 0.821797 15.8203 1.22435 14.2597Z" fill="currentColor"/>
              </svg>
            </div>
            <button
              onClick={() => setIsCollapsed(false)}
              className="rounded-md p-1.5 hover:bg-[#012a2c] text-[#e6f1f2] transition-colors mt-0.5"
              aria-label="Expand sidebar"
              title="Expand Sidebar"
            >
              <PanelLeftOpen size={18} strokeWidth={1.5} />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap">
              <img src="/logo.svg" alt="Tepat Logo" className="h-6 w-auto object-contain brightness-0 invert" />
            </div>
            <button
              onClick={() => setIsCollapsed(true)}
              className="rounded-md p-1.5 hover:bg-[#012a2c] text-[#e6f1f2] transition-colors"
              aria-label="Collapse sidebar"
              title="Collapse Sidebar"
            >
              <PanelLeftClose size={18} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto pt-4">
        {SECTIONS.map((section) => (
          <div key={section.title} className="pb-4">
            {!isCollapsed && (
              <div className="px-5 pb-1">
                <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 11, lineHeight: "18px", color: "#80babd", letterSpacing: "0.05em" }}>
                  {section.title}
                </p>
              </div>
            )}
            <div className="px-3 flex flex-col gap-1">
              {section.items.map((item, idx) => {
                const isActive = item.key === active;
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => onChange(item.key)}
                    className={`animate-slide-in-left press-down flex items-center rounded-md transition-all ${
                      isCollapsed ? "justify-center p-2.5 w-full" : "gap-3 px-3 py-2 w-full text-left"
                    } ${
                      isActive ? "bg-[#035a5d] text-white" : "text-[#e6f1f2] hover:bg-[#024f52] hover:text-white"
                    }`}
                    style={{ animationDelay: `${idx * 50}ms` }}
                    title={item.label}
                  >
                    <Icon size={18} strokeWidth={isActive ? 2 : 1.5} color={isActive ? "#ffffff" : "#b0d5d7"} />
                    {!isCollapsed && (
                      <span style={{ fontFamily: "Inter, sans-serif", fontWeight: isActive ? 600 : 500, fontSize: 14, lineHeight: "20px" }}>
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Support Section */}
        {!isCollapsed && (
          <div className="px-5 pb-1 mt-2">
            <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 11, lineHeight: "18px", color: "#80babd", letterSpacing: "0.05em" }}>
              SUPPORT
            </p>
          </div>
        )}
        <div className="px-3">
          <button
            className={`flex items-center rounded-md text-[#e6f1f2] hover:bg-[#024f52] hover:text-white transition-all ${
              isCollapsed ? "justify-center p-2.5 w-full" : "gap-3 px-3 py-2 w-full text-left"
            }`}
            title="Help & Docs"
          >
            <CircleHelp size={18} strokeWidth={1.5} color="#b0d5d7" />
            {!isCollapsed && (
              <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, lineHeight: "20px" }}>
                Help & Docs
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Profile Footer */}
      <div className="border-t border-[#012a2c] p-3">
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-3.5 py-1">
            <div className="relative size-9 shrink-0">
              <div
                className="flex size-full items-center justify-center rounded-full text-white"
                style={{
                  backgroundImage: "linear-gradient(135deg, #02878d, #027479)",
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {user.initials}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-[1.5px] border-[#024042] bg-[#22c55e]" />
            </div>
            <button
              onClick={onLogout}
              className="rounded-md p-1.5 hover:bg-[#035a5d] text-[#b0d5d7] hover:text-white transition-colors"
              title="Log out"
            >
              <LogOut size={18} strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-[#024f52] transition-colors">
            <div className="relative size-9 shrink-0">
              <div
                className="flex size-full items-center justify-center rounded-full text-white"
                style={{
                  backgroundImage: "linear-gradient(135deg, #02878d, #027479)",
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {user.initials}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-[1.5px] border-[#024042] bg-[#22c55e]" />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate" style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, lineHeight: "20px", color: "#ffffff" }}>
                {user.name}
              </p>
              <p className="truncate" style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 13, lineHeight: "18px", color: "#80babd" }}>
                {user.email}
              </p>
            </div>
            <button
              onClick={onLogout}
              className="rounded-md p-1.5 hover:bg-[#035a5d] text-[#b0d5d7] hover:text-white transition-colors"
              title="Log out"
            >
              <LogOut size={16} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

export function MobileNav({
  active,
  onChange,
}: {
  active: NavKey;
  onChange: (key: NavKey) => void;
}) {
  const items = SECTIONS.flatMap((section) => section.items);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d5e2e3] bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
      <div className="grid grid-cols-4 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 transition-colors ${
                isActive ? "bg-[#e6f1f2] text-[#027479]" : "text-[#667085] hover:bg-[#f5f5f5]"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={isActive ? 2 : 1.6} />
              <span className="max-w-full truncate text-[11px] font-semibold leading-4">
                {item.label.replace("Customize Types", "Types").replace("AI Training", "Training")}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export type { NavKey };
