/**
 * Staff guide content, shown in-app at /admin/help and /manager/help.
 * Keep it in plain language and in step with the screens: if a feature changes, update its topic here.
 * Links use "~" for the area base path ("/admin" or "/manager").
 */

export type Audience = "admin" | "manager";

export type HelpIcon =
  | "start"
  | "orders"
  | "sales"
  | "products"
  | "stock"
  | "branches"
  | "team"
  | "reports"
  | "phone";

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  steps?: string[];
  tips?: string[];
  /** Who sees this topic. Omit for everyone. */
  only?: Audience;
  link?: { href: string; label: string; only?: Audience };
}

export interface HelpSection {
  id: string;
  title: string;
  icon: HelpIcon;
  topics: HelpTopic[];
}

export interface QuickStep {
  title: string;
  body: string;
  href?: string;
}

export const QUICK_START: Record<Audience, QuickStep[]> = {
  admin: [
    { title: "Check your branches", body: "Make sure each branch has the right address, map pin and WhatsApp number for orders.", href: "~/branches" },
    { title: "Add a manager for each branch", body: "Give them their username and temporary password. They set their own password on first sign-in.", href: "~/staff" },
    { title: "Add products and prices", body: "One by one, or all at once from an Excel sheet. Products belong to one branch.", href: "~/products" },
    { title: "Enter real stock", body: "Customers can only order what's in stock. Use Stock → Receive on each product.", href: "~/products" },
    { title: "Turn on alerts on your phone", body: "Get a notification the moment a new order arrives. See \"Alerts on your phone\" below." },
    { title: "Share the shop link", body: "Post it on WhatsApp Status, groups and social media. Customers are sent to their nearest branch." },
  ],
  manager: [
    { title: "Set your own password", body: "The first time you sign in you'll be asked to replace the temporary password." },
    { title: "Check your branch WhatsApp number", body: "Customer orders for your branch are sent to this number.", href: "~/branch" },
    { title: "Turn on alerts on your phone", body: "Get a notification the moment a new order arrives. See \"Alerts on your phone\" below." },
    { title: "Check products and stock", body: "Make sure prices are right and stock matches the shelves.", href: "~/products" },
    { title: "Handle orders and record sales every day", body: "Complete WhatsApp orders and record walk-in sales so stock stays correct.", href: "~/orders" },
    { title: "Close the day", body: "At closing time, check the day's totals and count the cash.", href: "~/close" },
  ],
};

export const SECTIONS: HelpSection[] = [
  {
    id: "basics",
    title: "Getting started",
    icon: "start",
    topics: [
      {
        id: "sign-in",
        title: "Signing in and your password",
        summary: "Staff sign in with a username, not an email. Nobody else can see your password.",
        steps: [
          "Open the shop and tap Admin portal at the very bottom of the page, or go straight to the /login page.",
          "Type your username and password, then tap Sign in.",
          "The first time, you'll be asked to choose your own password. Use at least 8 characters.",
          "To change it later, open the menu and tap Change password.",
        ],
        tips: [
          "Forgot your password? Managers: ask the admin to reset it. The admin can reset it from Managers → Edit.",
          "Always sign out on shared or borrowed phones.",
        ],
      },
      {
        id: "install",
        title: "Put the app on your phone",
        summary: "Add the shop to your home screen so it opens like an app, even on a weak connection.",
        steps: [
          "Android (Chrome): open the site, tap the ⋮ menu, then Install app or Add to Home screen.",
          "iPhone (Safari): open the site, tap the Share button, then Add to Home Screen.",
          "Open it from the new icon on your home screen from now on.",
        ],
        tips: ["On iPhone, alerts only work when the app is opened from the home-screen icon."],
      },
      {
        id: "alerts",
        title: "Alerts on your phone",
        summary: "Get a notification for every new order and when stock runs low.",
        steps: [
          "Open the Dashboard (Today for managers).",
          "On the card Get alerts on this device, tap to turn it on.",
          "When the phone asks, tap Allow.",
        ],
        tips: [
          "Turn alerts on for each phone you use. It's saved per device.",
          "iPhone: install the app first (see above), then turn alerts on from inside it.",
          "If it says blocked, allow notifications for this site in your browser or phone settings, then try again.",
        ],
      },
    ],
  },
  {
    id: "orders",
    title: "WhatsApp orders",
    icon: "orders",
    topics: [
      {
        id: "how-orders-work",
        title: "How customer orders work",
        summary: "Customers build an order in the shop and send it to the branch on WhatsApp in one tap.",
        steps: [
          "The customer opens the shop. It suggests their nearest branch from their location. They can tap Change to pick another.",
          "They add products, enter their name and phone number, and tap Send order on WhatsApp.",
          "WhatsApp opens with the full order already written. They press Send and it arrives on the branch's WhatsApp.",
          "At the same moment the order appears in Orders as New, and staff with alerts on get a notification.",
        ],
        tips: [
          "The order is saved even if the customer never presses Send in WhatsApp. Check Orders regularly and chat them if needed.",
          "Delivery, pickup and payment are agreed with the customer on WhatsApp. The app doesn't take payments.",
        ],
        link: { href: "~/orders", label: "Open Orders" },
      },
      {
        id: "handle-order",
        title: "Handling an order: confirm, complete, receipt",
        summary: "Move each order from New to Completed. Completing takes the items out of stock and creates a receipt.",
        steps: [
          "Go to Orders. The To handle tab shows new and confirmed orders.",
          "Tap an order to open it. Tap Chat to message the customer on WhatsApp.",
          "When you've agreed the details, tap Confirm.",
          "When the customer has paid or collected, tap Complete sale. Stock goes down and a receipt number is created.",
          "Tap Send receipt on WhatsApp to send the customer their receipt.",
        ],
        tips: [
          "Can't complete because of \"not enough stock\"? The stock in the app is wrong. Fix it with Products → Stock, then complete again.",
          "To cancel, tap Cancel and give a short reason. Cancelled orders don't touch stock.",
          "If an item has a free gift, the order shows a reminder to hand it over.",
        ],
        link: { href: "~/orders", label: "Open Orders" },
      },
    ],
  },
  {
    id: "sales",
    title: "Sales and closing the day",
    icon: "sales",
    topics: [
      {
        id: "walk-in",
        title: "Recording a walk-in sale",
        summary: "For customers who buy in the shop. Stock goes down straight away.",
        steps: [
          "Tap Record sale on the Dashboard, or go to Sales → Record sale.",
          "Search and tap each product to add it.",
          "For each line choose box or piece, set the quantity, and change the price if you gave a discount.",
          "Optionally add the customer's name and WhatsApp number.",
          "Tap Save sale, then Send receipt on WhatsApp, or Copy it to paste anywhere.",
        ],
        tips: [
          "Record every sale. It's the only way stock and daily totals stay correct.",
          "Admins recording a sale pick the branch at the top first.",
        ],
        link: { href: "~/sales/new", label: "Record a sale" },
      },
      {
        id: "void",
        title: "Fixing a mistake: voiding a sale",
        summary: "Sales are never deleted. A wrong sale is voided and the stock goes back.",
        steps: [
          "Go to Sales and tap the sale.",
          "Tap Void, write the reason (for example, wrong quantity), and confirm.",
          "Record the sale again correctly if needed.",
        ],
        tips: ["Every void is shown to the admin with the reason and who did it."],
        link: { href: "~/sales", label: "Open Sales" },
      },
      {
        id: "close-day",
        title: "Closing the day",
        summary: "At closing time, check the day's totals and record the cash you counted.",
        steps: [
          "Go to Daily close (or tap Close the day on the dashboard).",
          "Check the totals: walk-in sales, WhatsApp orders and any voids.",
          "Count the cash and enter it under Cash counted. Add a note if anything is unusual.",
          "Tap Close day.",
        ],
        tips: [
          "Close only after the last sale of the day. Sales recorded after closing still count towards that day.",
          "Made a mistake? The admin can tap Reopen on Daily close, so the day can be closed again.",
        ],
        link: { href: "~/close", label: "Open Daily close" },
      },
    ],
  },
  {
    id: "products",
    title: "Products and prices",
    icon: "products",
    topics: [
      {
        id: "add-product",
        title: "Adding a product",
        summary: "Each product belongs to one branch, so each branch has its own prices and stock.",
        steps: [
          "Go to Products. Admins: first choose the branch at the top. The product goes to that branch.",
          "Tap Add product.",
          "Enter the name, code, a photo, pieces per box and the box price.",
          "Turn on Also sell by the piece if customers can buy single pieces, and set the piece price.",
          "Optionally set a minimum order, a low-stock alert level and the opening stock.",
          "Choose Show in shop, and Hot deal or New arrival if you want a badge. Tap Add product.",
        ],
        tips: [
          "Use the same code for the same item at every branch. The shop then shows customers when another branch has it.",
          "Photos are made smaller on your phone before uploading, to save data.",
        ],
        link: { href: "~/products", label: "Open Products" },
      },
      {
        id: "boxes-pieces",
        title: "Boxes and pieces",
        summary: "Stock is counted in pieces and shown as boxes plus loose pieces, like \"14 boxes + 5 pcs\".",
        steps: [
          "Pieces per box tells the app how many pieces are in one box.",
          "Big single items (fridges, freezers, TVs): set pieces per box to 1 and the unit to \"unit\". They're then sold \"each\" instead of by the box.",
        ],
      },
      {
        id: "edit-hide",
        title: "Changing prices, hiding and badges",
        summary: "Edit any product at any time. Changes show in the shop immediately.",
        steps: [
          "Go to Products and tap Edit on the product.",
          "Change the price or details, then tap Save changes.",
          "To stop selling an item, turn off Show in shop. Products are hidden, never deleted, so history stays.",
        ],
      },
      {
        id: "free-gift",
        title: "Free gift promotions",
        summary: "Give a free item with a product for a set period, like a free iron with a fridge.",
        steps: [
          "Edit the product and turn on Comes with a free gift.",
          "Enter the gift name, add a photo if you have one, and set the start and end dates.",
          "Save. During those dates the shop shows the gift, and orders and receipts list it.",
        ],
        tips: ["The promo switches off by itself after the end date. Nothing to remember."],
      },
      {
        id: "excel",
        title: "Adding many products with Excel",
        summary: "Update prices or add a whole price list at once from a spreadsheet.",
        steps: [
          "Go to Products (admins: choose the branch first) and tap Export. This gives you a spreadsheet in the right layout.",
          "Edit it in Excel or Google Sheets: add rows, change prices, and so on.",
          "Tap Import, choose the file, check the preview, then tap Import to apply it.",
        ],
        tips: [
          "Code and Name are required. Rows are matched by Code: existing codes are updated, new codes are added.",
          "Empty cells leave that value unchanged.",
          "Stock boxes and Stock pieces set the stock level, like a stock take. Leave them empty to keep stock as it is.",
        ],
        link: { href: "~/products", label: "Open Products" },
      },
      {
        id: "copy-branches",
        title: "Copying products to other branches",
        summary: "Add a product once, then copy it to other branches.",
        only: "admin",
        steps: [
          "Go to Products and tap the copy button on a product.",
          "Choose the branches to copy it to and confirm.",
          "The copies start with 0 stock. Adjust each branch's price and stock as needed.",
        ],
      },
      {
        id: "categories",
        title: "Categories",
        summary: "Categories are shared by all branches. Customers use them to filter the shop.",
        only: "admin",
        steps: ["Go to Settings and add, rename or reorder categories.", "Pick a category for each product in its form."],
        link: { href: "~/settings", label: "Open Settings", only: "admin" },
      },
    ],
  },
  {
    id: "stock",
    title: "Stock",
    icon: "stock",
    topics: [
      {
        id: "stock-changes",
        title: "Receiving stock and making corrections",
        summary: "Every stock change is recorded with who made it and why.",
        steps: [
          "Go to Products and tap Stock on the product.",
          "Receive: a delivery arrived. Enter the boxes and pieces received.",
          "Stock take: you counted the shelf. Enter what you counted and it replaces the number in the app.",
          "Correct: add or remove stock for damage, loss or mistakes. A reason is required.",
          "Tap Save. The stock history is shown at the bottom.",
        ],
        tips: ["You can't type a stock number straight into the product. Always use Stock, so there's a record."],
        link: { href: "~/products", label: "Open Products" },
      },
      {
        id: "full-count",
        title: "Full stock take (counting the shop)",
        summary: "Count many products in one go. The admin approves any differences before stock changes.",
        steps: [
          "Managers: go to Stock take and choose a category, or all products.",
          "Enter the counted boxes and pieces for each product. Your counts are saved on the phone until you submit.",
          "Tap Submit. The admin sees it under Stock takes.",
          "Admin: open it, check the differences, then Approve to update stock, or Reject with a note.",
        ],
        link: { href: "~/stock-take", label: "Start a stock take", only: "manager" },
      },
      {
        id: "low-stock",
        title: "Low-stock and out-of-stock alerts",
        summary: "The app warns you before a product runs out.",
        steps: [
          "Each product can have its own alert level. If it's empty, the default from Settings is used.",
          "When stock reaches that level, the product appears under Stock alerts on the dashboard and staff with alerts get a notification.",
          "At 0 the shop shows Out of stock and customers can't order it. It comes back automatically when you receive stock.",
        ],
      },
    ],
  },
  {
    id: "branches",
    title: "Branches",
    icon: "branches",
    topics: [
      {
        id: "manage-branches",
        title: "Adding and editing branches",
        summary: "Each branch has its own products, prices, stock and WhatsApp number.",
        only: "admin",
        steps: [
          "Go to Branches and tap Add branch, or Edit on an existing one.",
          "Enter the name, address and opening hours.",
          "Set the map location: drag the pin, tap I'm at the branch now while standing there, or enter the latitude and longitude from Google Maps (press and hold the spot in Google Maps, then copy the numbers that appear).",
          "Enter the WhatsApp number where this branch's orders should arrive, and use Test to check it.",
          "Save.",
        ],
        tips: [
          "The map pin matters: customers are sent to the branch nearest to them.",
          "Deactivate hides a branch from customers without losing any data. Reactivate brings it back.",
          "Renaming a branch keeps its shop link and its order-number code the same, so old links and records still work.",
        ],
        link: { href: "~/branches", label: "Open Branches", only: "admin" },
      },
      {
        id: "my-branch",
        title: "Your branch settings and shop link",
        summary: "Update your branch's WhatsApp number, phone and opening hours, and share your shop link.",
        only: "manager",
        steps: [
          "Go to My branch.",
          "Change the WhatsApp number for orders, the phone or the opening hours, then save.",
          "Under Share your shop, copy your branch link and post it on WhatsApp Status or in customer groups.",
        ],
        tips: ["To change the branch name, address or map location, ask the admin."],
        link: { href: "~/branch", label: "Open My branch", only: "manager" },
      },
    ],
  },
  {
    id: "team",
    title: "Managers",
    icon: "team",
    topics: [
      {
        id: "managers",
        title: "Adding managers and resetting passwords",
        summary: "Each manager signs in with a username and only sees their own branch.",
        only: "admin",
        steps: [
          "Go to Managers and tap Add manager.",
          "Choose the branch and enter their full name, a username and their phone.",
          "A temporary password is shown once. Send it to them with their username.",
          "They choose their own password the first time they sign in.",
          "To reset a password, move them to another branch, or suspend them, tap Edit on the manager.",
        ],
        tips: ["Suspending signs the person out straight away. Their past sales and records stay."],
        link: { href: "~/staff", label: "Open Managers", only: "admin" },
      },
      {
        id: "what-managers-can-do",
        title: "What managers can and can't do",
        summary: "Managers run their own branch day to day. The admin sees and controls everything.",
        steps: [
          "Managers can: handle orders, record and void sales, add and edit products and prices, manage stock, do stock takes, close the day, and change their branch's WhatsApp number, phone and hours.",
          "Only the admin can: add or edit branches, add managers, approve stock takes, reopen closed days, change shop-wide settings, and see every branch and the activity log.",
        ],
      },
    ],
  },
  {
    id: "reports",
    title: "Dashboard and reports",
    icon: "reports",
    topics: [
      {
        id: "dashboard",
        title: "Reading the dashboard",
        summary: "Today's sales, orders waiting, items sold and stock alerts, updated live.",
        steps: [
          "The top cards show today's sales, orders to handle, items sold and stock alerts.",
          "The chart shows the last 7 days. The admin also sees each branch side by side.",
          "Tap an open order or a stock alert to go straight to it.",
        ],
      },
      {
        id: "reports",
        title: "Reports",
        summary: "Sales by day, best sellers, slow movers and the value of your stock.",
        steps: [
          "Go to Reports and choose the period. Admins can also choose a branch or all branches.",
          "Slow movers lists items in stock that haven't sold in that period, biggest value first.",
          "Tap CSV to download the numbers for Excel.",
        ],
        link: { href: "~/reports", label: "Open Reports" },
      },
      {
        id: "activity",
        title: "Activity log",
        summary: "See who did what across every branch: voids, stock corrections, manager changes and more.",
        only: "admin",
        link: { href: "~/activity", label: "Open Activity log", only: "admin" },
      },
      {
        id: "settings",
        title: "Shop settings",
        summary: "Business name, tagline, the notice banner at the top of the shop, and the default low-stock level.",
        only: "admin",
        link: { href: "~/settings", label: "Open Settings", only: "admin" },
      },
    ],
  },
];

export interface FaqItem {
  q: string;
  a: string;
  only?: Audience;
}

export const FAQ: FaqItem[] = [
  {
    q: "A customer says they sent an order, but it's not in our WhatsApp.",
    a: "Look in Orders. Every order is saved there even if the customer didn't press Send in WhatsApp. Open it and tap Chat to contact them.",
  },
  {
    q: "I can't complete an order. It says there's not enough stock.",
    a: "The stock in the app is lower than what's on the shelf. Go to Products → Stock, use Receive or Stock take to correct it, then complete the order.",
  },
  {
    q: "A product isn't showing in the shop.",
    a: "Check three things: Show in shop is on, the product is under the right branch, and the customer is looking at that branch (they can tap Change at the top of the shop).",
  },
  {
    q: "A customer is seeing the wrong branch.",
    a: "They tap Change at the top of the shop and pick the right branch, or tap Use my location. Their choice is remembered on their phone.",
  },
  {
    q: "I'm not getting alerts.",
    a: "Turn alerts on again from the dashboard on that phone. Check notifications are allowed for the site or app in the phone settings. On iPhone, open the app from the home-screen icon.",
  },
  {
    q: "I recorded a sale wrongly.",
    a: "Open it in Sales, tap Void with a reason, then record it again correctly. The stock goes back automatically.",
  },
  {
    q: "A manager can't sign in.",
    a: "Go to Managers, tap Edit, and reset their password. Check they aren't suspended and are on the right branch.",
    only: "admin",
  },
  {
    q: "I forgot my password.",
    a: "Ask the admin to reset it from Managers. You'll choose a new one when you next sign in.",
    only: "manager",
  },
  {
    q: "The shop or app looks out of date.",
    a: "Close it fully and open it again. If you're offline, it shows the last saved version and updates when you're back online.",
  },
];
