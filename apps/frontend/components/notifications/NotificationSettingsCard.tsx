"use client";

import { Card } from "@delegolabs/ui";
import { useOsNotifications } from "../../hooks/useOsNotifications";
import {
  useNotifications,
  type NotificationRetention,
} from "../../hooks/useNotifications";
import { useWebPush } from "../../hooks/useWebPush";

export function NotificationSettingsCard() {
  const { supported, permission, enabled, setEnabled, requestPermission } =
    useOsNotifications();
  const {
    retention,
    setRetention,
    groupingEnabled,
    setGroupingEnabled,
    quietHours,
    setQuietHours,
  } = useNotifications();
  const {
    supported: pushSupported,
    status: pushStatus,
    subscribe: pushSubscribe,
    unsubscribe: pushUnsubscribe,
    sendTest: pushSendTest,
    error: pushError,
  } = useWebPush();

  const handleToggle = async (checked: boolean) => {
    if (!checked) {
      setEnabled(false);
      return;
    }
    if (permission === "granted") {
      setEnabled(true);
      return;
    }
    const result = await requestPermission();
    setEnabled(result === "granted");
  };

  const handlePushToggle = async (checked: boolean) => {
    if (!checked) {
      await pushUnsubscribe();
    } else {
      await pushSubscribe([]);
    }
  };

  const handleDayToggle = (dayIndex: number) => {
    if (!quietHours) return;
    const currentDays = quietHours.daysOfWeek || [];
    const updatedDays = currentDays.includes(dayIndex)
      ? currentDays.filter((d) => d !== dayIndex)
      : [...currentDays, dayIndex].sort();
    setQuietHours({ ...quietHours, daysOfWeek: updatedDays });
  };

  const DAYS = [
    { label: "Sun", value: 0 },
    { label: "Mon", value: 1 },
    { label: "Tue", value: 2 },
    { label: "Wed", value: 3 },
    { label: "Thu", value: 4 },
    { label: "Fri", value: 5 },
    { label: "Sat", value: 6 },
  ];

  return (
    <Card title="Notification settings" ariaLabel="Notification settings">
      <div className="settings-section space-y-6">
        {/* Threading / Grouping Selector (#604) */}
        <div className="settings-toggle-row flex justify-between items-start">
          <span>
            <span
              className="settings-toggle-label font-semibold block"
              id="grouping-label"
            >
              Thread notifications by delegation
            </span>
            <p className="settings-toggle-hint text-xs text-secondary">
              Group notification center entries into collapsible stacks by
              delegation ID with unread count rollups.
            </p>
          </span>
          {setGroupingEnabled && (
            <input
              type="checkbox"
              checked={groupingEnabled}
              onChange={(e) => setGroupingEnabled(e.target.checked)}
              aria-labelledby="grouping-label"
              style={{
                width: "1.125rem",
                height: "1.125rem",
                marginTop: "0.25rem",
              }}
            />
          )}
        </div>

        {/* Quiet Hours Schedule (#602) */}
        {quietHours && setQuietHours && (
          <div className="quiet-hours-settings border-t pt-4 border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex justify-between items-start">
              <span>
                <span
                  className="settings-toggle-label font-semibold block"
                  id="quiet-hours-label"
                >
                  Quiet hours schedule
                </span>
                <p className="settings-toggle-hint text-xs text-secondary">
                  Mute routine notifications during scheduled hours. Suppressed
                  items are queued visibly in the notification center.
                </p>
              </span>
              <input
                type="checkbox"
                checked={quietHours.enabled}
                onChange={(e) =>
                  setQuietHours({ ...quietHours, enabled: e.target.checked })
                }
                aria-labelledby="quiet-hours-label"
                style={{
                  width: "1.125rem",
                  height: "1.125rem",
                  marginTop: "0.25rem",
                }}
              />
            </div>

            {quietHours.enabled && (
              <div className="quiet-hours-details pl-4 space-y-3 border-l-2 border-slate-200 dark:border-slate-800">
                <div className="flex gap-4 items-center text-sm">
                  <label className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">Start:</span>
                    <input
                      type="time"
                      value={quietHours.startTime}
                      onChange={(e) =>
                        setQuietHours({
                          ...quietHours,
                          startTime: e.target.value,
                        })
                      }
                      className="px-2 py-1 border rounded text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">End:</span>
                    <input
                      type="time"
                      value={quietHours.endTime}
                      onChange={(e) =>
                        setQuietHours({
                          ...quietHours,
                          endTime: e.target.value,
                        })
                      }
                      className="px-2 py-1 border rounded text-xs"
                    />
                  </label>
                </div>

                <div>
                  <span className="text-xs font-medium block mb-1">
                    Active days:
                  </span>
                  <div className="flex gap-1.5">
                    {DAYS.map((day) => {
                      const isActive = quietHours.daysOfWeek.includes(
                        day.value
                      );
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => handleDayToggle(day.value)}
                          className={`px-2 py-1 rounded text-xs font-medium border transition ${
                            isActive
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={quietHours.bypassApprovals}
                    onChange={(e) =>
                      setQuietHours({
                        ...quietHours,
                        bypassApprovals: e.target.checked,
                      })
                    }
                  />
                  <span>
                    Always allow urgent approval alerts to pierce quiet hours
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Retention Selector (#605) */}
        <div className="settings-toggle-row flex justify-between items-start border-t pt-4 border-slate-200 dark:border-slate-800">
          <span>
            <span
              className="settings-toggle-label font-semibold block"
              id="retention-label"
            >
              Notification retention period
            </span>
            <p className="settings-toggle-hint text-xs text-secondary">
              Automatically clean up read notifications older than the selected
              timeframe. Unread notifications are kept until read regardless of
              age.
            </p>
          </span>
          <select
            value={retention}
            onChange={(e) =>
              setRetention(e.target.value as NotificationRetention)
            }
            aria-labelledby="retention-label"
            style={{
              padding: "0.375rem 0.625rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-surface)",
              color: "var(--color-text-primary)",
              fontSize: "0.875rem",
            }}
          >
            <option value="7">7 days</option>
            <option value="30">30 days (default)</option>
            <option value="90">90 days</option>
            <option value="all">Keep all</option>
          </select>
        </div>

        {/* Desktop Notifications Toggle */}
        {supported && (
          <label className="settings-toggle-row flex justify-between items-start border-t pt-4 border-slate-200 dark:border-slate-800">
            <span>
              <span className="settings-toggle-label font-semibold block">
                Notify me about approvals when this tab isn&apos;t in focus
              </span>
              <p className="settings-toggle-hint text-xs text-secondary">
                {permission === "denied"
                  ? "Blocked in your browser settings — enable notifications for this site to use this."
                  : "Uses your browser's native notifications. You can turn this off at any time."}
              </p>
            </span>
            <input
              type="checkbox"
              checked={enabled && permission === "granted"}
              disabled={permission === "denied"}
              onChange={(e) => handleToggle(e.target.checked)}
              style={{
                width: "1.125rem",
                height: "1.125rem",
                marginTop: "0.25rem",
              }}
            />
          </label>
        )}

        {/* Web Push — order shipment & delivery alerts (#web-push) */}
        {pushSupported && (
          <div className="settings-toggle-row border-t pt-4 border-slate-200 dark:border-slate-800 space-y-2">
            <label className="flex justify-between items-start">
              <span>
                <span
                  className="settings-toggle-label font-semibold block"
                  id="web-push-label"
                >
                  Package scan &amp; delivery alerts
                </span>
                <p className="settings-toggle-hint text-xs text-secondary">
                  {pushStatus === "denied"
                    ? "Blocked in your browser settings — enable notifications for this site to use this."
                    : "Get a browser push notification whenever a package is scanned or delivered, even with this tab closed."}
                </p>
              </span>
              <input
                type="checkbox"
                checked={pushStatus === "subscribed"}
                disabled={
                  pushStatus === "denied" ||
                  pushStatus === "loading" ||
                  pushStatus === "requesting"
                }
                onChange={(e) => handlePushToggle(e.target.checked)}
                aria-labelledby="web-push-label"
                style={{
                  width: "1.125rem",
                  height: "1.125rem",
                  marginTop: "0.25rem",
                }}
              />
            </label>

            {/* Error feedback */}
            {pushStatus === "error" && pushError && (
              <p
                role="alert"
                className="text-xs text-red-600 dark:text-red-400"
              >
                {pushError}
              </p>
            )}

            {/* Send-test button — only visible while subscribed */}
            {pushStatus === "subscribed" && (
              <button
                type="button"
                onClick={() => pushSendTest()}
                className="text-xs text-indigo-600 dark:text-indigo-400 underline hover:no-underline"
              >
                Send a test notification
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
