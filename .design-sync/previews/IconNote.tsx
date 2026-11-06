import { DsIcon, IconNote } from 'itutor-frontend';

const Col = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col gap-ds-3" style={{ width: 358 }}>{children}</div>
);

export const Tones = () => (
  <Col>
    <IconNote tone="danger" icon={<DsIcon name="billing" size={20} />} title="Payment failed" meta="Droove · TT$180 · 12 Nov" />
    <IconNote tone="yellow" icon={<DsIcon name="bell" size={20} />} title="Request closes in 2 hours" meta="Nothing is held until you approve" />
    <IconNote tone="brand" icon={<DsIcon name="classes" size={20} />} title="Droove is enrolled" meta="CSEC Mathematics starts Mon 26 Oct" />
  </Col>
);

export const WithCharacter = () => (
  <Col>
    <IconNote tone="brand" icon="✓" title="Your card is saved" meta="Visa ending 4242" />
  </Col>
);
