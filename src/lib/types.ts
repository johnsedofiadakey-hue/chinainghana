import type { Timestamp } from "firebase/firestore";

export type Role = "superadmin" | "admin" | "manager";
export type Unit = "box" | "piece";
export type OrderStatus = "new" | "confirmed" | "completed" | "cancelled";

export interface WithId {
  id: string;
}

export interface AppSettings {
  businessName: string;
  tagline?: string;
  noticeText: string;
  defaultLowStockPieces: number;
}

export interface License {
  branchLimit: number;
  unlockPriceGHS: number;
  supportWhatsApp: string;
}

export interface Branch extends WithId {
  name: string;
  slug: string;
  code: string;
  address: string;
  landmark?: string;
  ghanaPostGps?: string;
  lat: number;
  lng: number;
  whatsapp: string;
  phone?: string;
  hours?: string;
  active: boolean;
  sortOrder?: number;
}

export interface Category extends WithId {
  name: string;
  icon?: string;
  sortOrder: number;
}

/** A free item given with a product during a promo. Dates are YYYY-MM-DD (Ghana), inclusive. */
export interface FreeGift {
  name: string;
  imageUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface Product extends WithId {
  branchId: string;
  code: string;
  name: string;
  description?: string;
  categoryId: string | null;
  qtyPerBox: number;
  unitLabel: string;
  boxPrice: number;
  piecePrice: number | null;
  sellByPiece: boolean;
  minBoxes: number;
  minPieces: number;
  stockPieces: number;
  lowStockPieces: number | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  tags: string[];
  freeGift?: FreeGift | null;
  visible: boolean;
  searchText?: string;
  updatedAt?: Timestamp;
}

export interface LineItem {
  productId: string;
  code: string;
  name: string;
  unit: Unit;
  unitLabel: string;
  qty: number;
  pieces: number;
  unitPrice: number;
  lineTotal: number;
  thumb: string | null;
  /** Free gift included with this line (set by the server when the promo is on). */
  gift?: string | null;
}

export interface Order extends WithId {
  orderNo: string;
  branchId: string;
  branchName: string;
  customer: { name: string; phone: string; businessName?: string };
  note?: string;
  items: LineItem[];
  itemCount: number;
  total: number;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: Timestamp; by: string | null; reason?: string | null }[];
  saleId: string | null;
  receiptNo?: string;
  waMessage?: string;
  createdAt?: Timestamp;
}

export interface Sale extends WithId {
  receiptNo: string;
  branchId: string;
  branchName: string;
  source: "walkin" | "order";
  orderId: string | null;
  orderNo: string | null;
  customer: { name: string; phone: string };
  items: LineItem[];
  total: number;
  piecesSold: number;
  voided: boolean;
  voidReason: string | null;
  byUid: string;
  createdAt?: Timestamp;
}

export interface DailySummary extends WithId {
  branchId: string;
  date: string;
  salesTotal?: number;
  salesCount?: number;
  walkinTotal?: number;
  orderTotal?: number;
  ordersNew?: number;
  ordersCompleted?: number;
  ordersCancelled?: number;
  piecesSold?: number;
  voidCount?: number;
  voidTotal?: number;
  closed?: boolean;
  closedByName?: string;
  closedAt?: Timestamp;
  closingNote?: string;
  cashCounted?: number | null;
  salesAtClose?: number;
}

export type StockTakeStatus = "submitted" | "applying" | "approved" | "rejected";

export interface StockTakeLine {
  productId: string;
  code: string;
  name: string;
  qtyPerBox: number;
  unitLabel: string;
  expectedPieces: number;
  countedPieces: number;
  variance: number;
  unitCost: number;
}

export interface StockTake extends WithId {
  branchId: string;
  status: StockTakeStatus;
  scope: string;
  note: string;
  lines: StockTakeLine[];
  productsCounted: number;
  varianceLines: number;
  variancePieces: number;
  varianceValue: number;
  submittedByName: string;
  reviewNote?: string;
  createdAt?: Timestamp;
  reviewedAt?: Timestamp;
}

export interface StockAlert extends WithId {
  branchId: string;
  productId: string;
  productName: string;
  code: string;
  type: "low_stock" | "out_of_stock";
  stockPieces: number;
  threshold: number;
  resolved: boolean;
}

export interface StaffUser extends WithId {
  name: string;
  username: string;
  phone?: string;
  role: Role;
  branchId: string | null;
  branchName?: string | null;
  active: boolean;
  mustChangePassword: boolean;
}

export interface StockMovement extends WithId {
  branchId: string;
  productId: string;
  productName: string;
  type: string;
  qtyPieces: number;
  balanceAfter: number;
  reason: string | null;
  createdAt?: Timestamp;
}

export interface AuditEntry extends WithId {
  actorUid: string;
  action: string;
  target: string;
  branchId: string | null;
  details?: Record<string, unknown>;
  at?: Timestamp;
}
