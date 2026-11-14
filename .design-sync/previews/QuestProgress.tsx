import { QuestProgress } from 'itutor-frontend';

const Col = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col gap-ds-2" style={{ width: 320 }}>{children}</div>
);

export const Quest = () => (
  <Col>
    <span className="font-body text-[13px] font-extrabold text-ink">2 of 5 sessions this week</span>
    <QuestProgress total={5} done={2} />
  </Col>
);

export const Meter = () => (
  <Col>
    <span className="font-body text-[13px] text-ink-muted">12 days until the next charge</span>
    <QuestProgress variant="meter" total={30} done={18} label="12 days until the next charge" />
  </Col>
);

export const Complete = () => (
  <Col>
    <span className="font-body text-[13px] font-extrabold text-ink">Week complete</span>
    <QuestProgress total={5} done={5} />
  </Col>
);
