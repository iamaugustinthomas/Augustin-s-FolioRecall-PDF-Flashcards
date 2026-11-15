import React, { useEffect, useRef, useState } from 'react';
import { Download, Upload, Trash2, X } from 'lucide-react';
import {
  clearAllLocalData,
  estimateStorageFootprint,
  exportBackup,
  importBackup,
  type BackupPayload,
} from '../lib/storage';
import { resetRewardProfile } from '../lib/rewards';

interface StorageModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckCount: number;
  cardCount: number;
  sessionCount: number;
  onDataChanged: () => Promise<void>;
}

export const StorageModal: React.FC<StorageModalProps> = ({
  isOpen,
  onClose,
  deckCount,
  cardCount,
  sessionCount,
  onDataChanged,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [usedBytes, setUsedBytes] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setConfirmClear(false);
    setStatusMessage(null);
    void estimateStorageFootprint().then((res) => setUsedBytes(res.usedBytes));
  }, [isOpen]);

  if (!isOpen) return null;

  const formatBytes = (bytes: number | null) => {
    if (bytes === null) return 'Available';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleExport = async () => {
    const payload = await exportBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `foliorecall-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Backup downloaded.');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;
      await importBackup(parsed);
      await onDataChanged();
      setStatusMessage('Backup restored.');
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : 'Failed to import backup file.'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleWipe = async () => {
    await clearAllLocalData();
    resetRewardProfile();
    await onDataChanged();
    setConfirmClear(false);
    setStatusMessage('All local data cleared.');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#1F1A14]/45 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="storage-modal-title"
    >
      <div className="paper-sheet rounded-lg max-w-md w-full p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#E3DDD0]">
          <div>
            <h2
              id="storage-modal-title"
              className="font-serif-display text-xl font-semibold text-[#1F1A14]"
            >
              On-Device Vault
            </h2>
            <p className="font-mono text-xs text-[#6B6153] mt-0.5">
              Stored privately in browser IndexedDB.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close storage dialog"
            onClick={onClose}
            className="p-1.5 text-[#7A6F5E] hover:text-[#1F1A14] cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="recessed-well rounded-lg grid grid-cols-4 divide-x divide-[#C3BBA9] text-center py-3">
          <div>
            <p className="font-mono text-base font-semibold text-[#1F1A14] tabular-nums">
              {deckCount}
            </p>
            <p className="text-[11px] font-medium text-[#564D40]">Decks</p>
          </div>
          <div>
            <p className="font-mono text-base font-semibold text-[#1F1A14] tabular-nums">
              {cardCount}
            </p>
            <p className="text-[11px] font-medium text-[#564D40]">Cards</p>
          </div>
          <div>
            <p className="font-mono text-base font-semibold text-[#1F1A14] tabular-nums">
              {sessionCount}
            </p>
            <p className="text-[11px] font-medium text-[#564D40]">Quizzes</p>
          </div>
          <div>
            <p className="font-mono text-sm font-semibold text-[#1F1A14] tabular-nums pt-0.5">
              {formatBytes(usedBytes)}
            </p>
            <p className="text-[11px] font-medium text-[#564D40]">Used</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="px-4 py-2 text-xs font-semibold rounded-md btn-ivory-tactile inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export Backup</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 text-xs font-semibold rounded-md btn-ivory-tactile inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Restore Backup</span>
          </button>
        </div>

        <div className="pt-3 border-t border-[#E3DDD0] flex items-center justify-between gap-3">
          {confirmClear ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleWipe()}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-b from-[#DF3333] to-[#B11A1A] border border-[#8E1212] rounded-md cursor-pointer"
              >
                Confirm Erase
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2 py-1.5 text-xs text-[#6B6153] hover:text-[#1F1A14] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="text-xs font-semibold text-[#B91C1C] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Erase All Data</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 text-xs font-semibold rounded-md btn-primary-tactile cursor-pointer"
          >
            Done
          </button>
        </div>

        {statusMessage && (
          <p className="font-mono text-xs font-medium text-[#174BB8]">{statusMessage}</p>
        )}
      </div>
    </div>
  );
};
