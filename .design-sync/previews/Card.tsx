import { Button, Card, Countdown, Tag } from 'itutor-frontend';

const Col = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 358 }}>{children}</div>
);

export const Default = () => (
  <Col>
    <Card
      eyebrow="Payments by child"
      title="Droove · 2 classes"
      body="TT$340 a month. Next charge 24 November 2026."
    />
  </Col>
);

export const Feature = () => (
  <Col>
    <Card tone="feature" eyebrow="Up next · Today" title="CSEC Mathematics" body="Rishi Persad · 4:30 PM">
      <div className="flex flex-col gap-ds-3 pt-ds-3">
        <Countdown days={0} hours={2} minutes={15} />
        <Button block>View class</Button>
      </div>
    </Card>
  </Col>
);

export const Alert = () => (
  <Col>
    <Card
      tone="alert"
      tag={<Tag tone="danger">Needs action</Tag>}
      title="Payment failed for Droove"
      body="TT$180 for CSEC Mathematics. The place is open to others until it is paid."
    >
      <div className="pt-ds-3">
        <Button variant="danger" size="sm" block>Fix payment</Button>
      </div>
    </Card>
  </Col>
);

export const Outlined = () => (
  <Col>
    <Card
      tone="outlined"
      eyebrow="Squad"
      title="Form 5 Maths Crew"
      body="6 members · studying 4 days in a row"
    />
  </Col>
);
