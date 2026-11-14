import { StepList } from 'itutor-frontend';

export const HowEnrolmentWorks = () => (
  <div style={{ width: 358 }}>
    <StepList
      steps={[
        { title: 'Droove asks to join', detail: 'You get a request on Home and in Classes.' },
        { title: 'You approve and pay', detail: 'Nothing is held until you do. First to pay wins the place.' },
        { title: 'Class starts', detail: 'You both get a reminder an hour before.' },
      ]}
    />
  </div>
);

export const TitlesOnly = () => (
  <div style={{ width: 358 }}>
    <StepList steps={[{ title: 'Add a card' }, { title: 'Confirm the amount' }, { title: 'Done' }]} />
  </div>
);
