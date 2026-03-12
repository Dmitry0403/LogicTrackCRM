import React from "react";
import { RU } from "../i18n/ru";

export function AppHeader({ driveConnected, onOpenSettings }) {
  return (
    <header className="app__header">
      <div>
        <p className="app__eyebrow">{RU.appHeader.eyebrow}</p>
        <h1>{RU.appHeader.title}</h1>
        <p className="app__subtitle">
          {RU.appHeader.subtitle}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "flex-end" }}>
        <div className={`app__status ${driveConnected ? "app__status--connected" : ""}`}>
          {RU.appHeader.driveLabel}: {driveConnected ? RU.appHeader.driveConnected : RU.appHeader.driveDisconnected}
        </div>
        <button type="button" onClick={onOpenSettings}>
          {RU.appHeader.settings}
        </button>
      </div>
    </header>
  );
}

export function OrderFormCard({
  formData,
  customsName,
  customsSuggestions,
  powerOfAttorneyStatus,
  recipientSuggestions,
  awbStatusCheck,
  isAwbCheckAvailable,
  isPowerOfAttorneySyncLoading,
  onCheckAwbStatus,
  onOpenCargoTerminalFromError,
  onRefreshPowerOfAttorneyRegistry,
  onFieldChange,
  onSubmit,
  onCancel,
  isSaving = false,
  formId,
  showFooterActions = true,
  embedded = false,
}) {
  const handleAwbPrefixChange = (event) => {
    const digits = String(event.target.value || "").replace(/\D/g, "").slice(0, 3);
    onFieldChange("awbPrefix")({ target: { value: digits } });
    if (digits.length === 3) {
      document.getElementById("awb-number")?.focus();
    }
  };

  const handleAwbNumberChange = (event) => {
    const digits = String(event.target.value || "").replace(/\D/g, "").slice(0, 10);
    onFieldChange("awbNumber")({ target: { value: digits } });
  };

  const form = (
    <form id={formId} onSubmit={onSubmit} className="order-form">
      <div className="order-form__column">
        <div className="field">
          <label htmlFor="shipmentAirport">{RU.orderForm.shipmentAirport}</label>
          <select
            id="shipmentAirport"
            name="shipmentAirport"
            required
            value={formData.shipmentAirport}
            onChange={onFieldChange("shipmentAirport")}
          >
            <option value="" disabled>
              {RU.orderForm.selectAirport}
            </option>
            <option value={RU.orderForm.airports.sheremetyevo}>{RU.orderForm.airports.sheremetyevo}</option>
            <option value={RU.orderForm.airports.vnukovo}>{RU.orderForm.airports.vnukovo}</option>
            <option value={RU.orderForm.airports.domodedovo}>{RU.orderForm.airports.domodedovo}</option>
            <option value={RU.orderForm.airports.zhukovsky}>{RU.orderForm.airports.zhukovsky}</option>
          </select>
        </div>
        {formData.shipmentAirport === RU.orderForm.airports.sheremetyevo && (
          <div className="field">
            <span>{RU.orderForm.sheremetyevoTerminal}</span>
            <div className="radio-group" role="radiogroup" aria-label={RU.orderForm.sheremetyevoTerminal}>
              <label className="radio-option" htmlFor="svo-terminal-moscow-cargo">
                <input
                  id="svo-terminal-moscow-cargo"
                  type="radio"
                  name="shipmentTerminal"
                  value={RU.orderForm.terminals.moscowCargo}
                  checked={formData.shipmentTerminal === RU.orderForm.terminals.moscowCargo}
                  onChange={onFieldChange("shipmentTerminal")}
                />
                {RU.orderForm.terminals.moscowCargo}
              </label>
              <label className="radio-option" htmlFor="svo-terminal-shercargo">
                <input
                  id="svo-terminal-shercargo"
                  type="radio"
                  name="shipmentTerminal"
                  value={RU.orderForm.terminals.sheremetyevoCargo}
                  checked={formData.shipmentTerminal === RU.orderForm.terminals.sheremetyevoCargo}
                  onChange={onFieldChange("shipmentTerminal")}
                />
                {RU.orderForm.terminals.sheremetyevoCargo}
              </label>
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor="recipient">{RU.orderForm.recipient}</label>
          <input
            id="recipient"
            name="recipient"
            type="text"
            list="recipient-suggestions"
            placeholder={RU.orderForm.recipientPlaceholder}
            required
            value={formData.recipient}
            className={
              powerOfAttorneyStatus
                ? `recipient-status recipient-status--${powerOfAttorneyStatus.type}`
                : ""
            }
            onChange={onFieldChange("recipient")}
          />
          <datalist id="recipient-suggestions">
            {(recipientSuggestions || []).map((item, index) => (
              <option key={`${item.value}-${item.label}-${index}`} value={item.value} label={item.label} />
            ))}
          </datalist>
          {powerOfAttorneyStatus && (
            <small className={`recipient-status-text recipient-status-text--${powerOfAttorneyStatus.type}`}>
              {powerOfAttorneyStatus.message}
            </small>
          )}
          <div className="registry-actions">
            <button
              type="button"
              onClick={onRefreshPowerOfAttorneyRegistry}
              disabled={isPowerOfAttorneySyncLoading}
            >
              {isPowerOfAttorneySyncLoading ? RU.orderForm.refreshRegistryLoading : RU.orderForm.refreshRegistry}
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="orderName">{RU.orderForm.orderName}</label>
          <input id="orderName" name="orderName" type="text" value={formData.orderName} onChange={onFieldChange("orderName")} />
          <small>{RU.orderForm.orderNameHint}</small>
        </div>
        <div className="field">
          <label htmlFor="awb-prefix">{RU.orderForm.awbNumber}</label>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              id="awb-prefix"
              name="awbPrefix"
              type="text"
              placeholder="876"
              required
              value={formData.awbPrefix || ""}
              onChange={handleAwbPrefixChange}
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              style={{ width: "110px", flex: "0 0 110px", textAlign: "center" }}
            />
            <span>-</span>
            <input
              id="awb-number"
              name="awbNumber"
              type="text"
              placeholder="14889696"
              required
              value={formData.awbNumber || ""}
              onChange={handleAwbNumberChange}
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              style={{ flex: "1 1 160px", minWidth: "140px" }}
            />
            <button
              type="button"
              onClick={onCheckAwbStatus}
              disabled={
                awbStatusCheck?.loading ||
                !isAwbCheckAvailable ||
                !String(formData.awbPrefix || "").trim() ||
                !String(formData.awbNumber || "").trim()
              }
            >
              {awbStatusCheck?.loading ? RU.orderForm.checking : RU.orderForm.check}
            </button>
          </div>
          <div
            style={{
              marginTop: "8px",
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexWrap: "wrap",
              minHeight: "44px",
            }}
          >
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={Boolean(formData.hasHawb)}
                onChange={onFieldChange("hasHawb")}
              />
              HAWB
            </label>
            {formData.hasHawb && (
              <input
                type="text"
                value={formData.hawb || ""}
                onChange={onFieldChange("hawb")}
                placeholder={RU.orderForm.hawbPlaceholder}
                required
                style={{ maxWidth: "260px" }}
              />
            )}
          </div>
          {!isAwbCheckAvailable && (
            <small className="hint">{RU.orderForm.airportTerminalHint}</small>
          )}
          <div className="order-form__awb-status-slot" aria-live="polite">
            {awbStatusCheck?.error && (
              <div className="order-form__awb-status">
                <small className="order-form__awb-status-text">{awbStatusCheck.error}</small>
                <button type="button" onClick={onOpenCargoTerminalFromError}>{RU.orderForm.goToSite}</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="order-form__column">
        <div className="field">
          <label htmlFor="quantity">{RU.orderForm.quantity}</label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="1"
            step="1"
            required
            value={formData.quantity}
            onChange={onFieldChange("quantity")}
            onWheel={(event) => event.currentTarget.blur()}
            onKeyDown={(event) => {
              if (["e", "E", "+", "-"].includes(event.key)) {
                event.preventDefault();
              }
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="weight">{RU.orderForm.weight}</label>
          <input
            id="weight"
            name="weight"
            type="number"
            min="0"
            step="0.01"
            required
            value={formData.weight}
            onChange={onFieldChange("weight")}
            onWheel={(event) => event.currentTarget.blur()}
            onKeyDown={(event) => {
              if (["e", "E", "+", "-"].includes(event.key)) {
                event.preventDefault();
              }
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="customsCode">{RU.orderForm.customsCode}</label>
          <input
            id="customsCode"
            name="customsCode"
            type="text"
            list="customs-code-suggestions"
            placeholder="06536"
            required
            value={formData.customsCode}
            onChange={onFieldChange("customsCode")}
          />
          <datalist id="customs-code-suggestions">
            {(customsSuggestions || []).map((item, index) => (
              <option key={`${item.value}-${index}`} value={item.value} label={item.label} />
            ))}
          </datalist>
          <small className="hint">{customsName}</small>
        </div>
        <div className="field order-form__notes">
          <label htmlFor="notes">{RU.orderForm.notes}</label>
          <textarea
            id="notes"
            name="notes"
            rows="4"
            placeholder={RU.orderForm.notesPlaceholder}
            value={formData.notes}
            onChange={onFieldChange("notes")}
          />
          {showFooterActions && (
            <div className="order-form__actions">
              <button type="submit" className="primary" disabled={isSaving}>
                {isSaving ? RU.common.saveInProgress : RU.common.save}
              </button>
              <button type="button" onClick={() => onCancel?.()} disabled={isSaving}>
                {RU.common.cancel}
              </button>
            </div>
          )}
        </div>
      </div>
    </form>
  );

  if (embedded) return form;

  return (
    <section className="card">
      <h2>{RU.orderForm.saveTitle}</h2>
      {form}
    </section>
  );
}

export function SettingsModal({
  isOpen,
  settingsSections,
  onClose,
}) {
  if (!isOpen) return null;
  const [hoveredSectionId, setHoveredSectionId] = React.useState("");

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ backgroundColor: "#fff", borderRadius: "8px", padding: "2rem", maxWidth: "700px", width: "92%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)" }}>
        <h2>{RU.settingsModal.title}</h2>
        <p>{RU.settingsModal.description}</p>
        {settingsSections.map((section) => (
          <div
            key={section.id}
            role="button"
            tabIndex={0}
            onClick={section.onOpen}
            onMouseEnter={() => setHoveredSectionId(section.id)}
            onMouseLeave={() => setHoveredSectionId("")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                section.onOpen?.();
              }
            }}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              padding: "1rem",
              border: "1px solid #d7deea",
              borderRadius: "8px",
              cursor: "pointer",
              backgroundColor: hoveredSectionId === section.id ? "#eef2f7" : "#fff",
              transition: "background-color 0.15s ease",
            }}
          >
            <div>
              <strong>{section.title}</strong>
              <div style={{ marginTop: "0.35rem", color: "#4f617e" }}>
                {RU.common.status}: {section.status}
              </div>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button type="button" onClick={onClose} style={{ backgroundColor: "#999", color: "#fff", padding: "0.5rem 1rem", border: "none", borderRadius: "3px", cursor: "pointer" }}>
            {RU.common.close}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccountSettingsModal({
  isOpen,
  accountEmail,
  onOpenChangePassword,
  onSignOut,
  onClose,
}) {
  if (!isOpen) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ backgroundColor: "#fff", borderRadius: "8px", padding: "2rem", maxWidth: "700px", width: "92%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)" }}>
        <h2>{RU.accountModal.title}</h2>
        <p>{RU.common.currentUser}: <strong>{accountEmail || RU.common.emDash}</strong></p>
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.9rem" }}>
          <button type="button" className="primary" onClick={onOpenChangePassword}>
            {RU.accountModal.changePassword}
          </button>
          <button type="button" onClick={onSignOut}>
            {RU.accountModal.signOut}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button type="button" onClick={onClose} style={{ backgroundColor: "#999", color: "#fff", padding: "0.5rem 1rem", border: "none", borderRadius: "3px", cursor: "pointer" }}>
            {RU.common.close}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SignatureSettingsModal({
  isOpen,
  printSignerSettings,
  onPrintSignerChange,
  onClose,
}) {
  if (!isOpen) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ backgroundColor: "#fff", borderRadius: "8px", padding: "2rem", maxWidth: "700px", width: "92%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)" }}>
        <h2>{RU.signatureModal.title}</h2>
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.9rem" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 600 }}>{RU.signatureModal.role}</span>
            <input
              type="text"
              value={printSignerSettings?.signerRole || ""}
              onChange={(event) => onPrintSignerChange?.("signerRole", event.target.value)}
              placeholder={RU.signatureModal.rolePlaceholder}
            />
          </label>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 600 }}>{RU.signatureModal.name}</span>
            <input
              type="text"
              value={printSignerSettings?.signerName || ""}
              onChange={(event) => onPrintSignerChange?.("signerName", event.target.value)}
              placeholder={RU.signatureModal.namePlaceholder}
            />
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button type="button" onClick={onClose} style={{ backgroundColor: "#999", color: "#fff", padding: "0.5rem 1rem", border: "none", borderRadius: "3px", cursor: "pointer" }}>{RU.common.save}</button>
        </div>
      </div>
    </div>
  );
}

export function DriveSettingsModal({
  isOpen,
  driveConnected,
  selectedDriveFolder,
  driveHint,
  onConnectGoogleDrive,
  onSelectDriveFolder,
  onDisconnectGoogleDrive,
  onClose,
}) {
  if (!isOpen) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ backgroundColor: "#fff", borderRadius: "8px", padding: "2rem", maxWidth: "700px", width: "92%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)" }}>
        <h2>{RU.driveModal.title}</h2>
        <p>
          {RU.driveModal.description}
        </p>
        <div className="drive-actions">
          <button type="button" onClick={onConnectGoogleDrive}>
            {RU.driveModal.connect}
          </button>
          <button type="button" className="primary" disabled={!driveConnected} onClick={onSelectDriveFolder}>
            {RU.driveModal.chooseFolder}
          </button>
          <button type="button" onClick={onDisconnectGoogleDrive} style={{ backgroundColor: "#999", color: "#fff", padding: "0.5rem 1rem", border: "none", borderRadius: "3px", cursor: "pointer" }}>
            {RU.driveModal.signOut}
          </button>
        </div>
        {selectedDriveFolder && (
          <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f0f8ff", borderRadius: "4px", borderLeft: "4px solid #0066cc" }}>
            <strong>{RU.driveModal.selectedFolder}:</strong> <a href={selectedDriveFolder.url} target="_blank" rel="noopener noreferrer">{selectedDriveFolder.name}</a>
          </div>
        )}
        <div className="drive-hint">{driveHint}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button type="button" onClick={onClose} style={{ backgroundColor: "#999", color: "#fff", padding: "0.5rem 1rem", border: "none", borderRadius: "3px", cursor: "pointer" }}>
            {RU.common.close}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrdersTable({ orders, onEditClick, onDelete, onCreateOrder, embedded = false }) {
  const table = (
    <div className="table">
      <div className="table__row table__head">
        <span>{RU.ordersTable.name}</span>
        <span>{RU.ordersTable.recipient}</span>
        <span>{RU.ordersTable.awb}</span>
        <span>{RU.ordersTable.quantity}</span>
        <span>{RU.ordersTable.weight}</span>
        <span>{RU.ordersTable.customs}</span>
        <span>{RU.ordersTable.driveFolder}</span>
        <span>{RU.ordersTable.actions}</span>
      </div>
      <div className="table__body">
        {orders.length === 0 ? (
          <div className="table__empty">{RU.ordersTable.empty}</div>
        ) : (
          orders.map((order) => (
            <div className="table__row" key={order.id}>
              <span>{order.name}</span>
              <span>{order.recipient}</span>
              <span>{order.awb}</span>
              <span>{order.quantity}</span>
              <span>{order.weight}</span>
              <span>{order.customsName}</span>
              <span>{order.driveFolder || RU.common.emDash}</span>
              <span style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", cursor: "pointer", backgroundColor: "#0066cc", color: "#fff", border: "none", borderRadius: "3px" }} onClick={() => onEditClick(order)}>{RU.ordersTable.editShort}</button>
                <button type="button" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", cursor: "pointer", backgroundColor: "#cc0000", color: "#fff", border: "none", borderRadius: "3px" }} onClick={() => onDelete(order.id)}>{RU.ordersTable.delete}</button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  if (embedded) return table;

  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{RU.ordersTable.title}</h2>
        <button type="button" className="primary" onClick={onCreateOrder}>
          {RU.ordersTable.create}
        </button>
      </div>
      {table}
    </section>
  );
}
