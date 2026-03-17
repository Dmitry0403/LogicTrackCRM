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
          >
            <span className="topbar__icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}

export function WorkPanel({ title, actionLabel, onAction, headerActions, children }) {
  return (
    <section className="card panel-section">
      <div className="section-header">
        <h2>{title}</h2>
        <div className="section-header__actions">
          {headerActions || (actionLabel && (
            <button type="button" className="primary" onClick={onAction}>
              {actionLabel}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-section__body">{children}</div>
    </section>
  );
}

export function WorkflowBoard({
  boardTitle,
  stages,
  items,
  getItemId,
  getItemStageId,
  getItemWeight,
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
  const renameFormRef = React.useRef(null);
  const toWeightNumber = React.useCallback((value) => {
    if (value == null) return 0;
    const normalized = String(value).replace(",", ".").trim();
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

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

  const handleInsertStage = (afterStageId) => {
    if (!allowStageManagement || !onInsertStage) return;
    const createdStageId = onInsertStage(afterStageId);
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

  return (
    <div className="workflow-board">
      <div className="workflow-columns">
        {stages.map((stage) => {
          const stageItems = items.filter((item) => getItemStageId(item) === stage.id);
          const stageTotalWeight = stageItems.reduce(
            (sum, item) => sum + toWeightNumber(getItemWeight ? getItemWeight(item) : 0),
            0,
          );
          const stageIsDefault = Boolean(isStageDefault && isStageDefault(stage));
          const stageCanRename = isStageRenamable(stage);
          const stageCanDelete = isStageDeletable(stage);
          return (
            <section
              className={`workflow-column ${dragOverStageId === stage.id ? "workflow-column--drop-target" : ""}`}
              key={stage.id}
              onDragOver={(event) => handleDragOverStage(event, stage.id)}
              onDragLeave={(event) => handleDragLeaveStage(event, stage.id)}
              onDrop={(event) => handleDropToStage(event, stage.id)}
            >
              <header className={`workflow-column__head ${stageIsDefault ? "workflow-column__head--default" : ""}`}>
                {editingStageId === stage.id ? (
                  <form ref={renameFormRef} className="workflow-column__title-edit" onSubmit={submitRenameStage}>
                    <input
                      type="text"
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
                    <div className="workflow-column__count">{stageItems.length}</div>
                    <div className="workflow-column__weight">
                      {stageTotalWeight.toLocaleString("ru-RU", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })} {RU.workflow.weightUnit}
                    </div>
                  </div>
                )}
                {stageCanRename &&
                  (activeStageId === stage.id && stageCanDelete ? (
                    <button
                      type="button"
                      className="workflow-column__icon-btn workflow-column__icon-btn--delete"
                      title={RU.workflow.deleteStage}
                      onClick={() => openDeleteModal(stage.id)}
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
                >
                  +
                </button>
              )}
            </section>
          );
        })}
      </div>

      {allowStageManagement && Boolean(deleteStageId) && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={RU.workflow.deleteDialogAria}>
          <div className="modal-card workflow-modal">
            <div className="modal-card__header">
              <h2>{RU.workflow.deleteDialogTitle}</h2>
            </div>
            <div className="modal-card__body">
              <p>{RU.workflow.deleteDialogDescription}</p>
              <div className="workflow-confirm-actions">
                <button type="button" className="primary" onClick={confirmDeleteStage}>
                  {RU.workflow.deleteStage}
                </button>
                <button type="button" onClick={closeDeleteModal}>{RU.common.cancel}</button>
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
          <select
            id="car-number"
            required
            value={formData.carNumber}
            onChange={onFieldChange("carNumber")}
          >
            <option value="" disabled>
              {RU.tripForm.selectCar}
            </option>
            {carNumbers.map((car) => (
              <option key={car} value={car}>
                {car}
              </option>
            ))}
          </select>
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
        <select
          id="driver-name"
          required
          value={formData.driverName}
          onChange={onFieldChange("driverName")}
        >
          <option value="" disabled>
            {RU.tripForm.selectDriver}
          </option>
          {driverNames.map((driver) => (
            <option key={driver} value={driver}>
              {driver}
            </option>
          ))}
        </select>
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
                <label className={`trip-order-item ${checked ? "trip-order-item--checked" : ""}`} key={order.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleOrder(order.id)}
                  />
                  <span className="trip-order-item__content">
                    <span className="trip-order-item__title">{order.name || order.recipient || RU.tripForm.untitledOrder}</span>
                    <span className="trip-order-item__meta">
                      AWB: {order.awb || RU.common.emDash} | {order.quantity || RU.common.emDash} {RU.tripForm.placesUnit} | {order.weight || RU.common.emDash} {RU.tripForm.weightUnit} | {order.customsName || order.customsCode || RU.common.emDash}
                    </span>
                  </span>
                  <span className="trip-order-item__airport">{order.shipmentAirport || RU.common.emDash}</span>
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
            <button type="submit" className="primary" disabled={orders.length === 0 || isPrintLoading}>
              {submitLabel}
            </button>
            <button
              type="button"
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (form && !form.reportValidity()) return;
                onPrint?.();
              }}
              disabled={orders.length === 0 || isPrintLoading}
            >
              {isPrintLoading ? RU.tripForm.printPreparing : RU.tripForm.print}
            </button>
            <button type="button" onClick={() => onCancel?.()} disabled={isPrintLoading}>
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
