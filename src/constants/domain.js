export const CUSTOMS_CODE_MAP = {
  "06536": "ПТО Аэропорт Минск",
  "06533": "ПТО Минск-СЭЗ",
  "06529": "ПТО Колядичи-авто",
  "06611": "ПТО Белкультторг",
  "06650": "ПТО Минск-ТЛЦ-2",
  "06649": "ПТО Минск-ТЛЦ-1",
  "06544": "ПТО Белювелирторг",
  "06641": "ПТО Солигорск",
  "06651": "ПТО Великий Камень",
  "06613": "ПТО Жодино-Логистик",
  "06608": "ПТО Борисов-авто",
  "07242": "ПТО Полоцк-стекловолокно",
  "07260": "ПТО Витебск-Белтаможсервис",
  "07270": "ПТО Орша-Белтаможсервис",
  "07271": "ПТО Орша-ТЛЦ",
  "09146": "ПТО Барановичи-Фестивальная",
  "09159": "ПТО Брест-Белтаможсервис",
  "09161": "ПТО Пинск-Белтаможсервис",
  "09162": "ПТО Брест-Белтаможсервис-2",
  "14325": "ПТО Гомель-Белтаможсервис",
  "14336": "ПТО Жлобин-металлургический",
  "14354": "ПТО Гомель-СЭЗ",
  "09157": "ПТО Мозырь-Белтаможсервис",
  "16443": "ПТО Лида-авто",
  "16457": "ПТО Гродно-ГАП-2",
  "16463": "ПТО Брузги-ТЛЦ",
  "16464": "ПТО Каменный Лог-Белтаможсервис",
  "16465": "ПТО Берестовица-ТЛЦ",
  "20733": "ПТО Могилев-Белтаможсервис",
  "20734": "ПТО Бобруйск-Белтаможсервис",
};

export const DEFAULT_PRINT_SIGNER_SETTINGS = {
  signerRole: "\u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440",
  signerName: "\u041a\u043e\u0441\u0435\u043d\u043a\u043e \u0414.\u0412.",
};

export const TRIP_CAR_NUMBERS = [
  "AC 7769-5",
  "AM 1019-5",
  "AT 9287-5",
  "AT 9288-5",
  "AM 2957-5",
  "AM 9118-5",
  "AT 2761-5",
  "AT 2762-5",
  "AP 7963-5",
  "AP 9736-5",
  "AT 0887-5",
];

export const TRIP_DRIVER_NAMES = [
  "Бабрович Юрий",
  "Медведь Валерий",
  "Медведь Вадим",
  "Сержан Чеслав",
  "Латушко Олег",
  "Шамко Дмитрий",
];

export const TRAILER_NUMBER = "\u0410 1482 \u0415-5";

export const DEFAULT_ORDER_STAGES = [
  { id: "order-stage-plan", code: "plan", name: "\u041f\u043b\u0430\u043d" },
  { id: "order-stage-warehouse", code: "warehouse", name: "\u041d\u0430 \u0441\u043a\u043b\u0430\u0434\u0435" },
  { id: "order-stage-in-car", code: "in_car", name: "\u0412 \u043c\u0430\u0448\u0438\u043d\u0435" },
  { id: "order-stage-delivered", code: "delivered", name: "\u0414\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043e" },
];

export const DEFAULT_TRIP_STAGES = [
  { id: "trip-stage-plan", code: "plan", name: "\u041f\u043b\u0430\u043d" },
  { id: "trip-stage-in-route", code: "in_route", name: "\u0412 \u0440\u0435\u0439\u0441\u0435" },
  { id: "trip-stage-completed", code: "completed", name: "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043e" },
];

export const ORDER_STAGE_PLAN_ID = "order-stage-plan";
export const ORDER_STAGE_WAREHOUSE_ID = "order-stage-warehouse";
export const ORDER_STAGE_IN_CAR_ID = "order-stage-in-car";
export const ORDER_STAGE_DELIVERED_ID = "order-stage-delivered";
export const TRIP_STAGE_COMPLETED_ID = "trip-stage-completed";

export const ORDER_STAGE_CODES = {
  PLAN: "plan",
  WAREHOUSE: "warehouse",
  IN_CAR: "in_car",
  DELIVERED: "delivered",
};

export const TRIP_STAGE_CODES = {
  PLAN: "plan",
  IN_ROUTE: "in_route",
  COMPLETED: "completed",
};

export const DEFAULT_ORDER_STAGE_CODES = new Set(Object.values(ORDER_STAGE_CODES));
export const DEFAULT_TRIP_STAGE_CODES = new Set(Object.values(TRIP_STAGE_CODES));

export const CARGO_TERMINAL_URLS = {
  svo_moscow: "https://www.moscow-cargo.com/",
  svo_sher: "https://www.shercargo.ru/it/free/",
  vko: "https://www.vnukovo.ru/ru/partneram/cargo/proverit-status-gruza/",
  dme: "https://business.dme.ru/cargo/",
  zia: "https://www.aero-grad.ru/aircargo/info/ac_07.pub_info.main?p_lang=R",
};

export const DEFAULT_POWER_OF_ATTORNEY_REGISTRY = {
  "\u0428\u0435\u0440\u0435\u043c\u0435\u0442\u044c\u0435\u0432\u043e": {
    "\u041c\u043e\u0441\u043a\u0432\u0430-\u043a\u0430\u0440\u0433\u043e": [],
    "\u0428\u0435\u0440\u0435\u043c\u0435\u0442\u044c\u0435\u0432\u043e-\u043a\u0430\u0440\u0433\u043e": [],
  },
  "\u0412\u043d\u0443\u043a\u043e\u0432\u043e": [],
  "\u0414\u043e\u043c\u043e\u0434\u0435\u0434\u043e\u0432\u043e": [],
  "\u0416\u0443\u043a\u043e\u0432\u0441\u043a\u0438\u0439": [],
};

export const AIRPORT_ALIASES = new Map([
  ["\u0428\u0435\u0440\u0435\u043c\u0435\u0442\u044c\u0435\u0432\u043e", "\u0428\u0435\u0440\u0435\u043c\u0435\u0442\u044c\u0435\u0432\u043e"],
  ["\u0412\u043d\u0443\u043a\u043e\u0432\u043e", "\u0412\u043d\u0443\u043a\u043e\u0432\u043e"],
  ["\u0414\u043e\u043c\u043e\u0434\u0435\u0434\u043e\u0432\u043e", "\u0414\u043e\u043c\u043e\u0434\u0435\u0434\u043e\u0432\u043e"],
  ["\u0416\u0443\u043a\u043e\u0432\u0441\u043a\u0438\u0439", "\u0416\u0443\u043a\u043e\u0432\u0441\u043a\u0438\u0439"],
]);

export const TERMINAL_ALIASES = new Map([
  ["\u041c\u043e\u0441\u043a\u0432\u0430-\u043a\u0430\u0440\u0433\u043e", "\u041c\u043e\u0441\u043a\u0432\u0430-\u043a\u0430\u0440\u0433\u043e"],
  ["\u0428\u0435\u0440\u0435\u043c\u0435\u0442\u044c\u0435\u0432\u043e-\u043a\u0430\u0440\u0433\u043e", "\u0428\u0435\u0440\u0435\u043c\u0435\u0442\u044c\u0435\u0432\u043e-\u043a\u0430\u0440\u0433\u043e"],
]);

export const TRIP_FALLBACK_NAME = "\u0420\u0435\u0439\u0441";
