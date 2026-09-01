export interface SystemSettings {
  appTitle: string;
  agencyName: string;
  regionalOffice: string;
  ministry: string;
  address: string;
  phone: string;
  maxDailyRegistrations: number;
  maxDailyVisitors: number;
  openDays: number[]; // 1 = Senin, ..., 6 = Sabtu
  closedDays: number[]; // 5 = Jumat, 7 = Minggu
  closedSpecialDates: string[]; // YYYY-MM-DD
  visitingHoursWeekday: {
    session1: { start: string; end: string };
    session2: { start: string; end: string };
  };
  visitingHoursSaturday: {
    session1: { start: string; end: string };
  };
  ticketCustomNotes: string;
  proofCustomNotes: string;
  welcomeGreetingText: string;
  showCellLocationToPublic: boolean;
  defaultVisitDurationMinutes: number;
}

export interface LuggageCategory {
  id: string; // ITM 001
  name: string;
  unit: string;
  maxQuantity: number;
  isCurrency: boolean;
  active: boolean;
}
