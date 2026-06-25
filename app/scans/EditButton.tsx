"use client";

import { useState } from "react";
import styles from "./scans.module.css";

export default function EditButton({ label, onClick }: { label: string; onClick?: () => void }) {
  const [open, setOpen] = useState(false);
  const opensInternalModal = !onClick;

  return (
    <>
      <button
        type="button"
        className={styles.editBtn}
        aria-label={`Edit ${label}`}
        onClick={() => {
          if (onClick) {
            onClick();
            return;
          }
          setOpen(true);
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>

      {opensInternalModal && open && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${label}`}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className={styles.modalBox}>
            <div className={styles.modalHeader}>
              <h4 className={styles.modalTitle}>Edit: {label}</h4>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <p className={styles.modalNote}>
              Editing fields for <strong>{label}</strong> will be connected to the data layer in the production version.
            </p>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.modalBtnClose} onClick={() => setOpen(false)}>
                Close
              </button>
              <button type="button" className={styles.modalBtnSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
