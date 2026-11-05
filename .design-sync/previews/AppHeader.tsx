import { AppHeader } from 'itutor-frontend';
import logo from '../../public/brand/itutor-logo.svg';
import logoOnDark from '../../public/brand/itutor-logo-on-dark.png';

const Phone = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 390 }}>{children}</div>
);

export const Light = () => (
  <Phone>
    <AppHeader
      logo={<img src={logo} alt="iTutor" style={{ height: 24, display: 'block' }} />}
      initials="AR"
      unread
    />
  </Phone>
);

export const Dark = () => (
  <Phone>
    <AppHeader
      tone="dark"
      logo={<img src={logoOnDark} alt="iTutor" style={{ height: 24, display: 'block' }} />}
      initials="AR"
    />
  </Phone>
);

export const WithMessagesAndSearch = () => (
  <Phone>
    <AppHeader
      logo={<img src={logo} alt="iTutor" style={{ height: 24, display: 'block' }} />}
      actions={['search', 'chat', 'bell']}
      initials="JG"
      unread
    />
  </Phone>
);
