import React from "react";
import { RU } from "../i18n/ru";

function RequestsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M9 9h6M9 13h6M9 17h4" />
    </svg>
  );
}

function TripsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 15h14l3 2v2H3v-4Z" />
      <path d="M6 15V8h8v7M8 19h.01M16 19h.01" />
    </svg>
  );
}

function CalculatorIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8v3H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6Z" />
    </svg>
  );
}

export function HeaderNavigation({ activeView, onSelectView, driveConnected }) {
  const items = [
    { id: "orders", label: RU.workspaceNav.orders, icon: <RequestsIcon /> },
    { id: "trips", label: RU.workspaceNav.trips, icon: <TripsIcon /> },
    { id: "calculator", label: RU.workspaceNav.calculator, icon: <CalculatorIcon /> },
    { id: "settings", label: RU.workspaceNav.settings, icon: <SettingsIcon /> },
  ];

  return (
    <header className="topbar">
      <a className="topbar__logo-wrap" href="#" onClick={(event) => event.preventDefault()}>
        <img
          src="https://aerostar.by/wp-content/uploads/2024/07/logo.svg"
          alt="Aerostar"
          className="topbar__logo"
        />
      </a>
      <nav className="topbar__nav" aria-label={RU.workspaceNav.ariaLabel}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`topbar__link ${activeView === item.id ? "topbar__link--active" : ""} ${item.id === "settings" ? (driveConnected ? "topbar__link--drive-connected" : "topbar__link--drive-disconnected") : ""}`}
            onClick={() => onSelectView(item.id)}
            data-testid={`nav-${item.id}`}
          >
            <span className="topbar__icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}

export function WorkPanel({ title, actionLabel, onAction, actionTestId, headerActions, children }) {
  return (
    <section className="card panel-section">
      <div className="section-header">
        <h2>{title}</h2>
        <div className="section-header__actions">
          {headerActions || (actionLabel && (
            <button type="button" className="primary" onClick={onAction} data-testid={actionTestId}>
              {actionLabel}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-section__body">{children}</div>
    </section>
  );
}

const roundUpToFive = (value) => Math.ceil(value / 5) * 5;

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const copyPlainTextFallback = (text) => {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy failed");
};

const CALCULATOR_AIRPORTS = [
  { id: "svo-assembly", code: "SVO", label: RU.calculator.airports.sheremetyevoAssembly },
  { id: "svo", code: "SVO", label: RU.calculator.airports.sheremetyevo },
  { id: "vko", code: "VKO", label: RU.calculator.airports.vnukovo },
  { id: "dme", code: "DME", label: RU.calculator.airports.domodedovo },
  { id: "zia", code: "ZIA", label: RU.calculator.airports.zhukovsky },
];

export function calculateSvoMsqDelivery(weight, additionalDistance, hasOtherWarehouse, hasDelivery = false) {
  const normalizedWeight = Number.isFinite(weight) ? weight : 0;
  const normalizedDistance = Number.isFinite(additionalDistance) ? additionalDistance : 0;
  if (normalizedWeight >= 750) {
    const baseRate = normalizedWeight <= 1000
      ? 700
      : normalizedWeight <= 1500
        ? 750
        : 900;
    const delivery = roundUpToFive(baseRate + normalizedDistance * 0.5);
    return delivery + (hasOtherWarehouse ? 50 : 0) + (hasDelivery ? 50 : 0);
  }
  const weightCharge = normalizedWeight < 101 ? 0 : (normalizedWeight - 100) * 0.7;
  const delivery = roundUpToFive(190 + weightCharge + normalizedDistance * 0.5);
  return delivery + (hasOtherWarehouse ? 50 : 0) + (hasDelivery ? 50 : 0);
}

const getAirportBaseRate = (weight, isZhukovsky) => {
  if (!isZhukovsky && weight <= 500) return 550;
  if (weight <= 1000) return 600;
  if (weight <= 2000) return 650;
  if (weight <= 3000) return 700;
  if (weight <= 3400) return 750;
  return 850;
};

export function calculateAirportDelivery(weight, additionalDistance, isZhukovsky, homeAwbCount = 0, hasDelivery = false) {
  const normalizedWeight = Number.isFinite(weight) ? weight : 0;
  const normalizedDistance = Number.isFinite(additionalDistance) ? additionalDistance : 0;
  const normalizedHomeAwbCount = Number.isFinite(homeAwbCount) ? Math.max(0, homeAwbCount) : 0;
  const airportSurcharge = isZhukovsky ? 100 : 0;
  const dateSurcharge = 350;
  const homeAwbSurcharge = Math.max(0, normalizedHomeAwbCount - 1) * 50;
  const deliverySurcharge = hasDelivery ? 50 : 0;
  const delivery = roundUpToFive(
    getAirportBaseRate(normalizedWeight, isZhukovsky) + airportSurcharge + normalizedDistance * 0.5,
  );
  return delivery + dateSurcharge + homeAwbSurcharge + deliverySurcharge;
}

export function calculateStandaloneVehicleDelivery(weight) {
  const normalizedWeight = Number.isFinite(weight) ? weight : 0;
  return roundUpToFive(getAirportBaseRate(normalizedWeight, false));
}

export function calculateOrderDelivery(weight, calculatorAirport, additionalDistance, hasDelivery, hasOtherWarehouse = false) {
  if (calculatorAirport === "svo-assembly") {
    return calculateSvoMsqDelivery(weight, additionalDistance, hasOtherWarehouse, hasDelivery);
  }
  return calculateAirportDelivery(
    weight,
    additionalDistance,
    calculatorAirport === "zia",
    1,
    hasDelivery,
  );
}

export function SvoMsqCalculator({ onRouteChange }) {
  const [weight, setWeight] = React.useState("");
  const [airportId, setAirportId] = React.useState("svo-assembly");
  const [hasOtherWarehouse, setHasOtherWarehouse] = React.useState(false);
  const [warehouse, setWarehouse] = React.useState("");
  const [additionalDistance, setAdditionalDistance] = React.useState("");
  const [hasDelivery, setHasDelivery] = React.useState(false);
  const [homeAwbCountInput, setHomeAwbCountInput] = React.useState("1");
  const [isCopied, setIsCopied] = React.useState(false);

  const parsedWeight = Number.parseFloat(weight);
  const parsedDistance = Number.parseFloat(additionalDistance);
  const hasWeight = Number.isFinite(parsedWeight) && parsedWeight >= 0;
  const selectedAirport = CALCULATOR_AIRPORTS.find((airport) => airport.id === airportId) || CALCULATOR_AIRPORTS[0];
  const airportCode = selectedAirport.code;
  const isAssembly = selectedAirport.id === "svo-assembly";
  const isZhukovsky = selectedAirport.id === "zia";
  const parsedHomeAwbCount = Number.parseInt(homeAwbCountInput, 10);
  const homeAwbCount = Number.isFinite(parsedHomeAwbCount) && parsedHomeAwbCount > 0
    ? parsedHomeAwbCount
    : 1;
  const delivery = hasWeight
    ? (isAssembly
        ? calculateSvoMsqDelivery(parsedWeight, parsedDistance, hasOtherWarehouse, hasDelivery)
        : calculateAirportDelivery(parsedWeight, parsedDistance, isZhukovsky, homeAwbCount, hasDelivery))
    : null;
  const destination = hasOtherWarehouse ? warehouse.trim() : "MSQ";
  const routeDestination = destination || RU.common.emDash;

  React.useEffect(() => {
    onRouteChange?.(`${airportCode} - ${routeDestination}`);
  }, [airportCode, onRouteChange, routeDestination]);
  const transitAmount = selectedAirport.id === "dme"
    ? 17850
    : selectedAirport.id === "zia"
      ? 31500
      : 15750;
  const transitTotal = transitAmount * (isAssembly ? 1 : homeAwbCount);
  const transitText = `${RU.calculator.transitPrefix} ${transitTotal} ${RU.calculator.transitSuffix}`;
  const terminalExpensesText = !isAssembly && homeAwbCount > 1
    ? RU.calculator.terminalExpensesMultiple
    : RU.calculator.terminalExpensesSingle;
  const deliveryAssemblySuffix = isAssembly ? ` ${RU.calculator.deliveryAssemblySuffix}` : "";
  const deliveryLabel = `${RU.calculator.deliveryPrefix} ${airportCode} - ${routeDestination}${deliveryAssemblySuffix}`;
  const deliveryValue = delivery === null ? RU.common.emDash : `${delivery} $`;
  const deliveryText = `${deliveryLabel} \u2014 ${deliveryValue}`;

  const handleCopy = async () => {
    const plainText = [
      deliveryText,
      `${transitText}\n${terminalExpensesText}\n${RU.calculator.brokerHint}`,
      RU.calculator.sealNotice,
    ].join("\n\n");
    const htmlText = [
      `<div>${escapeHtml(deliveryLabel)} \u2014 <strong>${escapeHtml(deliveryValue)}</strong></div>`,
      "<br>",
      `<div>${escapeHtml(transitText)}</div>`,
      `<div>${escapeHtml(terminalExpensesText)}</div>`,
      `<div>${escapeHtml(RU.calculator.brokerHint)}</div>`,
      "<br>",
      `<div><strong>${escapeHtml(RU.calculator.sealNotice)}</strong></div>`,
    ].join("");

    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([plainText], { type: "text/plain" }),
            "text/html": new Blob([htmlText], { type: "text/html" }),
          }),
        ]);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plainText);
      } else {
        copyPlainTextFallback(plainText);
      }
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch {
      try {
        copyPlainTextFallback(plainText);
        setIsCopied(true);
        window.setTimeout(() => setIsCopied(false), 2000);
      } catch {
        setIsCopied(false);
      }
    }
  };

  return (
    <div className="svo-calculator">
      <div className="svo-calculator__fields">
        <div className="field">
          <label htmlFor="svo-calculator-weight">{RU.calculator.weight}</label>
          <input
            id="svo-calculator-weight"
            type="number"
            min="0"
            step="0.01"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            placeholder={RU.calculator.weightPlaceholder}
            data-testid="calculator-weight"
          />
        </div>

        <div className="field">
          <label htmlFor="svo-calculator-distance">{RU.calculator.additionalDistance}</label>
          <input
            id="svo-calculator-distance"
            type="number"
            min="0"
            step="0.01"
            value={additionalDistance}
            onChange={(event) => setAdditionalDistance(event.target.value)}
            placeholder={RU.calculator.distancePlaceholder}
            data-testid="calculator-distance"
          />
        </div>

        <div className="svo-calculator__warehouse-row">
          <div className={`svo-calculator__primary-controls ${isAssembly ? "svo-calculator__primary-controls--single" : ""}`}>
            <div className="field svo-calculator__airport-field">
              <label htmlFor="svo-calculator-airport">{RU.calculator.airport}</label>
              <select
                id="svo-calculator-airport"
                value={airportId}
                onChange={(event) => setAirportId(event.target.value)}
                aria-label={RU.calculator.airport}
                data-testid="calculator-airport"
              >
                {CALCULATOR_AIRPORTS.map((airport) => (
                  <option key={airport.id} value={airport.id}>{airport.label}</option>
                ))}
              </select>
            </div>
            {!isAssembly && (
              <div className="field svo-calculator__home-awb-field">
                <label htmlFor="svo-calculator-home-awb-count">{RU.calculator.homeAwbCount}</label>
                <input
                  id="svo-calculator-home-awb-count"
                  type="number"
                  min="1"
                  step="1"
                  value={homeAwbCountInput}
                  onChange={(event) => setHomeAwbCountInput(event.target.value)}
                  data-testid="calculator-home-awb-count"
                />
              </div>
            )}
          </div>
          <div className="svo-calculator__option-controls">
            <label className="svo-calculator__checkbox">
              <input
                type="checkbox"
                checked={hasDelivery}
                onChange={(event) => setHasDelivery(event.target.checked)}
                data-testid="calculator-with-delivery"
              />
              <span>{RU.calculator.withDelivery}</span>
            </label>
            <div className="svo-calculator__warehouse-controls">
              <label className="svo-calculator__checkbox">
                <input
                  type="checkbox"
                  checked={hasOtherWarehouse}
                  onChange={(event) => {
                    setHasOtherWarehouse(event.target.checked);
                    if (!event.target.checked) setWarehouse("");
                  }}
                  data-testid="calculator-other-warehouse"
                />
                <span>{RU.calculator.otherWarehouse}</span>
              </label>
              <input
                id="svo-calculator-warehouse"
                className={`svo-calculator__warehouse-field ${hasOtherWarehouse ? "svo-calculator__warehouse-field--visible" : ""}`}
                type="text"
                value={warehouse}
                onChange={(event) => setWarehouse(event.target.value)}
                placeholder={RU.calculator.warehousePlaceholder}
                aria-label={RU.calculator.warehouse}
                aria-hidden={!hasOtherWarehouse}
                disabled={!hasOtherWarehouse}
                tabIndex={hasOtherWarehouse ? 0 : -1}
                data-testid="calculator-warehouse"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="svo-calculator__result" aria-live="polite">
        <button
          type="button"
          className="svo-calculator__copy"
          onClick={handleCopy}
          title={RU.calculator.copy}
          aria-label={RU.calculator.copy}
          data-testid="calculator-copy"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="8" y="8" width="11" height="12" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" />
          </svg>
          <span>{isCopied ? RU.calculator.copied : RU.calculator.copy}</span>
        </button>
        <p className="svo-calculator__delivery">
          <span>
            {deliveryLabel} {"\u2014"}
          </span>
          <strong data-testid="calculator-result">
            {deliveryValue}
          </strong>
        </p>
        <p>{transitText}</p>
        <p>{terminalExpensesText}</p>
        <p className="svo-calculator__hint">{RU.calculator.brokerHint}</p>
        <p className="svo-calculator__notice">
          <strong>{RU.calculator.sealNotice}</strong>
        </p>
      </div>
    </div>
  );
}

export function WorkflowBoard({
  boardTitle,
  boardTestId,
  stages,
  items,
  getItemId,
  getItemStageId,
  getItemWeight,
  getItemCost,
  onMoveItemToStage,
  onInsertStage,
  onRenameStage,
  onDeleteStage,
  allowStageManagement = true,
  isStageDefault,
  renderItemCard,
}) {
  const [activeStageId, setActiveStageId] = React.useState("");
  const [editingStageId, setEditingStageId] = React.useState("");
  const [editingStageName, setEditingStageName] = React.useState("");
  const [deleteStageId, setDeleteStageId] = React.useState("");
  const [dragOverStageId, setDragOverStageId] = React.useState("");
  const [draggingItemId, setDraggingItemId] = React.useState("");
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const renameFormRef = React.useRef(null);
  const columnsRef = React.useRef(null);
  const hoverScrollDirectionRef = React.useRef(0);
  const hoverScrollFrameRef = React.useRef(0);
  const syncHeaderHeights = React.useCallback(() => {
    const node = columnsRef.current;
    if (!node) return;
    const headers = Array.from(node.querySelectorAll(".workflow-column__head"));
    if (headers.length === 0) return;
    headers.forEach((header) => {
      header.style.height = "auto";
    });
    const maxHeight = Math.max(
      ...headers.map((header) => Math.ceil(header.getBoundingClientRect().height)),
    );
    headers.forEach((header) => {
      header.style.height = `${maxHeight}px`;
    });
  }, []);
  const toWeightNumber = React.useCallback((value) => {
    if (value == null) return 0;
    const normalized = String(value).replace(",", ".").trim();
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const updateScrollControls = React.useCallback(() => {
    const node = columnsRef.current;
    if (!node) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    const left = node.scrollLeft;
    setCanScrollLeft(left > 6);
    setCanScrollRight(left < maxScrollLeft - 6);
  }, []);

  React.useLayoutEffect(() => {
    syncHeaderHeights();
    let resizeFrame = 0;
    const handleResize = () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(syncHeaderHeights);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", handleResize);
    };
  }, [editingStageId, items, stages, syncHeaderHeights]);

  const stopHoverScroll = React.useCallback(() => {
    hoverScrollDirectionRef.current = 0;
    if (hoverScrollFrameRef.current) {
      window.cancelAnimationFrame(hoverScrollFrameRef.current);
      hoverScrollFrameRef.current = 0;
    }
  }, []);

  const runHoverScroll = React.useCallback(() => {
    const node = columnsRef.current;
    const direction = hoverScrollDirectionRef.current;
    if (!node || !direction) {
      hoverScrollFrameRef.current = 0;
      return;
    }

    node.scrollLeft += direction * 14;
    updateScrollControls();
    hoverScrollFrameRef.current = window.requestAnimationFrame(runHoverScroll);
  }, [updateScrollControls]);

  const startHoverScroll = React.useCallback((direction) => {
    hoverScrollDirectionRef.current = direction;
    if (!hoverScrollFrameRef.current) {
      hoverScrollFrameRef.current = window.requestAnimationFrame(runHoverScroll);
    }
  }, [runHoverScroll]);

  const isStageRenamable = React.useCallback(
    (stage) => {
      if (!allowStageManagement) return false;
      if (!stage) return false;
      return true;
    },
    [allowStageManagement],
  );

  const isStageDeletable = React.useCallback(
    (stage) => {
      if (!allowStageManagement) return false;
      if (!stage) return false;
      return !(isStageDefault && isStageDefault(stage));
    },
    [allowStageManagement, isStageDefault],
  );

  const openRenameModal = (stage) => {
    if (!isStageRenamable(stage)) return;
    setActiveStageId(stage.id);
    setEditingStageId(stage.id);
    setEditingStageName(stage.name);
  };

  const closeRenameInline = () => {
    setEditingStageId("");
    setEditingStageName("");
  };

  const commitRenameStage = React.useCallback(() => {
    const value = editingStageName.trim();
    if (!value || !editingStageId) return false;
    onRenameStage(editingStageId, value);
    closeRenameInline();
    setActiveStageId("");
    return true;
  }, [editingStageId, editingStageName, onRenameStage]);

  const submitRenameStage = (event) => {
    event.preventDefault();
    commitRenameStage();
  };

  const openDeleteModal = (stageId) => {
    const stage = stages.find((item) => item.id === stageId);
    if (!isStageDeletable(stage)) return;
    setDeleteStageId(stageId);
  };

  const closeDeleteModal = () => {
    setDeleteStageId("");
    setActiveStageId("");
    closeRenameInline();
  };

  const confirmDeleteStage = () => {
    if (!deleteStageId) return;
    onDeleteStage(deleteStageId);
    setDeleteStageId("");
    setActiveStageId("");
    if (editingStageId === deleteStageId) {
      closeRenameInline();
    }
  };

  const handleInsertStage = async (afterStageId) => {
    if (!allowStageManagement || !onInsertStage) return;
    const createdStageId = await onInsertStage(afterStageId);
    if (!createdStageId) return;
    setActiveStageId(createdStageId);
    setEditingStageId(createdStageId);
    setEditingStageName(RU.workflow.newStage);
  };

  const handleDragStart = (event, itemId) => {
    setDraggingItemId(String(itemId));
    event.dataTransfer.setData("text/plain", String(itemId));
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDragOverStage = (event, stageId) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverStageId !== stageId) {
      setDragOverStageId(stageId);
    }
  };

  const handleDragLeaveStage = (event, stageId) => {
    const related = event.relatedTarget;
    if (related && event.currentTarget.contains(related)) return;
    if (dragOverStageId === stageId) {
      setDragOverStageId("");
    }
  };

  const handleDropToStage = (event, stageId) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/plain");
    setDragOverStageId("");
    setDraggingItemId("");
    if (!itemId || !onMoveItemToStage) return;
    onMoveItemToStage(itemId, stageId);
  };

  React.useEffect(() => {
    if (!editingStageId || deleteStageId) return undefined;

    const handlePointerDownOutsideInline = (event) => {
      const formNode = renameFormRef.current;
      if (!formNode || formNode.contains(event.target)) return;
      const deleteButton = event.target.closest(".workflow-column__icon-btn--delete");
      if (deleteButton) return;
      commitRenameStage();
    };

    document.addEventListener("pointerdown", handlePointerDownOutsideInline);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutsideInline);
    };
  }, [editingStageId, deleteStageId, commitRenameStage]);

  React.useEffect(() => {
    const node = columnsRef.current;
    if (!node) return undefined;

    updateScrollControls();
    node.addEventListener("scroll", updateScrollControls, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      updateScrollControls();
    });
    resizeObserver.observe(node);

    if (node.firstElementChild) {
      resizeObserver.observe(node.firstElementChild);
    }

    window.addEventListener("resize", updateScrollControls);

    return () => {
      stopHoverScroll();
      node.removeEventListener("scroll", updateScrollControls);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScrollControls);
    };
  }, [stages.length, items.length, stopHoverScroll, updateScrollControls]);

  return (
    <div className="workflow-board" data-testid={boardTestId ? `${boardTestId}-board` : undefined}>
      <div
        className={`workflow-board__viewport ${
          canScrollLeft ? "workflow-board__viewport--can-scroll-left" : ""
        } ${canScrollRight ? "workflow-board__viewport--can-scroll-right" : ""}`.trim()}
      >
        {canScrollLeft && (
          <button
            type="button"
            className="workflow-board__edge-control workflow-board__edge-control--left"
            aria-label={RU.workflow.scrollLeftAria || "Прокрутить влево"}
            onMouseEnter={() => startHoverScroll(-1)}
            onMouseLeave={stopHoverScroll}
            onFocus={() => startHoverScroll(-1)}
            onBlur={stopHoverScroll}
          >
            ‹
          </button>
        )}

        <div ref={columnsRef} className="workflow-columns">
          {stages.map((stage) => {
            const stageItems = items.filter((item) => getItemStageId(item) === stage.id);
            const stageTotalWeight = stageItems.reduce(
              (sum, item) => sum + toWeightNumber(getItemWeight ? getItemWeight(item) : 0),
              0,
            );
            const stageTotalCost = stageItems.reduce(
              (sum, item) => sum + toWeightNumber(getItemCost ? getItemCost(item) : 0),
              0,
            );
            const stageIsDefault = Boolean(isStageDefault && isStageDefault(stage));
            const stageCanRename = isStageRenamable(stage);
            const stageCanDelete = isStageDeletable(stage);
            return (
              <section
                className={`workflow-column ${dragOverStageId === stage.id ? "workflow-column--drop-target" : ""}`}
                key={stage.id}
                data-testid={boardTestId ? `${boardTestId}-stage-${stage.id}` : undefined}
                onDragOver={(event) => handleDragOverStage(event, stage.id)}
                onDragLeave={(event) => handleDragLeaveStage(event, stage.id)}
                onDrop={(event) => handleDropToStage(event, stage.id)}
              >
                <header className={`workflow-column__head ${stageIsDefault ? "workflow-column__head--default" : ""}`}>
                  {editingStageId === stage.id ? (
                    <form ref={renameFormRef} className="workflow-column__title-edit" onSubmit={submitRenameStage}>
                      <input
                        type="text"
                        data-testid={boardTestId ? `${boardTestId}-stage-rename-input` : undefined}
                        value={editingStageName}
                        onChange={(event) => setEditingStageName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            closeRenameInline();
                            setActiveStageId("");
                          }
                        }}
                        autoFocus
                      />
                    </form>
                  ) : (
                    <div className="workflow-column__title-wrap">
                      <div className="workflow-column__title">{stage.name}</div>
                      <div className="workflow-column__weight">
                        {stageTotalWeight.toLocaleString("ru-RU", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })} {RU.workflow.weightUnit}
                      </div>
                      {getItemCost && (
                        <div className="workflow-column__cost">
                          {stageTotalCost.toLocaleString("ru-RU", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })} {RU.workflow.costUnit}
                        </div>
                      )}
                    </div>
                  )}
                  {stageCanRename &&
                    (activeStageId === stage.id && stageCanDelete ? (
                      <button
                        type="button"
                        className="workflow-column__icon-btn workflow-column__icon-btn--delete"
                        title={RU.workflow.deleteStage}
                        onClick={() => openDeleteModal(stage.id)}
                        data-testid={boardTestId ? `${boardTestId}-stage-delete-${stage.id}` : undefined}
                        disabled={stages.length <= 1}
                      >
                        🗑
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="workflow-column__icon-btn workflow-column__icon-btn--edit"
                        title={RU.workflow.edit}
                        onClick={() => openRenameModal(stage)}
                        data-testid={boardTestId ? `${boardTestId}-stage-edit-${stage.id}` : undefined}
                      >
                        ✎
                      </button>
                    ))}
                </header>
                <div className="workflow-column__body">
                  {stageItems.length === 0 ? (
                    <div className="workflow-column__empty">{RU.workflow.empty}</div>
                  ) : (
                    stageItems.map((item) => (
                      <div
                        key={getItemId(item)}
                        className={`workflow-draggable-card ${
                          draggingItemId === String(getItemId(item))
                            ? "workflow-draggable-card--dragging"
                            : ""
                        }`}
                        draggable
                        onDragStart={(event) => handleDragStart(event, getItemId(item))}
                        onDragEnd={() => {
                          setDragOverStageId("");
                          setDraggingItemId("");
                        }}
                      >
                        {renderItemCard(item)}
                      </div>
                    ))
                  )}
                </div>
                {allowStageManagement && (
                  <button
                    type="button"
                    className="workflow-column__add-next"
                    title={RU.workflow.addStageRight}
                    onClick={() => handleInsertStage(stage.id)}
                    data-testid={boardTestId ? `${boardTestId}-stage-add-after-${stage.id}` : undefined}
                  >
                    +
                  </button>
                )}
              </section>
            );
          })}
        </div>

        {canScrollRight && (
          <button
            type="button"
            className="workflow-board__edge-control workflow-board__edge-control--right"
            aria-label={RU.workflow.scrollRightAria || "Прокрутить вправо"}
            onMouseEnter={() => startHoverScroll(1)}
            onMouseLeave={stopHoverScroll}
            onFocus={() => startHoverScroll(1)}
            onBlur={stopHoverScroll}
          >
            ›
          </button>
        )}
      </div>

      {allowStageManagement && Boolean(deleteStageId) && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={RU.workflow.deleteDialogAria}
          data-testid={boardTestId ? `${boardTestId}-delete-stage-modal` : undefined}
        >
          <div className="modal-card workflow-modal">
            <div className="modal-card__header">
              <h2>{RU.workflow.deleteDialogTitle}</h2>
            </div>
            <div className="modal-card__body">
              <p>{RU.workflow.deleteDialogDescription}</p>
              <div className="workflow-confirm-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={confirmDeleteStage}
                  data-testid={boardTestId ? `${boardTestId}-delete-stage-confirm` : undefined}
                >
                  {RU.workflow.deleteStage}
                </button>
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  data-testid={boardTestId ? `${boardTestId}-delete-stage-cancel` : undefined}
                >
                  {RU.common.cancel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TripFormCard({
  formData,
  onFieldChange,
  onToggleOrder,
  onSubmit,
  onPrint,
  onCancel,
  submitLabel = RU.tripForm.defaultSubmit,
  orders,
  carNumbers,
  driverNames,
  isSaving = false,
  isPrintLoading = false,
  formId,
  showFooterActions = true,
  embedded = false,
}) {
  const selectedOrders = orders.filter((order) => formData.orderIds.includes(order.id));
  const totalWeight = selectedOrders.reduce((sum, order) => {
    const parsed = Number.parseFloat(String(order.weight || "0").replace(",", "."));
    return sum + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);

  const content = (
    <form id={formId} onSubmit={onSubmit} className="trip-form">
      <div className="field trip-form__left">
        <label htmlFor="trip-number">{RU.tripForm.tripNumber}</label>
        <input
          id="trip-number"
          type="text"
          required
          value={formData.tripNumber}
          onChange={onFieldChange("tripNumber")}
          placeholder={RU.tripForm.tripNumberPlaceholder}
        />
      </div>

      <div className="field trip-form__right">
        <label htmlFor="trip-date">{RU.tripForm.tripDate}</label>
        <input
          id="trip-date"
          type="date"
          value={formData.tripDate}
          onChange={onFieldChange("tripDate")}
        />
      </div>

      <div className="field trip-form__left">
        <label htmlFor="car-number">{RU.tripForm.carNumber}</label>
        <div className="trip-car-row">
          <input
            id="car-number"
            name="carNumber"
            type="text"
            list="trip-car-suggestions"
            required
            value={formData.carNumber}
            onChange={onFieldChange("carNumber")}
            placeholder={RU.tripForm.selectCar}
            autoComplete="off"
          />
          <datalist id="trip-car-suggestions">
            {carNumbers.map((car) => (
              <option key={car} value={car} />
            ))}
          </datalist>
          <label className="trip-car-row__checkbox">
            <input
              type="checkbox"
              checked={Boolean(formData.hasTrailer)}
              onChange={onFieldChange("hasTrailer")}
            />
            <span>{RU.tripForm.trailer}</span>
          </label>
        </div>
      </div>

      <div className="field trip-form__right">
        <label htmlFor="driver-name">{RU.tripForm.driver}</label>
        <input
          id="driver-name"
          name="driverName"
          type="text"
          list="trip-driver-suggestions"
          required
          value={formData.driverName}
          onChange={onFieldChange("driverName")}
          placeholder={RU.tripForm.selectDriver}
          autoComplete="off"
        />
        <datalist id="trip-driver-suggestions">
          {driverNames.map((driver) => (
            <option key={driver} value={driver} />
          ))}
        </datalist>
      </div>

      <div className="field trip-form__orders">
        <span>{RU.tripForm.orders}</span>
        <div className="trip-orders-list">
          {orders.length === 0 ? (
            <div className="trip-orders-list__empty">
              {RU.tripForm.noWarehouseOrders}
            </div>
          ) : (
            orders.map((order) => {
              const checked = formData.orderIds.includes(order.id);
              return (
                <label
                  className={`trip-order-item ${checked ? "trip-order-item--checked" : ""}`}
                  key={order.id}
                  data-testid={`trip-order-option-${order.id}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleOrder(order.id)}
                  />
                  <span className="trip-order-item__content">
                    <span className="trip-order-item__title">{order.name || order.customer || order.recipient || order.unloadingPoint || RU.tripForm.untitledOrder}</span>
                    <span className="trip-order-item__meta">
                      AWB: {order.awb || RU.common.emDash} | {order.quantity || RU.common.emDash} {RU.tripForm.placesUnit} | {order.weight || RU.common.emDash} {RU.tripForm.weightUnit} | {order.unloadingPoint || order.customsName || order.customsCode || RU.common.emDash}
                    </span>
                  </span>
                  <span className="trip-order-item__airport">{order.loadingPoint || order.shipmentAirport || RU.common.emDash}</span>
                </label>
              );
            })
          )}
        </div>
      </div>

      <div className="trip-form__footer">
        <div className="trip-form__summary">
          <div className="trip-form__summary-item">
            <span>{RU.tripForm.selectedOrders}</span>
            <strong>{selectedOrders.length}</strong>
          </div>
          <div className="trip-form__summary-item">
            <span>{RU.tripForm.totalWeight}</span>
            <strong>{totalWeight.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {"\u043a\u0433"}</strong>
          </div>
        </div>
        {showFooterActions && (
          <div className="trip-form__actions">
            <button type="submit" className="primary" disabled={orders.length === 0 || isPrintLoading || isSaving}>
              {isSaving ? RU.common.saveInProgress : submitLabel}
            </button>
            <button
              type="button"
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (form && !form.reportValidity()) return;
                onPrint?.();
              }}
              disabled={orders.length === 0 || isPrintLoading || isSaving}
            >
              {isPrintLoading ? RU.tripForm.printPreparing : RU.tripForm.print}
            </button>
            <button type="button" onClick={() => onCancel?.()} disabled={isPrintLoading || isSaving}>
              {RU.common.cancel}
            </button>
          </div>
        )}
      </div>
    </form>
  );

  if (embedded) return <>{content}</>;

  return (
    <section className="card">
      <h3>{RU.tripForm.title}</h3>
      {content}
    </section>
  );
}

export function TripsTable({ trips, embedded = false }) {
  const table = (
    <div className="table">
      <div className="table__row table__head table__row--trips">
        <span>{RU.tripView.tripNumber}</span>
        <span>{RU.tripView.date}</span>
        <span>{RU.tripView.car}</span>
        <span>{RU.tripView.driver}</span>
        <span>{RU.tripView.orders}</span>
      </div>
      <div className="table__body">
        {trips.length === 0 ? (
          <div className="table__empty">{RU.tripView.empty}</div>
        ) : (
          trips.map((trip) => (
            <div className="table__row table__row--trips" key={trip.id}>
              <span>{trip.tripNumber}</span>
              <span>{trip.tripDate}</span>
              <span>{trip.carNumber}</span>
              <span>{trip.driverName}</span>
              <span>{trip.ordersSummary || `${RU.tripView.ordersCount}: ${trip.orderIds.length}`}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  if (embedded) return table;

  return (
    <section className="card">
      <h3>{RU.tripView.listTitle}</h3>
      {table}
    </section>
  );
}

export function SettingsSection({ onOpenSettings }) {
  return (
    <section className="card">
      <h3>{RU.settingsSection.title}</h3>
      <p>{RU.settingsSection.description}</p>
      <button type="button" className="primary" onClick={onOpenSettings}>
        {RU.settingsSection.open}
      </button>
    </section>
  );
}
