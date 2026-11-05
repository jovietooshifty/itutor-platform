import { NavRow, SubjectTile, Tag } from 'itutor-frontend';

const Col = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col gap-ds-3" style={{ width: 358 }}>{children}</div>
);

export const WithSubjectTile = () => (
  <Col>
    <NavRow
      tile={<SubjectTile code="MA" color="green" />}
      title="CSEC Mathematics"
      meta={<>TT$180/month · <Tag tone="brand">Active</Tag></>}
      onClick={() => {}}
    />
    <NavRow
      tile={<SubjectTile code="PH" color="orange" />}
      title="CSEC Physics"
      meta={<>TT$170/month · <Tag tone="danger">Failed</Tag></>}
      onClick={() => {}}
    />
  </Col>
);

export const Plain = () => (
  <Col>
    <NavRow title="Payment history and receipts" onClick={() => {}} />
    <NavRow title="Billing help" href="#billing-help" />
  </Col>
);

export const NotALink = () => (
  <Col>
    <NavRow title="Anaya · Student account linked" meta="Joined 2 Oct 2026" chevron={false} />
  </Col>
);
