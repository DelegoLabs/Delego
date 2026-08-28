import type { IssueCategory } from "@delego/types";
import type { SelectOption } from "@delego/ui";

export const ISSUE_CATEGORY_OPTIONS: SelectOption[] = [
  { value: "late", label: "Item arrived late" },
  { value: "damaged", label: "Item arrived damaged" },
  { value: "not_received", label: "Item never received" },
  { value: "other", label: "Something else" },
];

export const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> = {
  late: "Late",
  damaged: "Damaged",
  not_received: "Not received",
  other: "Other",
};

export function isIssueCategory(value: string | undefined | null): value is IssueCategory {
  return value === "late" || value === "damaged" || value === "not_received" || value === "other";
}
