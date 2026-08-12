import { NavLink } from "react-router-dom";
import { visibleNavigationLinks, type NavigationIdentity } from "./navigation";

export function SideNav({ permissions, scope, identity }: { permissions: string[]; scope: string; identity?: NavigationIdentity }) {
  const visibleLinks = visibleNavigationLinks(permissions, scope, identity);
  return <nav aria-label="Primary navigation" className="border-b border-slate-200 bg-slate-950 px-3 py-2 text-slate-100 lg:min-h-[calc(100vh-65px)] lg:w-56 lg:border-b-0 lg:border-r lg:py-4">
    <div className="flex gap-1 overflow-x-auto lg:flex-col">{visibleLinks.map(({ label, to }) => <NavLink key={to} to={to} aria-label={`${label} section`} className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm ${isActive ? "bg-white text-slate-950" : "hover:bg-slate-800"}`}>{label}</NavLink>)}</div>
  </nav>;
}
