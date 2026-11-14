'use client';

/**
 * Profile photo, new UI. Same props as the old AvatarUploadModal (which the
 * old pages keep), so the two v2 callers swap one import.
 *
 * Step 1 — pick: a DS Sheet with a drop zone and two DS buttons. No Figma
 *   frame draws this step (PROVISIONAL); it reuses the Sheet every v2 flow
 *   opens.
 * Step 2 — crop: Figma H7 `31:7516` "Move and zoom", a full-screen dark
 *   cropper with Choose another / Use photo pinned at the bottom.
 *
 * Remove photo asks once before it deletes: it is the only destructive
 * button here and it sat next to Upload with nothing in between.
 */

import { useCallback, useRef, useState, type DragEvent } from 'react';
import Cropper from 'react-easy-crop';
import { MagnifyingGlassPlus, Trash, UploadSimple, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui';
import { DsPortal } from '@/components/ui/DsPortal';
import { Sheet } from '@/components/parent/v2/Sheet';
import { cn } from '@/lib/utils';
import { validateImageFile, type Area } from '@/lib/utils/imageCrop';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (imageSrc: string, croppedArea: Area) => Promise<void>;
  uploading: boolean;
  hasAvatar?: boolean;
  onRemovePhoto?: () => Promise<void>;
};

export default function AvatarUploadSheetV2({ isOpen, onClose, onUpload, uploading, hasAvatar = false, onRemovePhoto }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const onCropComplete = useCallback((_a: Area, px: Area) => setArea(px), []);

  const reset = () => {
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setError(null);
    setDragging(false);
    setConfirmRemove(false);
  };

  const close = () => {
    if (uploading || removing) return;
    reset();
    onClose();
  };

  const readFile = (file: File | undefined) => {
    if (!file) return;
    const v = validateImageFile(file);
    if (!v.valid) {
      setError(v.error || 'That file can’t be used.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    readFile(e.dataTransfer.files?.[0]);
  };

  const usePhoto = async () => {
    if (!imageSrc || !area) return;
    try {
      await onUpload(imageSrc, area);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Try again.');
    }
  };

  const remove = async () => {
    if (!onRemovePhoto) return;
    setRemoving(true);
    setError(null);
    try {
      await onRemovePhoto();
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t remove your photo. Try again.');
    } finally {
      setRemoving(false);
    }
  };

  if (!isOpen) return null;

  const errorBox = error ? (
    <p role="alert" className="m-0 rounded-ds-sm bw-hair border-danger bg-surface-card px-ds-3 py-ds-2 text-[14px] font-bold text-danger">
      {error}
    </p>
  ) : null;

  if (imageSrc) {
    return (
      <DsPortal>
        <div role="dialog" aria-modal="true" aria-label="Move and zoom" className="fixed inset-0 z-50 flex flex-col bg-ink text-on-ink">
          <div className="flex h-14 shrink-0 items-center justify-between gap-ds-3 bw-b-hair border-on-ink/10 px-ds-2">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              disabled={uploading}
              className="flex size-11 items-center justify-center rounded-ds-sm border-0 bg-transparent text-on-ink cursor-pointer disabled:opacity-45"
            >
              <X size={22} weight="bold" aria-hidden />
            </button>
            <h2 className="m-0 font-display text-[17px] font-extrabold">Move and zoom</h2>
            <button
              type="button"
              onClick={() => void usePhoto()}
              disabled={uploading || !area}
              className="h-11 rounded-ds-sm border-0 bg-transparent px-ds-3 font-body text-[16px] font-extrabold text-brand cursor-pointer disabled:opacity-45"
            >
              Done
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="rect"
              showGrid={false}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              style={{ containerStyle: { background: 'transparent' } }}
            />
          </div>

          <div className="mx-auto flex w-full max-w-[480px] shrink-0 flex-col gap-ds-4 px-ds-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-ds-4">
            <label className="flex items-center gap-ds-3">
              <MagnifyingGlassPlus size={20} weight="bold" aria-hidden />
              <span className="sr-only">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                disabled={uploading}
                className="h-2 w-full cursor-pointer accent-[#32cc6e]"
              />
            </label>
            {errorBox}
            <div className="flex gap-ds-3">
              <Button variant="outline" size="lg" className="flex-1" disabled={uploading} onClick={() => setImageSrc(null)}>
                Choose another
              </Button>
              <Button size="lg" className="flex-1" disabled={uploading || !area} onClick={() => void usePhoto()}>
                {uploading ? 'Uploading…' : 'Use photo'}
              </Button>
            </div>
          </div>
        </div>
      </DsPortal>
    );
  }

  return (
    <Sheet open onClose={close} title="Profile photo">
      <p className="m-0 text-[15px] leading-[21px] text-ink-muted">Choose a photo. You can move and zoom it next.</p>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex h-44 w-full cursor-pointer flex-col items-center justify-center gap-ds-2 rounded-ds-card bw-bold bw-dashed text-center transition-colors',
          dragging ? 'border-ink bg-brand/15' : 'border-border-strong bg-surface-sunken'
        )}
      >
        <UploadSimple size={32} weight="bold" className="text-ink" aria-hidden />
        <span className="text-[15px] font-extrabold text-ink">
          Tap to choose<span className="hidden font-bold text-ink-muted md:inline"> or drop a photo here</span>
        </span>
        <span className="text-[13px] text-ink-muted">PNG, JPG or WebP, up to 5 MB</span>
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={(e) => {
            readFile(e.target.files?.[0]);
            e.target.value = '';
          }}
          disabled={uploading}
        />
      </label>

      {errorBox}

      <div className="flex flex-col gap-ds-2">
        <Button size="lg" block="always" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <UploadSimple size={18} weight="bold" aria-hidden />
          Choose a photo
        </Button>
        {hasAvatar && onRemovePhoto ? (
          confirmRemove ? (
            <div className="flex flex-col gap-ds-2 rounded-ds-card bw-hair border-danger p-ds-3">
              <p className="m-0 text-[14px] font-bold text-ink">Remove your photo? Your initials show instead.</p>
              <div className="flex gap-ds-2">
                <Button variant="outline" className="flex-1" disabled={removing} onClick={() => setConfirmRemove(false)}>
                  Keep it
                </Button>
                <Button variant="danger" className="flex-1" disabled={removing} onClick={() => void remove()}>
                  {removing ? 'Removing…' : 'Remove'}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="lg" block="always" className="text-danger" disabled={uploading} onClick={() => setConfirmRemove(true)}>
              <Trash size={18} weight="bold" aria-hidden />
              Remove photo
            </Button>
          )
        ) : null}
      </div>
    </Sheet>
  );
}
