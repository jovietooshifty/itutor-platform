import { Card, Countdown } from 'itutor-frontend';

// Countdown is ink-ground only (its own doc says so), so every story sits in
// the feature card it is designed for.
const OnInk = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 358 }}>
    <Card tone="feature" eyebrow="Next class starts in" title="CSEC Mathematics">
      <div className="pt-ds-3">{children}</div>
    </Card>
  </div>
);

export const DaysAway = () => (
  <OnInk>
    <Countdown days={3} hours={4} minutes={12} />
  </OnInk>
);

export const Today = () => (
  <OnInk>
    <Countdown days={0} hours={2} minutes={15} />
  </OnInk>
);

export const AboutToStart = () => (
  <OnInk>
    <Countdown days={0} hours={0} minutes={5} />
  </OnInk>
);
