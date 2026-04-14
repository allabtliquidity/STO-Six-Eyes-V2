const BASE = "/api";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const getTrades = (params?: Record<string, string>) =>
  req<any[]>(`/trades${params ? "?" + new URLSearchParams(params) : ""}`);
export const createTrade = (body: any) => req<any>("/trades", { method: "POST", body: JSON.stringify(body) });
export const updateTrade = (id: number, body: any) => req<any>(`/trades/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteTrade = (id: number) => req<void>(`/trades/${id}`, { method: "DELETE" });
export const gradeTrade = (id: number) => req<any>(`/trades/${id}/grade`, { method: "POST" });

export const getStrategies = () => req<any[]>("/strategies");
export const createStrategy = (body: any) => req<any>("/strategies", { method: "POST", body: JSON.stringify(body) });
export const deleteStrategy = (id: number) => req<void>(`/strategies/${id}`, { method: "DELETE" });
export const activateStrategy = (id: number) => req<any>(`/strategies/${id}/activate`, { method: "POST" });
export const getStrategyStats = (id: number) => req<any>(`/strategies/${id}/stats`);

export const getKnowledge = (strategyId?: number) =>
  req<any[]>(`/knowledge${strategyId ? `?strategy_id=${strategyId}` : ""}`);
export const createKnowledge = (body: any) => req<any>("/knowledge", { method: "POST", body: JSON.stringify(body) });
export const deleteKnowledge = (id: number) => req<void>(`/knowledge/${id}`, { method: "DELETE" });

export const getDashboardStats = (period?: string) =>
  req<any>(`/dashboard/stats${period ? `?period=${period}` : ""}`);
export const getPnlCalendar = (month?: number, year?: number) =>
  req<any[]>(`/dashboard/pnl-calendar?month=${month}&year=${year}`);

export const getMarketPrices = (symbols?: string) =>
  req<any[]>(`/market/prices${symbols ? `?symbols=${symbols}` : ""}`);

export const getNews = (params?: Record<string, string>) =>
  req<any[]>(`/news${params ? "?" + new URLSearchParams(params) : ""}`);

export const getObservations = (params?: any) =>
  req<any[]>(`/discretion${params ? "?" + new URLSearchParams(params) : ""}`);
export const createObservation = (body: any) => req<any>("/discretion", { method: "POST", body: JSON.stringify(body) });
export const deleteObservation = (id: number) => req<void>(`/discretion/${id}`, { method: "DELETE" });

export const getBacktests = () => req<any[]>("/backtests");
export const runBacktest = (body: any) => req<any>("/backtests/run", { method: "POST", body: JSON.stringify(body) });
export const deleteBacktest = (id: number) => req<void>(`/backtests/${id}`, { method: "DELETE" });
export const clearBacktests = () => req<void>("/backtests", { method: "DELETE" });
