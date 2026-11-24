import { apiDelete, apiGet, apiPost } from "../../shared/api/client";
import type { CreatedDayOffRequest, DayOffRequest, RecordDaysOffResult } from "./types";

// An employee gets only their own requests; an admin gets the whole organization's,
// or one employee's when employeeId is given
export async function fetchDayOffRequests(
  employeeId?: string,
): Promise<DayOffRequest[]> {
  const url = employeeId
    ? `/api/day-off-requests?employee_id=${encodeURIComponent(employeeId)}`
    : "/api/day-off-requests";
  const response = await apiGet(url);
  if (!response.ok) throw new Error("Could not load day-off requests.");
  return response.json();
}

export async function createDayOffRequest(
  date: string,
  reason: string,
): Promise<CreatedDayOffRequest> {
  const response = await apiPost("/api/day-off-requests", { date, reason });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.error || "Could not submit the request.");
  return data;
}

export async function cancelDayOffRequest(id: string): Promise<void> {
  const response = await apiPost("/api/day-off-requests/cancel", { id });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Could not cancel the request.");
  }
}

export async function approveDayOffRequest(id: string, isPaid: boolean): Promise<void> {
  const response = await apiPost(`/api/day-off-requests/${id}/approve`, { is_paid: isPaid });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Could not approve the request.");
  }
}

export async function rejectDayOffRequest(id: string): Promise<void> {
  const response = await apiPost(`/api/day-off-requests/${id}/reject`);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Could not reject the request.");
  }
}

// Admin recording that a staff member was off, directly - no request/approval step, past dates allowed.
export async function recordDaysOff(employeeId: string, from: string, to: string, isPaid: boolean): Promise<RecordDaysOffResult> {
  const response = await apiPost("/api/day-off-requests/record", { employee_id: employeeId, from, to, is_paid: isPaid });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Could not record the days off.");
  return data;
}

// Admin removing a recorded or approved day off, in case of a mistake.
export async function deleteDayOffRequest(id: string): Promise<void> {
  const response = await apiDelete(`/api/day-off-requests/${id}`);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Could not delete the day off.");
  }
}
