const logger = DeviceRuntimeCore.HmLogger.getLogger("ha-zepp-main");

const preferedLang = [
    hmFS.SysProGetChars("mmk_tb_lang"),
    DeviceRuntimeCore.HmUtils.getLanguage(),
    "en-US"
];
const strings = {
  "favorites": {
      "en-US": "Favorites",
      "es-ES": "Favoritos",
      "ca-ES": "Favorits",
      "it-IT": "Preferiti",
      "fr-FR": "Favoris",
      "pt-PT": "Favoritos",
      "pt-BR": "Favoritos",
      "zh-CN": "收藏",
      "ru-RU": "Избранное",
      "ja-JP": "お気に入り"
  },
  "Prev": {
      "en-US": "Prev",
      "es-ES": "Ant",
      "ca-ES": "Ant",
      "it-IT": "Prec",
      "fr-FR": "Préc",
      "pt-PT": "Ant",
      "pt-BR": "Ant",
      "zh-CN": "上一页",
      "ru-RU": "Назад",
      "ja-JP": "前へ"
  },
  "Next": {
      "en-US": "Next",
      "es-ES": "Sig",
      "ca-ES": "Seg",
      "it-IT": "Succ",
      "fr-FR": "Suiv",
      "pt-PT": "Próx",
      "pt-BR": "Próx",
      "zh-CN": "下一页",
      "ru-RU": "Далее",
      "ja-JP": "次へ"
  },
  "Page": {
      "en-US": "Page",
      "es-ES": "Pág",
      "ca-ES": "Pàg",
      "it-IT": "Pag",
      "fr-FR": "Page",
      "pt-PT": "Pág",
      "pt-BR": "Pág",
      "zh-CN": "页",
      "ru-RU": "Стр",
      "ja-JP": "ページ"
  },
  "devices": {
      "en-US": "Devices",
      "es-ES": "Dispositivos",
      "ca-ES": "Dispositius",
      "it-IT": "Dispositivi",
      "fr-FR": "Appareils",
      "pt-PT": "Dispositivos",
      "pt-BR": "Dispositivos",
      "zh-CN": "设备",
      "ru-RU": "Устройства",
      "ja-JP": "デバイス"
  },
  "scripts": {
      "en-US": "Scripts",
      "es-ES": "Scripts",
      "ca-ES": "Scripts",
      "it-IT": "Script",
      "fr-FR": "Scripts",
      "pt-PT": "Scripts",
      "pt-BR": "Scripts",
      "zh-CN": "脚本",
      "ru-RU": "Сценарии",
      "ja-JP": "スクリプト"
  },  
  "sensors": {
      "en-US": "Sensors",
      "es-ES": "Sensores",
      "ca-ES": "Sensors",
      "it-IT": "Sensori",
      "fr-FR": "Capteurs",
      "pt-PT": "Sensores",
      "pt-BR": "Sensores",
      "zh-CN": "传感器",
      "ru-RU": "Датчики",
      "ja-JP": "センサー"
  },
  "details": {
      "en-US": "Details",
      "es-ES": "Detalles",
      "ca-ES": "Detalls",
      "it-IT": "Dettagli",
      "fr-FR": "Détails",
      "pt-PT": "Detalhes",
      "pt-BR": "Detalhes",
      "zh-CN": "详情",
      "ru-RU": "Детали",
      "ja-JP": "詳細"
  },
  "No connection to\n the application": {
      "en-US": "No connection to\n the application",
      "es-ES": "No hay conexión con\n la aplicación",
      "ca-ES": "Sense connexió amb\n l'aplicació",
      "it-IT": "Nessuna connessione all'\n applicazione",
      "fr-FR": "Pas de connexion à\n l'application",
      "pt-PT": "Sem conexão com\n a aplicação",
      "pt-BR": "Sem conexão com\n o aplicativo",
      "zh-CN": "未连接到\n 应用程序",
      "ru-RU": "Нет подключения к\n приложению",
      "ja-JP": "アプリケーションに\n接続していません"
  },
  "Loading...": {
      "en-US": "Loading...",
      "es-ES": "Cargando...",
      "ca-ES": "Carregant...",
      "it-IT": "Caricamento in corso...",
      "fr-FR": "Chargement...",
      "pt-PT": "Carregando...",
      "pt-BR": "Carregando...",
      "zh-CN": "加载中...",
      "ru-RU": "Загрузка...",
      "ja-JP": "読み込み中..."
  },
  "unavailable": {
      "en-US": "Unavailable",
      "es-ES": "No disponible",
      "ca-ES": "No disponible",
      "it-IT": "Non disponibile",
      "fr-FR": "Indisponible",
      "pt-PT": "Indisponível",
      "pt-BR": "Indisponível",
      "zh-CN": "不可用",
      "ru-RU": "Недоступно",
      "ja-JP": "利用できません"
  },
  "on": {
      "en-US": "On",
      "es-ES": "Encendido",
      "ca-ES": "Encès",
      "it-IT": "Acceso",
      "fr-FR": "Activé",
      "pt-PT": "Ligado",
      "pt-BR": "Ligado",
      "zh-CN": "打开",
      "ru-RU": "Вкл",
      "ja-JP": "オン"
  },
  "Cancel": {
      "en-US": "Cancel",
      "es-ES": "Cancelar",
      "ca-ES": "Cancel·lar",
      "it-IT": "Annulla",
      "fr-FR": "Annuler",
      "pt-PT": "Cancelar",
      "pt-BR": "Cancelar",
      "zh-CN": "取消",
      "ru-RU": "Отмена",
      "ja-JP": "キャンセル"
  },
  "Run": {
      "en-US": "Run",
      "es-ES": "Lanzar",
      "ca-ES": "Executar",
      "it-IT": "Esegui",
      "fr-FR": "Exécuter",
      "pt-PT": "Executar",
      "pt-BR": "Executar",
      "zh-CN": "运行",
      "ru-RU": "Запустить",
      "ja-JP": "実行"
  },
  "An error occurred": {
      "en-US": "An error occurred",
      "es-ES": "Ocurrió un error",
      "ca-ES": "S'ha produït un error",
      "it-IT": "Si è verificato un errore",
      "fr-FR": "Une erreur s'est produite",
      "pt-PT": "Ocorreu um erro",
      "pt-BR": "Ocorreu um erro",
      "zh-CN": "发生错误",
      "ru-RU": "Произошла ошибка",
      "ja-JP": "エラーが発生しました"
  },
  "Brightness": {
      "en-US": "Brightness:",
      "es-ES": "Brillo:",
      "ca-ES": "Lluminositat:",
      "it-IT": "Luminosità:",
      "fr-FR": "Luminosité :",
      "pt-PT": "Luminosidade:",
      "pt-BR": "Brilho:",
      "zh-CN": "亮度：",
      "ru-RU": "Яркость:",
      "ja-JP": "明るさ："
  },
  "Color": {
      "en-US": "Color:",
      "es-ES": "Color:",
      "ca-ES": "Color:",
      "it-IT": "Colore:",
      "fr-FR": "Couleur :",
      "pt-PT": "Cor:",
      "pt-BR": "Cor:",
      "zh-CN": "颜色：",
      "ru-RU": "Цвет:",
      "ja-JP": "色："
  },
  "Effect": {
      "en-US": "Effect:",
      "es-ES": "Efecto:",
      "ca-ES": "Efecte:",
      "it-IT": "Effetto:",
      "fr-FR": "Effet :",
      "pt-PT": "Efeito:",
      "pt-BR": "Efeito:",
      "zh-CN": "效果：",
      "ru-RU": "Эффект:",
      "ja-JP": "効果："
  },
  "Nothing here because the light is off": {
      "en-US": "Nothing here because the light is off",
      "es-ES": "Nada por aquí, porque la luz está apagada",
      "ca-ES": "Res per aquí, perquè la llum està apagada",
      "it-IT": "Niente qui perché la luce è spenta",
      "fr-FR": "Rien ici car la lumière est éteinte",
      "pt-PT": "Nada aqui porque a luz está apagada",
      "pt-BR": "Nada aqui porque a luz está apagada",
      "zh-CN": "因为灯已关闭，所以这里没有任何东西",
      "ru-RU": "Здесь ничего нет, потому что свет выключен",
      "ja-JP": "ライトがオフになっているため、ここには何もありません"
  },
  "Error during sensor update": {
      "en-US": "Error during sensor update",
      "es-ES": "Error durante la actualización de sensores",
      "ca-ES": "Error durant l'actualització dels sensors",
      "it-IT": "Errore durante l'aggiornamento del sensore",
      "fr-FR": "Erreur lors de la mise à jour du capteur",
      "pt-PT": "Erro durante a atualização do sensor",
      "pt-BR": "Erro durante a atualização do sensor",
      "zh-CN": "传感器更新时出错",
      "ru-RU": "Ошибка при обновлении датчика",
      "ja-JP": "センサーの更新中にエラーが発生しました"
  },
  "Updating sensors\nto Home Assistant": {
      "en-US": "Updating sensors\nto Home Assistant",
      "es-ES": "Actualizando sensores\nen Home Assistant",
      "ca-ES": "Actualitzant els sensors\na Home Assistant",
      "it-IT": "Aggiornamento dei sensori\na Home Assistant",
      "fr-FR": "Mise à jour des capteurs\nsur Home Assistant",
      "pt-PT": "Atualizando sensores\npara o Home Assistant",
      "pt-BR": "Atualizando sensores\npara o Home Assistant",
      "zh-CN": "更新传感器\n到 Home Assistant",
      "ru-RU": "Обновление датчиков\nв Home Assistant",
      "ja-JP": "Home Assistant へのセンサーの更新中"
  }
};

export function listTranslations() {
  return strings.name;
}

export function extendLocale(data) {
  logger.debug(data);
  for(let key in data) {
    strings[key] = data[key];
  }
}

export function t(key) {
  if(!strings[key]) return key;

  for(let ln of preferedLang) {
    if(strings[key][ln] === undefined) {
      if (ln === "pt-BR" && strings[key]["pt-PT"] !== undefined) return strings[key]["pt-PT"];
      continue;
    }
    return strings[key][ln];
  }

  return key;
}
