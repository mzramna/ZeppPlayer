// Phone settings page: Home Assistant access, favorites, entities, areas, energy.
// Structured into 5 dedicated tabs: access, favorites, entities, areas, energy.
import { gettext } from "i18n";
import { SETTING } from "../shared/protocol.js";
import { parseJson, readList } from "../shared/validate.js";
import {
  SETTINGS_TABS,
  normalizeTab,
  ENTITY_FILTER_TYPES,
  SENSOR_MODES,
  SYNC_INTERVALS,
  PAGE_SIZE,
  paginate,
  isHttpUrl,
  normalizeNotifyService,
  normalizeStatusEntity,
  readEntities,
  filterEntities,
  setEnabled,
  setFavorite,
  moveToTop,
  moveFavorite,
  groupByArea,
  groupByEnergy,
} from "./logic.js";

const TAB_KEY = "settingsActiveTab"; // active tab: "access" | "favorites" | "entities" | "areas" | "energy"
const FILTER_KEY = "filter"; // entity search text
const TYPE_FILTER_KEY = "entityTypeFilter"; // "interactive" | "sensors" | "all"
const FILTER_FAV_KEY = "filterFav"; // toggle to only show favorite entities
const PAGE_KEY = "entityPage"; // pagination page index for entities
const THEME_KEY = "uiTheme"; // UI theme selection ("dark" | "light")
const ERRORS_KEY = "settingsErrors";
const MODE_LABELS = { none: "Off", zepp2hass: "zepp2hass", mobile_app: "Mobile app", rest: "REST API" };
const RED = "#d32f2f";

const THEMES = {
  dark: {
    bg: "#0f172a",
    cardBg: "#1e293b",
    inputBg: "#0f172a",
    border: "#334155",
    text: "#f8fafc",
    hint: "#94a3b8",
    primary: "#0ea5e9",
    primaryText: "#ffffff",
    accent: "#38bdf8",
    favGold: "#f59e0b",
    secBtnBg: "#334155",
    secBtnText: "#f8fafc",
  },
  light: {
    bg: "#f8fafc",
    cardBg: "#ffffff",
    inputBg: "#f1f5f9",
    border: "#cbd5e1",
    text: "#0f172a",
    hint: "#64748b",
    primary: "#0284c7",
    primaryText: "#ffffff",
    accent: "#0369a1",
    favGold: "#d97706",
    secBtnBg: "#e2e8f0",
    secBtnText: "#0f172a",
  },
};

function statusLine(store, hintStyle, errorStyle) {
  const status = parseJson(store.getItem(SETTING.STATUS) || "", null);
  if (!status) return [];
  return [Text({ style: status.ok ? hintStyle : errorStyle }, String(status.message || ""))];
}

function saveChecked(store, field, key, value, message) {
  if (value !== null) store.setItem(key, value);
  const errors = parseJson(store.getItem(ERRORS_KEY), {});
  if (value === null) errors[field] = message;
  else delete errors[field];
  store.setItem(ERRORS_KEY, JSON.stringify(errors));
}

AppSettingsPage({
  build(props) {
    const store = props.settingsStorage;
    const get = (key) => store.getItem(key) || "";
    const activeTab = normalizeTab(get(TAB_KEY));
    const errors = parseJson(get(ERRORS_KEY), {});
    const mode = get(SETTING.SENSOR_MODE) || "none";
    const theme = get(THEME_KEY) || "dark";
    const palette = THEMES[theme] || THEMES.dark;

    const cardStyle = {
      backgroundColor: palette.cardBg,
      borderRadius: "14px",
      padding: "16px",
      marginBottom: "16px",
      border: `1px solid ${palette.border}`,
    };
    const inputStyle = {
      backgroundColor: palette.inputBg,
      color: palette.text,
      border: `1px solid ${palette.border}`,
      borderRadius: "10px",
      padding: "10px 12px",
      fontSize: "14px",
      height: "40px",
      margin: "6px 0 12px 0",
    };
    const buttonStyle = {
      fontSize: "14px",
      height: "38px",
      borderRadius: "10px",
      margin: "8px 0",
      backgroundColor: palette.primary,
      color: palette.primaryText,
      fontWeight: "bold",
    };
    const topStyle = { fontSize: "12px", height: "26px", borderRadius: "8px", background: "#3ddc84", color: "black", padding: "0 10px" };
    const miniButtonStyle = { fontSize: "12px", height: "26px", borderRadius: "8px", background: palette.secBtnBg, color: palette.secBtnText, margin: "0 2px", padding: "0 8px" };
    const removeStyle = { fontSize: "12px", height: "26px", borderRadius: "8px", background: "#ef4444", color: "white", margin: "0 2px", padding: "0 8px" };
    const prevNextStyle = { fontSize: "12px", height: "28px", borderRadius: "8px", background: palette.secBtnBg, color: palette.secBtnText, padding: "0 12px" };
    const headingStyle = { fontSize: "17px", fontWeight: "bold", paddingLeft: "4px", paddingTop: "6px", paddingBottom: "6px" };
    const sectionTitleStyle = { fontSize: "15px", fontWeight: "bold", paddingLeft: "4px", paddingTop: "10px", paddingBottom: "4px", color: palette.accent };
    const hintStyle = { fontSize: "13px", fontStyle: "italic", paddingLeft: "4px" };
    const errorStyle = { fontSize: "13px", color: RED, paddingLeft: "4px" };
    const rowStyle = { display: "flex", flexDirection: "column", padding: "8px 0", borderBottom: `1px solid ${palette.border}` };
    const favRowStyle = { display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: "4px" };
    const favItemCardStyle = { display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", margin: "4px 0", backgroundColor: palette.inputBg, borderRadius: "8px", border: `1px solid ${palette.border}` };
    const favTitleStyle = { fontSize: "14px", fontWeight: "bold", color: palette.favGold };
    const favActionsStyle = { display: "flex", flexDirection: "row", alignItems: "center" };
    const paginationStyle = { display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", padding: "10px 0" };
    const paginationTextStyle = { fontSize: "13px", fontStyle: "italic", padding: "0 10px" };
    const tabBarStyle = { display: "flex", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: "16px" };
    const pillsBarStyle = { display: "flex", flexDirection: "row", alignItems: "center", margin: "8px 0" };

    const Heading = (msgid) => Section({ style: headingStyle }, gettext(msgid));
    const Subheading = (text) => Section({ style: sectionTitleStyle }, text);
    const Hint = (text) => Text({ style: hintStyle }, text);
    const ErrorText = (text) => Text({ style: errorStyle }, text);

    const saveEntities = (list) => store.setItem(SETTING.ENTITY_LIST, JSON.stringify(list));
    const saveFavorites = (list) => store.setItem(SETTING.FAVORITES, JSON.stringify(list));
    const favorites = readList(get(SETTING.FAVORITES));
    const entities = readEntities(get(SETTING.ENTITY_LIST));

    // Tab buttons bar
    const tabDefs = [
      { id: "access", label: "Access" },
      { id: "favorites", label: "Favorites" },
      { id: "entities", label: "Entities" },
      { id: "areas", label: "Areas" },
      { id: "energy", label: "Energy" },
    ];

    const tabButtons = View({ style: tabBarStyle }, [
      ...tabDefs.map((t) => {
        const isTabActive = activeTab === t.id;
        return Button({
          label: gettext(t.label),
          style: {
            fontSize: "12px",
            height: "32px",
            borderRadius: "8px",
            padding: "0 8px",
            margin: "2px",
            backgroundColor: isTabActive ? palette.primary : palette.secBtnBg,
            color: isTabActive ? palette.primaryText : palette.secBtnText,
            fontWeight: isTabActive ? "bold" : "normal",
          },
          onClick: () => store.setItem(TAB_KEY, t.id),
        });
      }),
    ]);

    // Content for Tab 1: Access
    const renderAccessTab = () => {
      const last = parseJson(get(SETTING.LAST_SYNC), null);
      const lastOk = !!(last && last.ok);
      const lastText = !last
        ? gettext("No sync yet")
        : lastOk
          ? `${gettext("Last sync")}: ${new Date(last.time).toLocaleString()}`
          : `${gettext("Last sync failed")}: ${last.error || ""}`;

      return [
        View({ style: cardStyle }, [
          Heading("Access"),
          Select({
            label: gettext("Theme"),
            value: theme,
            options: [
              { name: gettext("Dark"), value: "dark" },
              { name: gettext("Light"), value: "light" },
            ],
            onChange: (value) => store.setItem(THEME_KEY, value),
          }),
          Hint("e.g. http://homeassistant.local:8123/"),
          TextInput({ label: gettext("IPLocal"), value: get(SETTING.LOCAL_URL), subStyle: inputStyle, onChange: (raw) => store.setItem(SETTING.LOCAL_URL, raw.trim()) }),
          Hint("e.g. https://example.com/"),
          TextInput({ label: gettext("IPExternal"), value: get(SETTING.EXTERNAL_URL), subStyle: inputStyle, onChange: (raw) => store.setItem(SETTING.EXTERNAL_URL, raw.trim()) }),
          Hint(gettext("FromProfile")),
          TextInput({ label: gettext("LongToken"), value: get(SETTING.TOKEN), subStyle: inputStyle, onChange: (raw) => store.setItem(SETTING.TOKEN, raw.trim()) }),
          Button({
            label: gettext("Refresh entities"),
            style: buttonStyle,
            onClick: () => store.setItem(SETTING.REFRESH_ENTITIES, String(Date.now())),
          }),
          Hint(gettext("Loads your entities from Home Assistant. Your choices are kept.")),
          ...statusLine(store, hintStyle, errorStyle),
        ]),
        View({ style: cardStyle }, [
          Heading("Health data sync"),
          Select({
            label: gettext("Send health data to"),
            value: mode,
            options: SENSOR_MODES.map((m) => ({ name: gettext(MODE_LABELS[m]), value: m })),
            onChange: (value) => store.setItem(SETTING.SENSOR_MODE, value),
          }),
          ...(mode !== "none"
            ? [
                Select({
                  label: gettext("Sync every"),
                  value: get(SETTING.SYNC_INTERVAL) || "5",
                  options: SYNC_INTERVALS.map((m) => ({ name: `${m} min`, value: String(m) })),
                  onChange: (value) => store.setItem(SETTING.SYNC_INTERVAL, value),
                }),
              ]
            : []),
          ...(mode === "zepp2hass"
            ? [
                TextInput({
                  label: gettext("zepp2hass webhook URL"),
                  value: get(SETTING.ZEPP2HASS_URL),
                  subStyle: inputStyle,
                  onChange: (raw) => {
                    const url = raw.trim();
                    saveChecked(store, "zepp2hass", SETTING.ZEPP2HASS_URL, isHttpUrl(url) ? url : null, gettext("Must start with http:// or https://"));
                  },
                }),
                errors.zepp2hass && ErrorText(errors.zepp2hass),
              ]
            : []),
          ...(mode === "mobile_app"
            ? [
                Button({
                  label: gettext("Register in Home Assistant"),
                  style: buttonStyle,
                  onClick: () => store.setItem(SETTING.REGISTER_REQUEST, String(Date.now())),
                }),
                Hint(parseJson(get(SETTING.MOBILE_APP), null) ? gettext("Registered in Home Assistant") : gettext("Not registered yet")),
              ]
            : []),
          Text({ style: lastOk || !last ? hintStyle : errorStyle }, lastText),
        ]),
        View({ style: cardStyle }, [
          Heading("Sleep as Android"),
          Hint(gettext("Needs the Home Assistant Companion app on the phone and the sleep_as_android integration.")),
          TextInput({
            label: gettext("Notify service"),
            value: get(SETTING.SAA_NOTIFY_SERVICE),
            subStyle: inputStyle,
            onChange: (raw) => {
              const service = normalizeNotifyService(raw);
              saveChecked(store, "saaNotify", SETTING.SAA_NOTIFY_SERVICE, service, gettext("Letters, digits and _ only, e.g. mobile_app_pixel_8"));
            },
          }),
          errors.saaNotify && ErrorText(errors.saaNotify),
          TextInput({
            label: gettext("Status entity"),
            value: get(SETTING.SAA_STATUS_ENTITY),
            subStyle: inputStyle,
            onChange: (raw) => {
              const entity = normalizeStatusEntity(raw);
              saveChecked(store, "saaStatus", SETTING.SAA_STATUS_ENTITY, entity, gettext("Entity id like sensor.sleep_as_android, or empty"));
            },
          }),
          errors.saaStatus && ErrorText(errors.saaStatus),
        ]),
      ];
    };

    // Content for Tab 2: Favorites
    const renderFavoritesTab = () => {
      const favoriteRows = favorites.map((favId) => {
        const entity = entities.find((e) => e.key === favId);
        const title = entity ? entity.title : favId;
        return View({ style: favItemCardStyle }, [
          Text({ style: favTitleStyle }, `★ ${title} (${favId})`),
          View({ style: favActionsStyle }, [
            Button({
              label: "↑",
              style: miniButtonStyle,
              onClick: () => saveFavorites(moveFavorite(readList(get(SETTING.FAVORITES)), favId, -1)),
            }),
            Button({
              label: "↓",
              style: miniButtonStyle,
              onClick: () => saveFavorites(moveFavorite(readList(get(SETTING.FAVORITES)), favId, 1)),
            }),
            Button({
              label: gettext("Remove"),
              style: removeStyle,
              onClick: () => saveFavorites(setFavorite(readList(get(SETTING.FAVORITES)), favId, false)),
            }),
          ]),
        ]);
      });

      return [
        View({ style: cardStyle }, [
          Heading("Favorites"),
          Hint(gettext("QuickAccessHint")),
          favorites.length === 0 && Hint(gettext("NoFavoritesHint")),
          ...favoriteRows,
        ]),
      ];
    };

    // Content for Tab 3: Entities
    const renderEntitiesTab = () => {
      const filterFav = get(FILTER_FAV_KEY) === "true";
      const typeFilter = get(TYPE_FILTER_KEY) || "interactive";
      const filterText = get(FILTER_KEY);

      const shown = filterEntities(entities, {
        search: filterText,
        type: typeFilter,
        onlyFavorites: filterFav,
        favorites,
      });

      const pageIndex = Number(get(PAGE_KEY)) || 0;
      const { items: pageItems, page, totalPages } = paginate(shown, pageIndex, PAGE_SIZE);

      const pillStyle = (t) => ({
        fontSize: "12px",
        height: "28px",
        borderRadius: "8px",
        padding: "0 10px",
        marginRight: "6px",
        backgroundColor: typeFilter === t ? palette.primary : palette.secBtnBg,
        color: typeFilter === t ? palette.primaryText : palette.secBtnText,
        fontWeight: typeFilter === t ? "bold" : "normal",
      });

      const rows = pageItems.map((item) =>
        View({ style: rowStyle }, [
          Toggle({
            label: `${item.title} (${item.key})`,
            value: item.value === true,
            onChange: (on) => saveEntities(setEnabled(readEntities(get(SETTING.ENTITY_LIST)), item.key, on)),
          }),
          View({ style: favRowStyle }, [
            Toggle({
              label: `★ ${gettext("Favorite")}`,
              value: favorites.includes(item.key),
              onChange: (on) => saveFavorites(setFavorite(readList(get(SETTING.FAVORITES)), item.key, on)),
            }),
            Button({
              label: gettext("Top"),
              style: topStyle,
              onClick: () => saveEntities(moveToTop(readEntities(get(SETTING.ENTITY_LIST)), item.key)),
            }),
          ]),
        ])
      );

      const paginationControls =
        totalPages > 1
          ? [
              View({ style: paginationStyle }, [
                Button({
                  label: gettext("Prev"),
                  style: prevNextStyle,
                  onClick: () => store.setItem(PAGE_KEY, String(Math.max(0, page - 1))),
                }),
                Text({ style: paginationTextStyle }, `${page + 1} / ${totalPages} (${shown.length})`),
                Button({
                  label: gettext("Next"),
                  style: prevNextStyle,
                  onClick: () => store.setItem(PAGE_KEY, String(Math.min(totalPages - 1, page + 1))),
                }),
              ]),
            ]
          : [];

      return [
        View({ style: cardStyle }, [
          Heading("Entities"),
          Hint(gettext("SearchEntities")),
          TextInput({
            label: gettext("Filter"),
            value: get(FILTER_KEY),
            subStyle: inputStyle,
            onChange: (raw) => {
              store.setItem(FILTER_KEY, raw);
              store.setItem(PAGE_KEY, "0");
            },
          }),
          View({ style: pillsBarStyle }, [
            Button({
              label: gettext("Interactive"),
              style: pillStyle("interactive"),
              onClick: () => {
                store.setItem(TYPE_FILTER_KEY, "interactive");
                store.setItem(PAGE_KEY, "0");
              },
            }),
            Button({
              label: gettext("Sensors"),
              style: pillStyle("sensors"),
              onClick: () => {
                store.setItem(TYPE_FILTER_KEY, "sensors");
                store.setItem(PAGE_KEY, "0");
              },
            }),
            Button({
              label: gettext("All"),
              style: pillStyle("all"),
              onClick: () => {
                store.setItem(TYPE_FILTER_KEY, "all");
                store.setItem(PAGE_KEY, "0");
              },
            }),
          ]),
          Toggle({
            label: gettext("Show only favorites"),
            value: filterFav,
            onChange: (on) => {
              store.setItem(FILTER_FAV_KEY, String(on));
              store.setItem(PAGE_KEY, "0");
            },
          }),
          entities.length === 0 && Hint(gettext("Tap Refresh entities to load them from Home Assistant.")),
          entities.length > 0 && shown.length === 0 && Hint(gettext("No entity matches the filter.")),
          ...rows,
          ...paginationControls,
        ]),
      ];
    };

    // Content for Tab 4: Areas
    const renderAreasTab = () => {
      const areaGroups = groupByArea(entities);

      if (areaGroups.length === 0) {
        return [
          View({ style: cardStyle }, [
            Heading("Areas"),
            Hint(gettext("No areas found. Tap Refresh entities to load them.")),
          ]),
        ];
      }

      return [
        View({ style: cardStyle }, [
          Heading("Areas"),
          Hint(gettext("Grouped by area from Home Assistant")),
        ]),
        ...areaGroups.map((group) =>
          View({ style: cardStyle }, [
            Subheading(`📍 ${group.name} (${group.entities.length})`),
            ...group.entities.map((item) =>
              View({ style: rowStyle }, [
                Toggle({
                  label: `${item.title} (${item.key})`,
                  value: item.value === true,
                  onChange: (on) => saveEntities(setEnabled(readEntities(get(SETTING.ENTITY_LIST)), item.key, on)),
                }),
              ])
            ),
          ])
        ),
      ];
    };

    // Content for Tab 5: Energy
    const renderEnergyTab = () => {
      const energyGroups = groupByEnergy(entities);
      const categories = [
        { key: "electricity", icon: "⚡", title: "Electricity" },
        { key: "water", icon: "💧", title: "Water" },
        { key: "gas", icon: "🔥", title: "Gas" },
        { key: "other", icon: "📊", title: "Other" },
      ];
      const totalEnergy = Object.values(energyGroups).reduce((acc, list) => acc + list.length, 0);

      if (totalEnergy === 0) {
        return [
          View({ style: cardStyle }, [
            Heading("Energy"),
            Hint(gettext("No energy sensors found. Tap Refresh entities to load them.")),
          ]),
        ];
      }

      return [
        View({ style: cardStyle }, [
          Heading("Energy"),
          Hint(gettext("Energy and resource sensors")),
        ]),
        ...categories.filter((cat) => energyGroups[cat.key].length > 0).map((cat) =>
          View({ style: cardStyle }, [
            Subheading(`${cat.icon} ${gettext(cat.title)} (${energyGroups[cat.key].length})`),
            ...energyGroups[cat.key].map((item) =>
              View({ style: rowStyle }, [
                Toggle({
                  label: `${item.title} (${item.key})`,
                  value: item.value === true,
                  onChange: (on) => saveEntities(setEnabled(readEntities(get(SETTING.ENTITY_LIST)), item.key, on)),
                }),
              ])
            ),
          ])
        ),
      ];
    };

    let tabContent = [];
    if (activeTab === "access") {
      tabContent = renderAccessTab();
    } else if (activeTab === "favorites") {
      tabContent = renderFavoritesTab();
    } else if (activeTab === "entities") {
      tabContent = renderEntitiesTab();
    } else if (activeTab === "areas") {
      tabContent = renderAreasTab();
    } else if (activeTab === "energy") {
      tabContent = renderEnergyTab();
    }

    return View({ style: { padding: "12px 16px", backgroundColor: palette.bg, minHeight: "100vh" } }, [
      tabButtons,
      ...tabContent,
    ]);
  },
});
