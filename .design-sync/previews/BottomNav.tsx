import { BottomNav } from 'itutor-frontend';

const Phone = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 390 }}>{children}</div>
);

export const Home = () => (
  <Phone>
    <BottomNav active="home" />
  </Phone>
);

export const ClassesActive = () => (
  <Phone>
    <BottomNav active="classes" />
  </Phone>
);

export const BillingNeedsAttention = () => (
  <Phone>
    <BottomNav
      active="home"
      items={[
        { id: 'home', label: 'Home', icon: 'home' },
        { id: 'explore', label: 'Explore', icon: 'explore' },
        { id: 'classes', label: 'Classes', icon: 'classes' },
        { id: 'billing', label: 'Billing', icon: 'billing', badge: true },
        { id: 'profile', label: 'Profile', icon: 'profile' },
      ]}
    />
  </Phone>
);
