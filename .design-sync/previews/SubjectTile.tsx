import { SubjectTile } from 'itutor-frontend';

export const Colours = () => (
  <div className="flex gap-ds-3">
    <SubjectTile code="MA" color="green" />
    <SubjectTile code="SP" color="yellow" />
    <SubjectTile code="GE" color="orange" />
    <SubjectTile code="EN" color="sage" />
  </div>
);

export const Sizes = () => (
  <div className="flex items-end gap-ds-3">
    <SubjectTile code="PH" color="orange" size={36} />
    <SubjectTile code="PH" color="orange" />
    <SubjectTile code="PH" color="orange" size={72} />
  </div>
);
