import { Button, DsPortal } from 'itutor-frontend';

// DsPortal renders its children into document.body with the design-system
// tokens carried along, so overlays (sheets, toasts) keep the iTutor palette
// even though they escape the .ds-root wrapper in the DOM.
export const BottomSheet = () => (
  <div className="p-ds-4 font-body text-[13px] text-ink-muted">
    The sheet below is portalled to the page body, outside this wrapper.
    <DsPortal>
      <div className="fixed inset-0 flex items-end justify-center bg-ink/40">
        <div className="flex w-full flex-col gap-ds-3 rounded-t-ds-card bw-hair border-border bg-surface-card p-ds-card" style={{ maxWidth: 430 }}>
          <span className="font-display text-[18px] font-extrabold text-ink">Arjun Rambally</span>
          <span className="font-body text-[14px] text-ink">Account settings</span>
          <Button variant="outline" block>Close</Button>
        </div>
      </div>
    </DsPortal>
  </div>
);
