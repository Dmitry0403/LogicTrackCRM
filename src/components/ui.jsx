import React from "react";

export function AppHeader({ driveConnected, onOpenSettings }) {
  return (
    <header className="app__header">
      <div>
        <p className="app__eyebrow">Transport Logistics CRM</p>
        <h1>Контроль и сопровождение заказов</h1>
        <p className="app__subtitle">
          Первый этап: создание заказа, контроль данных, подготовка к синхронизации с Google Drive.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "flex-end" }}>
        <div className={`app__status ${driveConnected ? "app__status--connected" : ""}`}>
          Google Drive: {driveConnected ? "подключен" : "не подключен"}
        </div>
        <button type="button" onClick={onOpenSettings}>
          Настройки
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
  onOpenManualCheck,
  onOpenCargoTerminalFromError,
  onRefreshPowerOfAttorneyRegistry,
  onFieldChange,
  onSubmit,
  onCancel,
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
    <form onSubmit={onSubmit} className="order-form">
      <div className="field order-form__left">
        <label htmlFor="shipmentAirport">Аэропорт отгрузки *</label>
        <select
          id="shipmentAirport"
          name="shipmentAirport"
          required
          value={formData.shipmentAirport}
          onChange={onFieldChange("shipmentAirport")}
        >
          <option value="" disabled>
            Выберите аэропорт
          </option>
          <option value="Шереметьево">Шереметьево</option>
          <option value="Внуково">Внуково</option>
          <option value="Домодедово">Домодедово</option>
          <option value="Жуковский">Жуковский</option>
        </select>
      </div>
      {formData.shipmentAirport === "Шереметьево" && (
        <div className="field order-form__left">
          <span>Терминал в Шереметьево *</span>
          <div className="radio-group" role="radiogroup" aria-label="Терминал в Шереметьево">
            <label className="radio-option" htmlFor="svo-terminal-moscow-cargo">
              <input
                id="svo-terminal-moscow-cargo"
                type="radio"
                name="shipmentTerminal"
                value="Москва-карго"
                checked={formData.shipmentTerminal === "Москва-карго"}
                onChange={onFieldChange("shipmentTerminal")}
              />
              Москва-карго
            </label>
            <label className="radio-option" htmlFor="svo-terminal-shercargo">
              <input
                id="svo-terminal-shercargo"
                type="radio"
                name="shipmentTerminal"
                value="Шереметьево-карго"
                checked={formData.shipmentTerminal === "Шереметьево-карго"}
                onChange={onFieldChange("shipmentTerminal")}
              />
              Шереметьево-карго
            </label>
          </div>
        </div>
      )}
      <div className="field order-form__left">
        <label htmlFor="recipient">Получатель груза *</label>
        <input
          id="recipient"
          name="recipient"
          type="text"
          list="recipient-suggestions"
          placeholder="ООО Логистик Про"
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
            {isPowerOfAttorneySyncLoading ? "Обновляем..." : "Обновить реестр"}
          </button>
        </div>
      </div>
      <div className="field order-form__left">
        <label htmlFor="orderName">Название заказа</label>
        <input id="orderName" name="orderName" type="text" value={formData.orderName} onChange={onFieldChange("orderName")} />
        <small>Автоматически формируется по получателю груза.</small>
      </div>
      <div className="field order-form__left">
        <label htmlFor="awb-prefix">Номер авианакладной *</label>
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
            {awbStatusCheck?.loading ? "Проверяем..." : "Проверить"}
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
              placeholder="Введите HAWB"
              required
              style={{ maxWidth: "260px" }}
            />
          )}
        </div>
        {!isAwbCheckAvailable && (
          <small className="hint">Выберите аэропорт и терминал, затем нажмите "Проверить".</small>
        )}
        {awbStatusCheck?.error && (
          <div style={{ marginTop: "8px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <small style={{ color: "#c0392b" }}>{awbStatusCheck.error}</small>
            <button type="button" onClick={onOpenCargoTerminalFromError}>{"\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043d\u0430 \u0441\u0430\u0439\u0442"}</button>
          </div>
        )}
        {awbStatusCheck?.data?.manualRequired && (
          <div style={{ marginTop: "8px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <small style={{ color: "#c0392b", fontWeight: 700 }}>
              {awbStatusCheck?.data?.manualMessage || "Требуется ручная проверка на сайте Внуково."}
            </small>
            <button type="button" onClick={onOpenManualCheck}>
              Открыть сайт Внуково
            </button>
          </div>
        )}
      </div>
      <div className="field order-form__right">
        <label htmlFor="quantity">Количество (мест) *</label>
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
      <div className="field order-form__right">
        <label htmlFor="weight">Вес (кг) *</label>
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
      <div className="field order-form__right">
        <label htmlFor="customsCode">Код таможни назначения *</label>
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
      <div className="field order-form__right">
        <label htmlFor="notes">Примечания</label>
        <textarea
          id="notes"
          name="notes"
          rows="4"
          placeholder="Дополнительные инструкции..."
          value={formData.notes}
          onChange={onFieldChange("notes")}
        />
      </div>
      <div className="order-form__actions">
        <button type="submit" className="primary">
          Сохранить
        </button>
        <button type="button" onClick={() => onCancel?.()}>
          Отменить
        </button>
      </div>
    </form>
  );

  if (embedded) return form;

  return (
    <section className="card">
      <h2>Новый заказ</h2>
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
        <h2>Настройки</h2>
        <p>Выберите раздел настроек.</p>
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
                Статус: {section.status}
              </div>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button type="button" onClick={onClose} style={{ backgroundColor: "#999", color: "#fff", padding: "0.5rem 1rem", border: "none", borderRadius: "3px", cursor: "pointer" }}>
            Закрыть
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
        <h2>Аккаунт</h2>
        <p>Текущий пользователь: <strong>{accountEmail || "—"}</strong></p>
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.9rem" }}>
          <button type="button" className="primary" onClick={onOpenChangePassword}>
            Изменить пароль
          </button>
          <button type="button" onClick={onSignOut}>
            Выйти
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button type="button" onClick={onClose} style={{ backgroundColor: "#999", color: "#fff", padding: "0.5rem 1rem", border: "none", borderRadius: "3px", cursor: "pointer" }}>
            Закрыть
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
        <h2>Подпись печатной формы</h2>
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.9rem" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 600 }}>Должность</span>
            <input
              type="text"
              value={printSignerSettings?.signerRole || ""}
              onChange={(event) => onPrintSignerChange?.("signerRole", event.target.value)}
              placeholder="Менеджер"
            />
          </label>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 600 }}>ФИО</span>
            <input
              type="text"
              value={printSignerSettings?.signerName || ""}
              onChange={(event) => onPrintSignerChange?.("signerName", event.target.value)}
              placeholder="Косенко Д.В."
            />
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button type="button" onClick={onClose} style={{ backgroundColor: "#999", color: "#fff", padding: "0.5rem 1rem", border: "none", borderRadius: "3px", cursor: "pointer" }}>Сохранить</button>
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
        <h2>Google Drive синхронизация</h2>
        <p>
          Выберите папку в Google Drive, где будут автоматически создаваться и управляться папки заказов.
        </p>
        <div className="drive-actions">
          <button type="button" onClick={onConnectGoogleDrive}>
            Подключить Google Drive
          </button>
          <button type="button" className="primary" disabled={!driveConnected} onClick={onSelectDriveFolder}>
            Выбрать папку
          </button>
          <button type="button" onClick={onDisconnectGoogleDrive} style={{ backgroundColor: "#999", color: "#fff", padding: "0.5rem 1rem", border: "none", borderRadius: "3px", cursor: "pointer" }}>
            Выйти
          </button>
        </div>
        {selectedDriveFolder && (
          <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f0f8ff", borderRadius: "4px", borderLeft: "4px solid #0066cc" }}>
            <strong>Выбранная папка:</strong> <a href={selectedDriveFolder.url} target="_blank" rel="noopener noreferrer">{selectedDriveFolder.name}</a>
          </div>
        )}
        <div className="drive-hint">{driveHint}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button type="button" onClick={onClose} style={{ backgroundColor: "#999", color: "#fff", padding: "0.5rem 1rem", border: "none", borderRadius: "3px", cursor: "pointer" }}>
            Закрыть
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
        <span>Название</span>
        <span>Получатель</span>
        <span>Авианакладная</span>
        <span>Кол-во</span>
        <span>Вес</span>
        <span>Таможня</span>
        <span>Папка Drive</span>
        <span>Действия</span>
      </div>
      <div className="table__body">
        {orders.length === 0 ? (
          <div className="table__empty">Пока нет созданных заказов.</div>
        ) : (
          orders.map((order) => (
            <div className="table__row" key={order.id}>
              <span>{order.name}</span>
              <span>{order.recipient}</span>
              <span>{order.awb}</span>
              <span>{order.quantity}</span>
              <span>{order.weight}</span>
              <span>{order.customsName}</span>
              <span>{order.driveFolder || "—"}</span>
              <span style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", cursor: "pointer", backgroundColor: "#0066cc", color: "#fff", border: "none", borderRadius: "3px" }} onClick={() => onEditClick(order)}>Ред.</button>
                <button type="button" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", cursor: "pointer", backgroundColor: "#cc0000", color: "#fff", border: "none", borderRadius: "3px" }} onClick={() => onDelete(order.id)}>Удалить</button>
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
        <h2 style={{ margin: 0 }}>Реестр заказов</h2>
        <button type="button" className="primary" onClick={onCreateOrder}>
          Создать заказ
        </button>
      </div>
      {table}
    </section>
  );
}
