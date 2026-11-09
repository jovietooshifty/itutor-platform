'use client';

// What the teacher agrees to before the ID check. It is part of the ID check step, not a step of
// its own, so that no step has to be finished before another can be opened.

import Link from 'next/link';

export default function ConsentNotice({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">Here is exactly what happens with your information.</p>

      <ul className="mt-4 space-y-4 text-sm text-ink">
        <li>
          <span className="font-semibold">What we collect.</span> A check of your government ID and a selfie (done by
          Didit, our identity check partner), and your qualifications with a photo of each certificate.
        </li>
        <li>
          <span className="font-semibold">What is public.</span> Once you are verified, students and parents see a
          Verified badge, and a details page with your legal name, the date your ID was verified and your
          qualifications as text. They never see your ID, your selfie or the photos of your certificates.
        </li>
        <li>
          <span className="font-semibold">Your ID.</span> Didit handles your ID and selfie. We never see or store the
          images or your ID number. We keep only a reference to the check, whether it passed, and your first and
          last name as they appear on the ID, which become the name shown on your profile.
        </li>
        <li>
          <span className="font-semibold">A copy is kept for a short time.</span> Didit holds the ID data until we ask it
          to delete it after we have made a decision on your application.
        </li>
      </ul>

      <p className="mt-4 text-sm text-muted-foreground">
        Read our{' '}
        <Link href="/privacy" target="_blank" className="font-medium text-brand underline">
          Privacy Policy
        </Link>{' '}
        for more.
      </p>

      <label className="mt-5 flex items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-brand"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          I understand the above and agree to an identity check, and to my legal name and qualifications being shown
          publicly once I am verified.
        </span>
      </label>
    </div>
  );
}
