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
  powerOfAttorneyStatus,
  recipientSuggestions,
  awbStatusCheck,
  isAwbCheckAvailable,
  isPowerOfAttorneySyncLoading,
  onCheckAwbStatus,
  onOpenManualCheck,
  onRefreshPowerOfAttorneyRegistry,
  onFieldChange,
  onSubmit,
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
    <form onSubmit={onSubmit}>
      <div className="field">
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
        <div className="field">
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
      <div className="field">
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
      <div className="field">
        <label htmlFor="orderName">Название заказа</label>
        <input id="orderName" name="orderName" type="text" readOnly value={formData.orderName} />
        <small>Автоматически формируется по получателю груза.</small>
      </div>
      <div className="field">
        <label htmlFor="awb-prefix">Номер авианакладной *</label>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
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
            style={{ flex: 1 }}
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
        {!isAwbCheckAvailable && (
          <small className="hint">Выберите аэропорт и терминал, затем нажмите "Проверить".</small>
        )}
        {awbStatusCheck?.error && <small style={{ color: "#c0392b" }}>{awbStatusCheck.error}</small>}
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
      <div className="field">
        <label htmlFor="quantity">Количество (шт) *</label>
        <input
          id="quantity"
          name="quantity"
          type="number"
          min="1"
          step="1"
          required
          value={formData.quantity}
          onChange={onFieldChange("quantity")}
        />
      </div>
      <div className="field">
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
        />
      </div>
      <div className="field">
        <label htmlFor="customsCode">Код таможни назначения *</label>
        <input
          id="customsCode"
          name="customsCode"
          type="text"
          placeholder="06536"
          required
          value={formData.customsCode}
          onChange={onFieldChange("customsCode")}
        />
        <small className="hint">{customsName}</small>
      </div>
      <div className="field">
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
      <button type="submit" className="primary">
        Создать заказ
      </button>
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

export function SettingsModal({ isOpen, settingsSections, onClose }) {
  if (!isOpen) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ backgroundColor: "#fff", borderRadius: "8px", padding: "2rem", maxWidth: "700px", width: "92%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)" }}>
        <h2>Настройки</h2>
        <p>Выберите раздел настроек.</p>
        {settingsSections.map((section) => (
          <div key={section.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", padding: "1rem", border: "1px solid #d7deea", borderRadius: "8px" }}>
            <div>
              <strong>{section.title}</strong>
              <div style={{ marginTop: "0.35rem", color: "#4f617e" }}>
                Статус: {section.status}
              </div>
            </div>
            <button type="button" className="primary" onClick={section.onOpen}>
              {section.actionLabel}
            </button>
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

export function EditOrderModal({
  isOpen,
  editingFormData,
  onFieldChange,
  onSave,
  onCancel,
  getCustomsName,
}) {
  if (!isOpen || !editingFormData) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ backgroundColor: "#fff", borderRadius: "8px", padding: "2rem", maxWidth: "600px", width: "90%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)" }}>
        <h2>Редактировать заказ</h2>
        <form>
          <div className="field">
            <label htmlFor="edit-recipient">Получатель груза</label>
            <input id="edit-recipient" type="text" value={editingFormData.recipient || ""} onChange={onFieldChange("recipient")} />
          </div>
          <div className="field">
            <label htmlFor="edit-awb">Номер авианакладной</label>
            <input id="edit-awb" type="text" value={editingFormData.awb || ""} onChange={onFieldChange("awb")} />
          </div>
          <div className="field">
            <label htmlFor="edit-quantity">Количество (шт)</label>
            <input id="edit-quantity" type="number" min="1" value={editingFormData.quantity || ""} onChange={onFieldChange("quantity")} />
          </div>
          <div className="field">
            <label htmlFor="edit-weight">Вес (кг)</label>
            <input id="edit-weight" type="number" min="0" step="0.01" value={editingFormData.weight || ""} onChange={onFieldChange("weight")} />
          </div>
          <div className="field">
            <label htmlFor="edit-customsCode">Код таможни назначения</label>
            <input id="edit-customsCode" type="text" value={editingFormData.customsCode || ""} onChange={onFieldChange("customsCode")} />
            <small className="hint">{editingFormData.customsCode ? getCustomsName(editingFormData.customsCode.trim()) : "Введите код таможни"}</small>
          </div>
          <div className="field">
            <label htmlFor="edit-notes">Примечания</label>
            <textarea id="edit-notes" rows="4" value={editingFormData.notes || ""} onChange={onFieldChange("notes")} />
          </div>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
            <button type="button" className="primary" onClick={onSave}>Сохранить</button>
            <button type="button" onClick={onCancel} style={{ backgroundColor: "#999", color: "#fff", padding: "0.5rem 1rem", border: "none", borderRadius: "3px", cursor: "pointer" }}>Отмена</button>
          </div>
        </form>
      </div>
    </div>
  );
}
