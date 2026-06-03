"use client";

import { Printer } from "lucide-react";

export function PrintGuideModal({ confirmBrowserPrint, onCancel }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="print-guide-modal" role="dialog" aria-modal="true" aria-labelledby="print-guide-title">
        <div>
          <Printer size={22} />
          <h2 id="print-guide-title">Chrome Print Settings</h2>
          <p>For the browser PDF fallback, use these settings in Chrome before saving.</p>
        </div>
        <ul>
          <li>Destination: Save to PDF</li>
          <li>Paper size: A4</li>
          <li>Margins: None</li>
          <li>Scale: 100</li>
          <li>Options: Background graphics on</li>
        </ul>
        <div className="modal-actions">
          <button className="secondary-button topbar-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button topbar-button" type="button" onClick={confirmBrowserPrint}>
            Open Print Dialog
          </button>
        </div>
      </section>
    </div>
  );
}
