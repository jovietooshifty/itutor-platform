import { SectionHeader } from 'itutor-frontend';

const Col = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col gap-ds-4" style={{ width: 358 }}>{children}</div>
);

export const WithAction = () => (
  <Col>
    <SectionHeader title="Classes for Droove" action="See all" onAction={() => {}} />
  </Col>
);

export const TitleOnly = () => (
  <Col>
    <SectionHeader title="Waiting on you" />
  </Col>
);
