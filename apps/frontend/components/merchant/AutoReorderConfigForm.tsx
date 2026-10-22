"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@delegolabs/ui";
import {
  DEFAULT_AUTO_REORDER_CONFIG,
  loadAutoReorderConfig,
  saveAutoReorderConfig,
  validateAutoReorderConfig,
  pingSupplierEndpoint,
  maskAuthHeader,
  type AutoReorderConfig,
  type AutoReorderValidationErrors,
} from "../../lib/autoReorder";

export interface AutoReorderConfigFormProps {
  initialConfig?: AutoReorderConfig;
  onSave?: (config: AutoReorderConfig) => void;
  className?: string;
}

type PingStatus = "idle" | "pinging" | "success" | "error";

export function AutoReorderConfigForm({
  initialConfig,
  onSave,
  className,
}: AutoReorderConfigFormProps) {
  const [config, setConfig] = useState<AutoReorderConfig>(
    initialConfig ?? DEFAULT_AUTO_REORDER_CONFIG
  );
  const [authRawInput, setAuthRawInput] = useState<string>("");
  const [isEditingAuth, setIsEditingAuth] = useState<boolean>(false);
  const [errors, setErrors] = useState<AutoReorderValidationErrors>({});
  const [pingStatus, setPingStatus] = useState<PingStatus>("idle");
  const [pingMessage, setPingMessage] = useState<string>("");
  const [saved, setSaved] = useState<boolean>(false);

  useEffect(() => {
    if (!initialConfig) {
      const loaded = loadAutoReorderConfig();
      setConfig(loaded);
    }
  }, [initialConfig]);

  const handleUrlChange = (value: string) => {
    setConfig((prev) => ({ ...prev, supplierWebhookUrl: value }));
    setSaved(false);
    if (errors.supplierWebhookUrl) {
      setErrors((prev) => ({ ...prev, supplierWebhookUrl: undefined }));
    }
  };

  const handleThresholdChange = (value: string) => {
    const parsed = value === "" ? 0 : Number(value);
    setConfig((prev) => ({ ...prev, minimumThreshold: parsed }));
    setSaved(false);
    if (errors.minimumThreshold) {
      setErrors((prev) => ({ ...prev, minimumThreshold: undefined }));
    }
  };

  const handleQuantityChange = (value: string) => {
    const parsed = value === "" ? 0 : Number(value);
    setConfig((prev) => ({ ...prev, reorderQuantity: parsed }));
    setSaved(false);
    if (errors.reorderQuantity) {
      setErrors((prev) => ({ ...prev, reorderQuantity: undefined }));
    }
  };

  const handleAuthChange = (value: string) => {
    setAuthRawInput(value);
    setSaved(false);
  };

  const handleAuthBlur = () => {
    setIsEditingAuth(false);
    if (authRawInput.trim()) {
      const masked = maskAuthHeader(authRawInput.trim());
      setConfig((prev) => ({ ...prev, authHeaderMasked: masked }));
    }
  };

  const handleToggleEnabled = () => {
    setConfig((prev) => {
      const nextEnabled = !prev.isEnabled;
      return { ...prev, isEnabled: nextEnabled };
    });
    setSaved(false);
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const configToValidate: AutoReorderConfig = {
      ...config,
      authHeaderMasked: isEditingAuth && authRawInput.trim()
        ? maskAuthHeader(authRawInput.trim())
        : config.authHeaderMasked,
    };

    const { isValid, errors: validationErrors } = validateAutoReorderConfig(configToValidate);
    setErrors(validationErrors);

    if (!isValid) {
      setSaved(false);
      return;
    }

    setConfig(configToValidate);
    saveAutoReorderConfig(configToValidate);
    setSaved(true);
    if (onSave) {
      onSave(configToValidate);
    }
  };

  const handleMockPing = async () => {
    setPingStatus("pinging");
    setPingMessage("");

    const targetUrl = config.supplierWebhookUrl.trim();
    if (!targetUrl) {
      setPingStatus("error");
      setPingMessage("Enter a supplier webhook URL before testing connectivity.");
      return;
    }

    const authToSend = isEditingAuth && authRawInput.trim()
      ? authRawInput.trim()
      : config.authHeaderMasked;

    const result = await pingSupplierEndpoint(targetUrl, authToSend);
    if (result.ok) {
      setPingStatus("success");
      setPingMessage(result.message || "Supplier endpoint reachable");
    } else {
      setPingStatus("error");
      setPingMessage(result.message || "Supplier endpoint unreachable");
    }
  };

  return (
    <Card className={className} data-testid="auto-reorder-config-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
            Automated Supplier Reorder Webhook
          </h3>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#6b7280" }}>
            Ping your external ERP/supplier endpoint whenever inventory breaches minimum safety thresholds.
          </p>
        </div>
        <div>
          {config.isEnabled ? (
            <Badge tone="success" data-testid="auto-reorder-status-badge">Enabled</Badge>
          ) : (
            <Badge tone="neutral" data-testid="auto-reorder-status-badge">Disabled</Badge>
          )}
        </div>
      </div>

      <form
        noValidate
        onSubmit={handleSave}
        style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}
        data-testid="auto-reorder-form"
      >
        {/* Enable / Disable switch */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          <input
            type="checkbox"
            role="switch"
            checked={config.isEnabled}
            aria-checked={config.isEnabled}
            onChange={handleToggleEnabled}
            data-testid="auto-reorder-toggle"
          />
          Enable Automated Supplier Restock Hooks
        </label>

        {/* Supplier Webhook URL */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label htmlFor="supplier-webhook-url" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            Supplier Webhook URL
          </label>
          <input
            id="supplier-webhook-url"
            name="supplierWebhookUrl"
            type="url"
            value={config.supplierWebhookUrl}
            placeholder="https://erp.supplier.example.com/api/restock"
            aria-label="Supplier Webhook URL"
            aria-invalid={Boolean(errors.supplierWebhookUrl)}
            aria-describedby={errors.supplierWebhookUrl ? "webhook-url-error" : undefined}
            onChange={(e) => handleUrlChange(e.target.value)}
            data-testid="supplier-webhook-url-input"
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              border: `1px solid ${errors.supplierWebhookUrl ? "#dc2626" : "#d1d5db"}`,
              fontSize: "0.875rem",
              width: "100%",
            }}
          />
          {errors.supplierWebhookUrl && (
            <span id="webhook-url-error" role="alert" style={{ fontSize: "0.75rem", color: "#dc2626" }} data-testid="supplier-webhook-url-error">
              {errors.supplierWebhookUrl}
            </span>
          )}
          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            The HTTPS REST endpoint on your external ERP or supplier receiving stock depletion payloads.
          </span>
        </div>

        {/* Authorization Header */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <label htmlFor="auth-header" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            Authorization Header
          </label>
          {isEditingAuth ? (
            <input
              id="auth-header"
              name="authHeader"
              type="text"
              value={authRawInput}
              placeholder="Bearer your-supplier-api-token"
              aria-label="Authorization Header"
              onChange={(e) => handleAuthChange(e.target.value)}
              onBlur={handleAuthBlur}
              autoFocus
              data-testid="auth-header-input"
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid #d1d5db",
                fontSize: "0.875rem",
                width: "100%",
              }}
            />
          ) : (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                id="auth-header"
                name="authHeaderMasked"
                type="text"
                readOnly
                value={config.authHeaderMasked || ""}
                placeholder="None configured"
                aria-label="Authorization Header (Masked)"
                onClick={() => {
                  setIsEditingAuth(true);
                  setAuthRawInput("");
                }}
                data-testid="auth-header-masked-input"
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #d1d5db",
                  backgroundColor: "#f9fafb",
                  fontSize: "0.875rem",
                  width: "100%",
                  cursor: "pointer",
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsEditingAuth(true);
                  setAuthRawInput("");
                }}
                data-testid="auth-header-edit-button"
              >
                {config.authHeaderMasked ? "Update" : "Set Auth"}
              </Button>
            </div>
          )}
          <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            Sent via the Authorization header for protected supplier endpoints. Secret is masked when saved.
          </span>
        </div>

        {/* Grid for Threshold and Quantity */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          {/* Minimum Threshold */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label htmlFor="minimum-threshold" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
              Minimum Safety Threshold
            </label>
            <input
              id="minimum-threshold"
              name="minimumThreshold"
              type="number"
              min={0}
              step={1}
              value={config.minimumThreshold}
              aria-label="Minimum Safety Threshold"
              aria-invalid={Boolean(errors.minimumThreshold)}
              aria-describedby={errors.minimumThreshold ? "threshold-error" : undefined}
              onChange={(e) => handleThresholdChange(e.target.value)}
              data-testid="minimum-threshold-input"
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: `1px solid ${errors.minimumThreshold ? "#dc2626" : "#d1d5db"}`,
                fontSize: "0.875rem",
              }}
            />
            {errors.minimumThreshold && (
              <span id="threshold-error" role="alert" style={{ fontSize: "0.75rem", color: "#dc2626" }} data-testid="minimum-threshold-error">
                {errors.minimumThreshold}
              </span>
            )}
            <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
              Triggers webhook when available units fall to or below this count.
            </span>
          </div>

          {/* Reorder Quantity */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label htmlFor="reorder-quantity" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
              Reorder Quantity
            </label>
            <input
              id="reorder-quantity"
              name="reorderQuantity"
              type="number"
              min={1}
              step={1}
              value={config.reorderQuantity}
              aria-label="Reorder Quantity"
              aria-invalid={Boolean(errors.reorderQuantity)}
              aria-describedby={errors.reorderQuantity ? "quantity-error" : undefined}
              onChange={(e) => handleQuantityChange(e.target.value)}
              data-testid="reorder-quantity-input"
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: `1px solid ${errors.reorderQuantity ? "#dc2626" : "#d1d5db"}`,
                fontSize: "0.875rem",
              }}
            />
            {errors.reorderQuantity && (
              <span id="quantity-error" role="alert" style={{ fontSize: "0.75rem", color: "#dc2626" }} data-testid="reorder-quantity-error">
                {errors.reorderQuantity}
              </span>
            )}
            <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
              Units requested in the webhook payload dispatched to supplier.
            </span>
          </div>
        </div>

        {/* Mock Ping / Connectivity status display */}
        {pingStatus !== "idle" && (
          <div
            role="status"
            aria-live="polite"
            data-testid="mock-ping-status"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.625rem 0.875rem",
              borderRadius: "0.5rem",
              fontSize: "0.8125rem",
              background: pingStatus === "success" ? "#ecfdf5" : pingStatus === "error" ? "#fef2f2" : "#f3f4f6",
              color: pingStatus === "success" ? "#065f46" : pingStatus === "error" ? "#991b1b" : "#374151",
              border: `1px solid ${pingStatus === "success" ? "#a7f3d0" : pingStatus === "error" ? "#fecaca" : "#e5e7eb"}`,
            }}
          >
            {pingStatus === "pinging" && <span>Testing connection to supplier endpoint…</span>}
            {pingStatus === "success" && <strong>✓ {pingMessage}</strong>}
            {pingStatus === "error" && <strong>✕ {pingMessage}</strong>}
          </div>
        )}

        {/* Buttons / Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
          <Button
            type="submit"
            variant="primary"
            data-testid="save-auto-reorder-button"
          >
            Save Configuration
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={handleMockPing}
            disabled={pingStatus === "pinging"}
            data-testid="mock-ping-button"
          >
            {pingStatus === "pinging" ? "Pinging…" : "Mock Ping"}
          </Button>

          {saved && (
            <Badge tone="success" data-testid="auto-reorder-saved-badge">
              Configuration Saved
            </Badge>
          )}
        </div>
      </form>
    </Card>
  );
}
