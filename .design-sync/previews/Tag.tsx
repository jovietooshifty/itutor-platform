import { Tag } from 'itutor-frontend';

export const Tones = () => (
  <div className="flex flex-wrap gap-ds-2" style={{ width: 320 }}>
    <Tag tone="brand">Active</Tag>
    <Tag tone="danger">Needs action</Tag>
    <Tag tone="warning">Needs you</Tag>
    <Tag tone="orange">Next</Tag>
    <Tag tone="dark">Enrolled</Tag>
    <Tag tone="outline">Paused</Tag>
  </div>
);

export const OnACard = () => (
  <div className="flex items-center justify-between rounded-ds-card bw-hair border-border bg-surface-card p-ds-card" style={{ width: 358 }}>
    <span className="font-body text-[15px] font-extrabold text-ink">Ms Maloney&apos;s CSEC Geography</span>
    <Tag tone="brand">Enrolled</Tag>
  </div>
);
