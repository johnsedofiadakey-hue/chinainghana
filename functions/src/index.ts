import { setGlobalOptions } from "firebase-functions/v2";
import { REGION } from "./shared";

setGlobalOptions({ region: REGION, maxInstances: 10 });

export { createBranch } from "./branches";
export { createStaff, setAdminAccount, updateStaff } from "./staff";
export { placeOrder, updateOrderStatus } from "./orders";
export { recordSale, voidSale } from "./sales";
export { adjustStock } from "./stock";
export { closeDay, importProducts, reopenDay, reviewStockTake, submitStockTake } from "./ops";
export { nightlyBackup, onOrderCreated, onStockAlert, setPushToken } from "./notify";
