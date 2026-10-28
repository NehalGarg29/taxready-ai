const NAV = [
  { href: "#audit", label: "Intake Audit" },
  { href: "#methodology", label: "About / Methodology" },
];

export function Sidebar() {
  return (
    <aside className="border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-2.5 px-5 py-4 lg:py-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-sm font-bold text-white" aria-hidden>
          TR
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight text-ink">TaxReady AI</div>
          <div className="text-xs text-ink-muted">Intake quality review</div>
        </div>
      </div>
      <nav className="flex gap-1 px-3 pb-3 lg:flex-col lg:pb-0" aria-label="Sections">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:bg-slate-100 hover:text-ink"
          >
            {item.label}
          </a>
        ))}
      </nav>
      <p className="hidden px-5 pt-6 text-xs leading-relaxed text-ink-muted lg:block">
        Prototype. Synthetic data only. Not a tax preparation or filing system.
      </p>
    </aside>
  );
}
