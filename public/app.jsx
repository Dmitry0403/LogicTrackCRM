const DRIVE_CONFIG = {
  // Заполните CLIENT_ID (OAuth 2.0 Client ID).
  // В Google Cloud Console добавьте в Authorized redirect URIs точно один из следующих адресов,
  // который вы используете в приложении (рекомендация — редирект на корень):
  //   http://localhost:8000/
  // или (альтернатива):
  //   http://localhost:8000/oauth2callback/
  // Используйте именно тот вариант, который указан в DRIVE_CONFIG.REDIRECT_URI ниже.
  CLIENT_ID: "871304525132-qthes7joe12266gfuq0jf8dftmv2b5p6.apps.googleusercontent.com",
  API_KEY: "AIzaSyCqQwSLCTpA-5JKxC6OPlZLtew1AD0Dems",
  // Для PKCE в SPA client secret не обязателен и не должен храниться в коде.
  REDIRECT_URI: "http://localhost:8000/",
  SCOPE: "https://www.googleapis.com/auth/drive.file",
};

let pickerApiLoadPromise = null;

const loadGooglePickerApi = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('window is not available'));
  }

  if (window.google && window.google.picker) {
    return Promise.resolve();
  }

  if (!window.gapi || typeof window.gapi.load !== 'function') {
    return Promise.reject(new Error('Google API script is not loaded'));
  }

  if (!pickerApiLoadPromise) {
    pickerApiLoadPromise = new Promise((resolve, reject) => {
      window.gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Failed to load Google Picker API')),
      });
    });
  }

  return pickerApiLoadPromise;
};

// --- PKCE helpers ---
const base64url = (input) => {
  // input: ArrayBuffer or Uint8Array
  let str = '';
  const bytes = new Uint8Array(input);
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const generateCodeVerifier = () => {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return base64url(array);
};

const sha256 = async (plain) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return hash;
};

const generateCodeChallenge = async (verifier) => {
  const hashed = await sha256(verifier);
  return base64url(hashed);
};

// Helpers to store tokens
const getStoredTokens = () => {
  try {
    return JSON.parse(localStorage.getItem('gdrive_tokens') || '{}');
  } catch (e) {
    return {};
  }
};

const setStoredTokens = (tokens) => {
  localStorage.setItem('gdrive_tokens', JSON.stringify(tokens));
};


const customsCodeMap = {
  "06536": "ПТО Аэропорт Минск",
  "06533": "ПТО Минск-СЭЗ",
  "06529": "ПТО Колядичи-авто",
  "06611": "ПТО Белкульторг",
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

const getCustomsName = (code) => customsCodeMap[code] || "Введите правильный код";

const loadOrders = () => {
  const stored = localStorage.getItem("logictrack_orders");
  return stored ? JSON.parse(stored) : [];
};

const saveOrders = (orders) => {
  localStorage.setItem("logictrack_orders", JSON.stringify(orders));
};

const App = () => {
  const [orders, setOrders] = React.useState(loadOrders);
  const [driveConnected, setDriveConnected] = React.useState(false);
  const [driveHint, setDriveHint] = React.useState(
    "Чтобы активировать синхронизацию, укажите CLIENT_ID и API_KEY в app.jsx."
  );

  const [formData, setFormData] = React.useState({
    recipient: "",
    orderName: "",
    awb: "",
    quantity: "",
    weight: "",
    customsCode: "",
    notes: "",
  });

  // Editing state
  const [editingOrderId, setEditingOrderId] = React.useState(null);
  const [editingFormData, setEditingFormData] = React.useState(null);
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [showSettingsModal, setShowSettingsModal] = React.useState(false);
  const [showDriveSettingsModal, setShowDriveSettingsModal] = React.useState(false);

  // Выбранная папка Google Drive для сохранения заказов
  const [selectedDriveFolder, setSelectedDriveFolder] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem('gdrive_selected_folder') || 'null');
    } catch (e) {
      return null;
    }
  });

  React.useEffect(() => {
    saveOrders(orders);
  }, [orders]);

  // Сохранить выбранную папку в localStorage
  React.useEffect(() => {
    if (selectedDriveFolder) {
      localStorage.setItem('gdrive_selected_folder', JSON.stringify(selectedDriveFolder));
    }
  }, [selectedDriveFolder]);

  // On app load: handle OAuth redirect, check stored tokens and refresh if needed
  React.useEffect(() => {
    (async () => {
      // If tokens exist and not expired, mark connected
      const toks = getStoredTokens();
      if (toks && toks.access_token && toks.expires_at && Date.now() < toks.expires_at - 60000) {
        setDriveConnected(true);
        setDriveHint('Google Drive: подключено (токен в localStorage).');
        return; // Выходим, если токен еще валидный
      }

      // Если есть refresh_token, пытаемся обновить access_token
      if (toks && toks.refresh_token) {
        try {
          setDriveHint('Обновляю токен доступа...');
          const res = await fetch('http://localhost:3001/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: toks.refresh_token, grant_type: 'refresh_token' }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error_description || data.error);
          
          const newTokens = {
            ...toks,
            access_token: data.access_token,
            expires_at: Date.now() + (data.expires_in || 3600) * 1000,
          };
          setStoredTokens(newTokens);
          setDriveConnected(true);
          setDriveHint('Google Drive: переподключено (обновлён токен).');
          return;
        } catch (err) {
          console.warn('Не удалось обновить токен:', err.message);
          // Продолжаем дальше, ниже обработаем redirect code если есть
        }
      }

      // Проверить, пришёл ли код авторизации после редиректа
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (!code) return;

      try {
        setDriveHint('Обмениваю код авторизации на токен (через локальный прокси)...');
        const res = await fetch('http://localhost:3001/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error_description || data.error || JSON.stringify(data));

        const tokens = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        };
        setStoredTokens(tokens);
        setDriveConnected(true);
        setDriveHint('Успешно подключено к Google Drive (через сервер).');

        // Remove code from URL
        const url = new URL(window.location);
        url.searchParams.delete('code');
        window.history.replaceState({}, document.title, url.toString());
      } catch (err) {
        console.error(err);
        setDriveHint('Ошибка при получении токена: ' + (err.message || err));
      }
    })();
  }, []);


  const customsName = formData.customsCode
    ? getCustomsName(formData.customsCode.trim())
    : "Введите код таможни";

  const handleFieldChange = (field) => (event) => {
    const value = event.target.value;
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "recipient") {
        next.orderName = value.trim();
      }
      return next;
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const order = {
      id: `order-${Date.now()}`,
      name: formData.orderName.trim(),
      recipient: formData.recipient.trim(),
      awb: formData.awb.trim(),
      quantity: formData.quantity.trim(),
      weight: formData.weight.trim(),
      customsCode: formData.customsCode.trim(),
      customsName: getCustomsName(formData.customsCode.trim()),
      notes: formData.notes.trim(),
      driveFolder: null,
      driveFolderId: null,
    };

    setOrders((prev) => [order, ...prev]);

    // Автоматически создать папку в Google Drive если подключено
    if (driveConnected) {
      createDriveFolderForOrder(order.name, order.id);
    }

    setFormData({
      recipient: "",
      orderName: "",
      awb: "",
      quantity: "",
      weight: "",
      customsCode: "",
      notes: "",
    });
  };

  const connectGoogleDrive = async () => {
    if (!DRIVE_CONFIG.CLIENT_ID) {
      setDriveHint('Нужен CLIENT_ID. Добавьте его в app.jsx для подключения.');
      return;
    }

    try {
      const params = new URLSearchParams({
        client_id: DRIVE_CONFIG.CLIENT_ID,
        redirect_uri: DRIVE_CONFIG.REDIRECT_URI,
        response_type: 'code',
        scope: DRIVE_CONFIG.SCOPE,
        access_type: 'offline', // get refresh_token
        include_granted_scopes: 'true',
        prompt: 'consent',
      });

      // Redirect to Google OAuth 2.0 authorization endpoint (server-side code exchange)
      window.location = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    } catch (err) {
      console.error(err);
      setDriveHint('Ошибка инициации авторизации: ' + (err.message || err));
    }
  };

  const ensureAccessToken = async () => {
    const toks = getStoredTokens();
    if (toks && toks.access_token && toks.expires_at && Date.now() < toks.expires_at - 60000) {
      return toks.access_token;
    }

    // Try GIS token client first (no client_secret required)
    if (typeof gisTokenClient !== 'undefined' && gisTokenClient) {
      try {
        const token = await new Promise((resolve, reject) => {
          gisPendingResolver = { resolve, reject };
          // If user already consented, prompt can be empty, otherwise 'consent' will show screen
          gisTokenClient.requestAccessToken({ prompt: '' });
        });
        return token;
      } catch (err) {
        console.error('GIS token request failed', err);
        // fall through to try refresh_token if available
      }
    }

    // Fallback: try refresh token (server flow)
    if (toks && toks.refresh_token) {
      try {
        const res = await fetch('http://localhost:3001/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: toks.refresh_token, grant_type: 'refresh_token' }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error_description || data.error || JSON.stringify(data));
        const newTokens = {
          ...toks,
          access_token: data.access_token,
          expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        };
        setStoredTokens(newTokens);
        setDriveConnected(true);
        return newTokens.access_token;
      } catch (err) {
        console.error(err);
        throw err;
      }
    }

    throw new Error('Требуется авторизация');
  };

  // Создать папку в Google Drive для заказа
  const createDriveFolderForOrder = async (orderName, orderId) => {
    try {
      const accessToken = await ensureAccessToken();
      const bodyObj = { name: orderName, mimeType: 'application/vnd.google-apps.folder' };
      
      // Если выбрана папка, создать подпапку внутри неё
      if (selectedDriveFolder && selectedDriveFolder.id) {
        bodyObj.parents = [selectedDriveFolder.id];
      }
      
      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyObj),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      
      const folderUrl = `https://drive.google.com/drive/folders/${data.id}`;
      // Обновить заказ с ссылкой на папку
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, driveFolder: folderUrl, driveFolderId: data.id } : o))
      );
      console.log('Папка создана:', folderUrl);
      return { folderId: data.id, folderUrl };
    } catch (err) {
      console.error('Ошибка создания папки:', err);
      // Не прерываем процесс создания заказа если Google Drive недоступен
    }
  };

  // Переименовать папку в Google Drive
  const updateDriveFolderName = async (folderId, newName) => {
    if (!folderId) return;
    try {
      const accessToken = await ensureAccessToken();
      await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName }),
      });
      console.log('Папка переименована на:', newName);
    } catch (err) {
      console.error('Ошибка переименования папки:', err);
    }
  };

  // Удалить папку в Google Drive
  const deleteDriveFolder = async (folderId) => {
    if (!folderId) return;
    try {
      const accessToken = await ensureAccessToken();
      await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      console.log('Папка удалена:', folderId);
    } catch (err) {
      console.error('Ошибка удаления папки:', err);
    }
  };

  const selectDriveFolder = async () => {
    if (!driveConnected) {
      setDriveHint('Сначала подключите Google Drive.');
      return;
    }

    try {
      const accessToken = await ensureAccessToken();
      await loadGooglePickerApi();
      
      // Проверить, загружена ли Google Picker API
      if (!DRIVE_CONFIG.API_KEY) {
        setDriveHint('Укажите API_KEY в DRIVE_CONFIG, чтобы открыть выбор папки.');
        return;
      }

      if (typeof google === 'undefined' || typeof google.picker === 'undefined') {
        setDriveHint('Google Picker API ещё не загружена. Попробуйте через секунду.');
        return;
      }

      setDriveHint('Открываю выбор папки Google Drive...');
      
      // Создать Picker для выбора папки
      const folderView = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true);

      const picker = new google.picker.PickerBuilder()
        .addView(folderView)
        .setDeveloperKey(DRIVE_CONFIG.API_KEY)
        .setOAuthToken(accessToken)
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) {
            const folderData = data.docs[0];
            const folderObj = {
              id: folderData.id,
              name: folderData.name,
              url: `https://drive.google.com/drive/folders/${folderData.id}`,
            };
            setSelectedDriveFolder(folderObj);
            setDriveHint(`Папка выбрана: ${folderObj.name}`);
            console.log('Выбрана папка:', folderObj);
          } else if (data.action === google.picker.Action.CANCEL) {
            setDriveHint('Выбор папки отменён.');
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      console.error(err);
      setDriveHint('Ошибка открытия выбора папки: ' + (err.message || err));
    }
  };

  const handleDisconnectGoogleDrive = () => {
    localStorage.removeItem('gdrive_tokens');
    localStorage.removeItem('gdrive_selected_folder');
    setDriveConnected(false);
    setSelectedDriveFolder(null);
    setDriveHint('Токены очищены. Нажмите "Подключить Google Drive" заново.');
  };

  // Delete order
  const handleDelete = async (orderId) => {
    if (confirm('Вы уверены? Этот заказ и его папка в Google Drive будут удалены.')) {
      // Найти заказ и удалить его папку в Google Drive
      const orderToDelete = orders.find((o) => o.id === orderId);
      if (orderToDelete && orderToDelete.driveFolderId) {
        await deleteDriveFolder(orderToDelete.driveFolderId);
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    }
  };

  // Open edit modal
  const handleEditClick = (order) => {
    setEditingOrderId(order.id);
    setEditingFormData({ ...order });
    setShowEditModal(true);
  };

  // Handle edit form change
  const handleEditFieldChange = (field) => (event) => {
    const value = event.target.value;
    setEditingFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'recipient') {
        next.orderName = value.trim();
        next.name = value.trim();
      }
      return next;
    });
  };

  // Save edit
  const handleSaveEdit = () => {
    if (!editingFormData) return;
    
    // Найти оригинальный заказ чтобы проверить изменилось ли имя
    const originalOrder = orders.find((o) => o.id === editingOrderId);
    if (originalOrder && editingFormData.name !== originalOrder.name && editingFormData.driveFolderId) {
      // Переименовать папку в Google Drive если имя изменилось
      updateDriveFolderName(editingFormData.driveFolderId, editingFormData.name);
    }

    setOrders((prev) =>
      prev.map((o) => (o.id === editingOrderId ? editingFormData : o))
    );
    setShowEditModal(false);
    setEditingOrderId(null);
    setEditingFormData(null);
  };

  // Cancel edit
  const handleCancelEdit = () => {
    setShowEditModal(false);
    setEditingOrderId(null);
    setEditingFormData(null);
  };

  const settingsSections = [
    {
      id: 'google-drive',
      title: 'Google Drive',
      status: driveConnected ? 'подключен' : 'не подключен',
      actionLabel: 'Открыть',
      onOpen: () => {
        setShowSettingsModal(false);
        setShowDriveSettingsModal(true);
      },
    },
  ];

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <p className="app__eyebrow">Transport Logistics CRM</p>
          <h1>Контроль и сопровождение заказов</h1>
          <p className="app__subtitle">
            Первый этап: создание заказа, контроль данных, подготовка к синхронизации с Google Drive.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div className={`app__status ${driveConnected ? "app__status--connected" : ""}`}>
            Google Drive: {driveConnected ? "подключен" : "не подключен"}
          </div>
          <button type="button" onClick={() => setShowSettingsModal(true)}>
            Настройки
          </button>
        </div>
      </header>

      <main className="grid">
        <section className="card">
          <h2>Новый заказ</h2>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="recipient">Получатель груза *</label>
              <input
                id="recipient"
                name="recipient"
                type="text"
                placeholder="ООО Логистик Про"
                required
                value={formData.recipient}
                onChange={handleFieldChange("recipient")}
              />
            </div>
            <div className="field">
              <label htmlFor="orderName">Название заказа</label>
              <input id="orderName" name="orderName" type="text" readOnly value={formData.orderName} />
              <small>Автоматически формируется по получателю груза.</small>
            </div>
            <div className="field">
              <label htmlFor="awb">Номер авианакладной *</label>
              <input
                id="awb"
                name="awb"
                type="text"
                placeholder="123-45678901"
                required
                value={formData.awb}
                onChange={handleFieldChange("awb")}
              />
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
                onChange={handleFieldChange("quantity")}
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
                onChange={handleFieldChange("weight")}
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
                onChange={handleFieldChange("customsCode")}
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
                onChange={handleFieldChange("notes")}
              />
            </div>
            <button type="submit" className="primary">
              Создать заказ
            </button>
          </form>
        </section>

      </main>

      {showSettingsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '2rem', maxWidth: '700px', width: '92%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)' }}>
            <h2>Настройки</h2>
            <p>Выберите раздел настроек.</p>
            {settingsSections.map((section) => (
              <div key={section.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid #d7deea', borderRadius: '8px' }}>
                <div>
                  <strong>{section.title}</strong>
                  <div style={{ marginTop: '0.35rem', color: '#4f617e' }}>
                    Статус: {section.status}
                  </div>
                </div>
                <button
                  type="button"
                  className="primary"
                  onClick={section.onOpen}
                >
                  {section.actionLabel}
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button type="button" onClick={() => setShowSettingsModal(false)} style={{ backgroundColor: '#999', color: '#fff', padding: '0.5rem 1rem', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {showDriveSettingsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '2rem', maxWidth: '700px', width: '92%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)' }}>
            <h2>Google Drive синхронизация</h2>
            <p>
              Выберите папку в Google Drive, где будут автоматически создаваться и управляться папки заказов.
            </p>
            <div className="drive-actions">
              <button type="button" onClick={connectGoogleDrive}>
                Подключить Google Drive
              </button>
              <button type="button" className="primary" disabled={!driveConnected} onClick={selectDriveFolder}>
                Выбрать папку
              </button>
              <button type="button" onClick={handleDisconnectGoogleDrive} style={{ backgroundColor: '#999', color: '#fff', padding: '0.5rem 1rem', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                Выйти
              </button>
            </div>
            {selectedDriveFolder && (
              <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f0f8ff', borderRadius: '4px', borderLeft: '4px solid #0066cc' }}>
                <strong>Выбранная папка:</strong> <a href={selectedDriveFolder.url} target="_blank" rel="noopener noreferrer">{selectedDriveFolder.name}</a>
              </div>
            )}
            <div className="drive-hint">{driveHint}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button type="button" onClick={() => setShowDriveSettingsModal(false)} style={{ backgroundColor: '#999', color: '#fff', padding: '0.5rem 1rem', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="card">
        <h2>Реестр заказов</h2>
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
                  <span style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer', backgroundColor: '#0066cc', color: '#fff', border: 'none', borderRadius: '3px' }} onClick={() => handleEditClick(order)}>Ред.</button>
                    <button type="button" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer', backgroundColor: '#cc0000', color: '#fff', border: 'none', borderRadius: '3px' }} onClick={() => handleDelete(order.id)}>Удалить</button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {showEditModal && editingFormData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '2rem', maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)' }}>
            <h2>Редактировать заказ</h2>
            <form>
              <div className="field">
                <label htmlFor="edit-recipient">Получатель груза</label>
                <input id="edit-recipient" type="text" value={editingFormData.recipient || ''} onChange={handleEditFieldChange('recipient')} />
              </div>
              <div className="field">
                <label htmlFor="edit-awb">Номер авианакладной</label>
                <input id="edit-awb" type="text" value={editingFormData.awb || ''} onChange={handleEditFieldChange('awb')} />
              </div>
              <div className="field">
                <label htmlFor="edit-quantity">Количество (шт)</label>
                <input id="edit-quantity" type="number" min="1" value={editingFormData.quantity || ''} onChange={handleEditFieldChange('quantity')} />
              </div>
              <div className="field">
                <label htmlFor="edit-weight">Вес (кг)</label>
                <input id="edit-weight" type="number" min="0" step="0.01" value={editingFormData.weight || ''} onChange={handleEditFieldChange('weight')} />
              </div>
              <div className="field">
                <label htmlFor="edit-customsCode">Код таможни назначения</label>
                <input id="edit-customsCode" type="text" value={editingFormData.customsCode || ''} onChange={handleEditFieldChange('customsCode')} />
                <small className="hint">{editingFormData.customsCode ? getCustomsName(editingFormData.customsCode.trim()) : 'Введите код таможни'}</small>
              </div>
              <div className="field">
                <label htmlFor="edit-notes">Примечания</label>
                <textarea id="edit-notes" rows="4" value={editingFormData.notes || ''} onChange={handleEditFieldChange('notes')} />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="button" className="primary" onClick={handleSaveEdit}>Сохранить</button>
                <button type="button" onClick={handleCancelEdit} style={{ backgroundColor: '#999', color: '#fff', padding: '0.5rem 1rem', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>Отмена</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
