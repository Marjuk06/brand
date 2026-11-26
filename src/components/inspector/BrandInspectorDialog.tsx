import { useEffect, useRef, useState } from 'react';
import type {
  BrandCandidate,
  BrandInspectionResponse,
} from '../../types/brand.ts';
import { inspectBrandCandidate } from '../../lib/apiClient.ts';
import { speakBrandPhrase } from '../../lib/speech.ts';
import { CheckIcon, CloseIcon, VolumeIcon } from '../ui/Icons.tsx';
import { haptics } from '../../lib/haptics.ts';

interface BrandInspectorDialogProps {
  candidate: BrandCandidate | null;
  onClose: () => void;
}

export function BrandInspectorDialog({
  candidate,
  onClose,
}: BrandInspectorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [inspection, setInspection] = useState<BrandInspectionResponse | null>(
    null,
  );
  const [loadingTlds, setLoadingTlds] = useState(false);

  // Coordinate-based light-dismiss fallback for browsers without native `closedby`
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleNativeClose = (): void => {
      dialog.returnValue = '';
      onClose();
    };

    dialog.addEventListener('close', handleNativeClose);

    let cleanupFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (event: MouseEvent): void => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const insideBox =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!insideBox) {
          haptics.trigger('toggleOff');
          dialog.close();
        }
      };

      dialog.addEventListener('click', handleBackdropClick);
      cleanupFallback = () =>
        dialog.removeEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleNativeClose);
      cleanupFallback?.();
    };
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (candidate) {
      if (!dialog.open) {
        dialog.showModal();
      }
      setInspection(null);
      setLoadingTlds(true);

      inspectBrandCandidate(candidate.word)
        .then((data) => {
          setInspection(data);
        })
        .catch(() => {
          setInspection(null);
        })
        .finally(() => {
          setLoadingTlds(false);
        });
    } else if (dialog.open) {
      dialog.close();
    }
  }, [candidate]);

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="inspector-dialog-title"
      className="inspector-dialog"
    >
      {candidate && (
        <>
          <div className="dialog-header">
            <div>
              <h1 id="inspector-dialog-title" className="dialog-title">
                {candidate.displayName}{' '}
                <span className="text-muted mono">
                  {candidate.pronunciationHint}
                </span>
              </h1>
              <span className="sub-meta mono">
                {candidate.length} letters · {candidate.syllables} syllables ·
                Score {candidate.smoothnessScore}/99
              </span>
            </div>

            <form method="dialog">
              <button
                type="submit"
                className="btn btn-secondary btn-sm"
                aria-label="Close inspector"
                autoFocus
                onClick={() => haptics.trigger('toggleOff')}
              >
                <CloseIcon size={14} />
                <span>Close</span>
              </button>
            </form>
          </div>

          <div className="dialog-body">
            <div className="cluster">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  haptics.trigger('tap');
                  speakBrandPhrase(candidate.displayName, 'word');
                }}
              >
                <VolumeIcon size={14} />
                <span>Speak Name</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  haptics.trigger('tap');
                  speakBrandPhrase(candidate.displayName, 'team');
                }}
              >
                <VolumeIcon size={14} />
                <span>&ldquo;I work at {candidate.displayName}&rdquo;</span>
              </button>
            </div>

            <div className="info-grid mono">
              <div className="info-tile">
                <span className="field-label">Subdomains</span>
                <div>web.{candidate.domain}</div>
                <div>edu.{candidate.domain}</div>
                <div>design.{candidate.domain}</div>
              </div>

              <div className="info-tile">
                <span className="field-label">Emails</span>
                <div>marjuk@{candidate.domain}</div>
                <div>team@{candidate.domain}</div>
                <div>hello@{candidate.domain}</div>
              </div>
            </div>

            <div>
              <div className="field-label">Extensions</div>
              {loadingTlds ? (
                <p className="sub-meta">Checking live TLDs...</p>
              ) : (
                <div className="tld-grid">
                  {(inspection?.tlds ?? []).map((tldItem) => (
                    <div key={tldItem.domain} className="info-tile mono">
                      <div>{tldItem.domain}</div>
                      <span
                        className={
                          tldItem.status === 'available'
                            ? 'badge badge-available'
                            : tldItem.status === 'taken'
                              ? 'badge badge-taken'
                              : 'badge badge-unknown'
                        }
                      >
                        {tldItem.status === 'available' && (
                          <CheckIcon size={11} />
                        )}
                        <span>{tldItem.status}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(candidate.meaning ||
              (inspection && inspection.definitions.length > 0)) && (
              <div className="info-tile">
                <span className="field-label">
                  Dictionary ({candidate.languageOrigin})
                </span>
                {candidate.meaning && <p>{candidate.meaning}</p>}
                {inspection?.phoneticIpa && (
                  <p className="sub-meta mono">IPA: {inspection.phoneticIpa}</p>
                )}
                {inspection?.definitions.map((def, idx) => (
                  <p key={idx} className="sub-meta">
                    <strong>{def.partOfSpeech}:</strong> {def.definition}
                  </p>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
