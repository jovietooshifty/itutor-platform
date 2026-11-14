import { Card, SummaryRow } from 'itutor-frontend';

export const InACard = () => (
  <div style={{ width: 358 }}>
    <Card title="Droove · 2 classes">
      <div className="flex flex-col gap-ds-2 pt-ds-3">
        <SummaryRow label="Monthly total" value="TT$340" />
        <SummaryRow label="Next charge" value="24 November 2026" />
        <SummaryRow label="Card" value="Visa ending 4242" />
      </div>
    </Card>
  </div>
);

export const OnInk = () => (
  <div style={{ width: 358 }}>
    <Card tone="feature" eyebrow="This month">
      <div className="flex flex-col gap-ds-2 pt-ds-2">
        <SummaryRow tone="ink" label="Paid" value="TT$340" />
        <SummaryRow tone="ink" label="Owed" value="TT$0" />
      </div>
    </Card>
  </div>
);

export const LabelEmphasis = () => (
  <div style={{ width: 358 }}>
    <Card>
      <SummaryRow emphasis="label" label="CSEC Mathematics" value="Mon, Wed & Fri" />
    </Card>
  </div>
);
