import { Button } from 'itutor-frontend';

export const Primary = () => <Button>View class</Button>;

export const Variants = () => (
  <div className="flex flex-col gap-ds-3" style={{ width: 300 }}>
    <Button variant="primary" block>Review request</Button>
    <Button variant="danger" block>Fix payment</Button>
    <Button variant="dark" block>Create squad</Button>
    <Button variant="outline" block>Join with invite</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex items-end gap-ds-3">
    <Button size="lg">Approve and pay</Button>
    <Button size="md">View class</Button>
    <Button size="sm">See details</Button>
  </div>
);

export const WithIcon = () => (
  <div className="flex gap-ds-3">
    <Button icon="play">Start studying</Button>
    <Button variant="outline" icon="chat">Message tutor</Button>
  </div>
);

export const Disabled = () => (
  <div style={{ width: 300 }}>
    <Button block disabled>Save changes</Button>
  </div>
);
