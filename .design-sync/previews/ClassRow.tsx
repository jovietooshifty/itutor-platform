import { Card, ClassRow } from 'itutor-frontend';

const Col = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col gap-ds-3" style={{ width: 358 }}>{children}</div>
);

export const Default = () => (
  <Col>
    <ClassRow
      code="MA"
      color="green"
      title="CSEC Mathematics"
      meta="Rishi Persad · Mon, Wed & Fri · 4:30 PM"
      price="TT$180"
      onClick={() => {}}
    />
  </Col>
);

export const SubjectColours = () => (
  <Col>
    <ClassRow code="MA" color="green" title="CSEC Mathematics" meta="Rishi Persad · Mon & Wed" price="TT$180" />
    <ClassRow code="SP" color="yellow" title="CSEC Spanish Form 5" meta="Mr. Coutain · Mon & Tue" price="TT$120" />
    <ClassRow code="GE" color="orange" title="CSEC Geography" meta="Amanda Maloney · Thursdays" price="TT$145" />
    <ClassRow code="EN" color="sage" title="CSEC English A" meta="Kavita Singh · Tue & Thu" price="TT$150" />
  </Col>
);

export const FlatInsideCard = () => (
  <Col>
    <Card title="Classes for Droove">
      <div className="flex flex-col gap-ds-3 pt-ds-3">
        <ClassRow flat code="PH" color="orange" title="CSEC Physics" meta="Ms. Charles · Mondays" price="TT$170" />
        <ClassRow flat code="CH" color="sage" title="CSEC Chemistry" meta="Dr. Ramnarine · Thursdays" price="TT$175" />
      </div>
    </Card>
  </Col>
);

export const HourlyRate = () => (
  <Col>
    <ClassRow code="EC" color="yellow" title="Tamara Rampersad" meta="CAPE & CSEC Economics" price="TT$100" unit="/hr" />
  </Col>
);
