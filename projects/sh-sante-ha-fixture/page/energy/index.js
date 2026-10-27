import * as hmUI from "@zos/ui";
import { getText } from "@zos/i18n";
import { onGesture, offGesture, onDigitalCrown, offDigitalCrown, GESTURE_LEFT, GESTURE_RIGHT } from "@zos/interaction";
import { BasePage } from "@zeppos/zml/base-page";
import { METHOD } from "../../shared/protocol.js";
import { W, CX, TOP, MARGIN, COLOR, FONT } from "../../utils/theme.js";
import { createTracked, clear, title, message, loading, entityCard, actionButton } from "../../utils/ui.js";

const PAGE_SIZE = 4;

export const TABS = [
  { id: "electricity", icon: "⚡", label: "Elétrica" },
  { id: "water", icon: "💧", label: "Água" },
  { id: "gas", icon: "🔥", label: "Gás" },
  { id: "other", icon: "📊", label: "Outros" },
];

export function categorizeEnergy(entities = []) {
  const result = { electricity: [], water: [], gas: [], other: [] };
  for (const en of entities) {
    if (!en || !en.entity_id) continue;
    const id = en.entity_id.toLowerCase();
    const domain = id.split(".")[0];
    if (domain !== "sensor") continue;
    const dc = (en.attributes?.device_class || "").toLowerCase();
    const unit = (en.unit || en.attributes?.unit_of_measurement || "").toLowerCase();

    if (dc === "gas" || id.includes("gas")) {
      result.gas.push(en);
    } else if (dc === "water" || id.includes("water") || id.includes("agua") || unit === "l" || unit === "gal" || (unit === "m³" && id.includes("water"))) {
      result.water.push(en);
    } else if (
      dc === "energy" || dc === "power" || dc === "battery" || dc === "monetary" ||
      ["kwh", "wh", "w", "kw", "va", "v", "a"].includes(unit) ||
      id.includes("energy") || id.includes("power") || id.includes("kwh") || id.includes("consumo") || id.includes("electric") || id.includes("eletric")
    ) {
      result.electricity.push(en);
    } else {
      result.other.push(en);
    }
  }
  return result;
}

Page(
  BasePage({
    state: {
      widgets: [],
      alive: false,
      tabIndex: 0,
      pageIndex: 0,
      categories: { electricity: [], water: [], gas: [], other: [] },
      gestureHandler: null,
      crownHandler: null,
    },
    build() {
      this.state.alive = true;
      loading(this.state.widgets);
      this.setupControls();
      this.load();
    },
    setupControls() {
      const s = this.state;
      s.gestureHandler = (event) => {
        if (!s.alive) return false;
        if (event === GESTURE_LEFT) {
          s.tabIndex = (s.tabIndex + 1) % TABS.length;
          s.pageIndex = 0;
          this.render();
          return true;
        }
        if (event === GESTURE_RIGHT) {
          if (s.tabIndex > 0) {
            s.tabIndex = s.tabIndex - 1;
            s.pageIndex = 0;
            this.render();
            return true;
          }
          return false;
        }
        return false;
      };
      onGesture(s.gestureHandler);

      s.crownHandler = (keyOrEvent, maybeDegree) => {
        if (!s.alive) return;
        const delta = typeof maybeDegree === "number" ? maybeDegree : ((keyOrEvent?.degree ?? Number(keyOrEvent)) || 0);
        if (!delta) return;
        const activeTab = TABS[s.tabIndex].id;
        const items = s.categories[activeTab] || [];
        const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
        if (delta > 0 && s.pageIndex < totalPages - 1) {
          s.pageIndex++;
          this.render();
        } else if (delta < 0 && s.pageIndex > 0) {
          s.pageIndex--;
          this.render();
        }
      };
      onDigitalCrown(s.crownHandler);
    },
    load() {
      return this.request({ method: METHOD.GET_ENTITIES, params: {} })
        .then((entities) => {
          if (!this.state.alive) return;
          this.state.categories = categorizeEnergy(entities);
          clear(this.state.widgets);
          this.render();
        })
        .catch((e) => {
          if (!this.state.alive) return;
          clear(this.state.widgets);
          message(this.state.widgets, (e && e.message) || String(e), COLOR.danger);
        });
    },
    render() {
      clear(this.state.widgets);
      const list = this.state.widgets;
      const s = this.state;

      const pageTitle = getText("energy") && getText("energy") !== "energy" ? getText("energy") : "Energia";
      title(list, pageTitle, 20);

      // Render tab buttons
      const tabWidth = 84;
      const startX = CX - (tabWidth * TABS.length) / 2;
      const tabY = 68;

      TABS.forEach((tab, index) => {
        const isActive = index === s.tabIndex;
        actionButton(list, {
          x: startX + index * tabWidth,
          y: tabY,
          w: tabWidth - 8,
          h: 44,
          text: tab.icon,
          color: isActive ? COLOR.accent : COLOR.card,
          onClick: () => {
            if (s.tabIndex !== index) {
              s.tabIndex = index;
              s.pageIndex = 0;
              this.render();
            }
          },
        });
      });

      const currentTab = TABS[s.tabIndex];
      const items = s.categories[currentTab.id] || [];

      let y = tabY + 54;
      if (!items.length) {
        message(list, getText("no_entities") || "No entities");
        return;
      }

      const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
      if (s.pageIndex >= totalPages) s.pageIndex = totalPages - 1;
      if (s.pageIndex < 0) s.pageIndex = 0;

      const visible = items.slice(s.pageIndex * PAGE_SIZE, (s.pageIndex + 1) * PAGE_SIZE);
      for (const entity of visible) {
        y = entityCard(list, { y, entity, h: 80 });
      }

      if (totalPages > 1) {
        createTracked(list, hmUI.widget.TEXT, {
          x: MARGIN,
          y,
          w: W - MARGIN * 2,
          h: 32,
          text: `${s.pageIndex + 1}/${totalPages}`,
          color: COLOR.textDim,
          text_size: FONT.small,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
        });
      }
    },
    onDestroy() {
      this.state.alive = false;
      if (this.state.gestureHandler) {
        offGesture(this.state.gestureHandler);
        this.state.gestureHandler = null;
      }
      if (this.state.crownHandler) {
        offDigitalCrown(this.state.crownHandler);
        this.state.crownHandler = null;
      }
      clear(this.state.widgets);
    },
  })
);
