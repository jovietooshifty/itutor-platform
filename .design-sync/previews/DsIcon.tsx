import { DsIcon } from 'itutor-frontend';

const NAMES = [
  'home', 'explore', 'classes', 'billing', 'profile', 'bell', 'chat',
  'search', 'chevron', 'play', 'users', 'filters', 'lock', 'help',
] as const;

export const AllIcons = () => (
  <div className="grid grid-cols-4 gap-ds-3" style={{ width: 360 }}>
    {NAMES.map((n) => (
      <div key={n} className="flex flex-col items-center gap-ds-1 rounded-ds-card bw-hair border-border bg-surface-card p-ds-3 text-ink">
        <DsIcon name={n} />
        <span className="font-body text-[11px] text-ink-muted">{n}</span>
      </div>
    ))}
  </div>
);

export const Sizes = () => (
  <div className="flex items-end gap-ds-4 text-ink">
    <DsIcon name="bell" size={16} />
    <DsIcon name="bell" size={22} />
    <DsIcon name="bell" size={32} />
  </div>
);

export const OnInk = () => (
  <div className="inline-flex gap-ds-4 rounded-ds-card bg-ink px-ds-4 py-ds-3 text-on-ink">
    <DsIcon name="home" />
    <DsIcon name="classes" />
    <DsIcon name="billing" />
    <DsIcon name="profile" />
  </div>
);
