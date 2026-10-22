"use client";

import Link from "next/link";
import { Button } from "@delegolabs/ui";
import { SavedAddressesManager } from "../../../components/settings/SavedAddressesManager";

export default function AddressesSettingsPage() {
  return (
    <div className="settings-page" style={{ maxWidth: "48rem", margin: "0 auto", padding: "1.5rem" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/settings" style={{ textDecoration: "none" }}>
          <Button variant="secondary" type="button">
            ← Back to Settings
          </Button>
        </Link>
      </div>

      <SavedAddressesManager />
    </div>
  );
}
