import { Button, Card, ClassRow, NewUiShell, SectionHeader, Tag } from 'itutor-frontend';
import logo from '../../public/brand/itutor-logo.svg';

const Logo = () => <img src={logo} alt="iTutor" style={{ height: 24, display: 'block' }} />;

export const HomeScreen = () => (
  <NewUiShell active="home" logo={<Logo />} initials="AR" unread>
    <div className="flex flex-col gap-ds-3">
      <h1 className="font-display text-[28px] font-extrabold text-ink">Droove&apos;s week</h1>
      <Card
        tone="alert"
        tag={<Tag tone="danger">Needs action</Tag>}
        title="Payment failed for Droove"
        body="TT$180 for CSEC Mathematics."
      >
        <div className="pt-ds-3">
          <Button variant="danger" size="sm" block>Fix payment</Button>
        </div>
      </Card>
      <Card tone="feature" eyebrow="Up next · Today" title="CSEC Mathematics" body="Rishi Persad · 4:30 PM">
        <div className="pt-ds-3">
          <Button block>View class</Button>
        </div>
      </Card>
      <SectionHeader title="Classes for Droove" action="See all" />
      <ClassRow code="MA" color="green" title="CSEC Mathematics" meta="Rishi Persad · Mon, Wed & Fri" price="TT$180" />
      <ClassRow code="PH" color="orange" title="CSEC Physics" meta="Ms. Charles · Mondays" price="TT$170" />
    </div>
  </NewUiShell>
);

export const DetailNoNav = () => (
  <NewUiShell nav={false} logo={<Logo />} initials="AR">
    <div className="flex flex-col gap-ds-3">
      <h1 className="font-display text-[28px] font-extrabold text-ink">Settings</h1>
      <Card title="Arjun Rambally" body="arjunrambally@gmail.com" />
    </div>
  </NewUiShell>
);
