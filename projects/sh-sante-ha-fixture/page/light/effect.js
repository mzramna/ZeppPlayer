import * as hmUI from "@zos/ui";
import { getText } from "@zos/i18n";
import { back } from "@zos/router";
import { COLOR, DOMAINS, FONT, MARGIN, RADIUS, W } from "../../utils/theme.js";
import { entityPage } from "../../utils/entity-page.js";
import { createTracked, title } from "../../utils/ui.js";

const FIRST_ROW_Y = 84;
const ROW_H = 74; // card 64 + 10 gap
// shortcut: only the first 40 effects, WLED lights have ~180 and each row costs two widgets; add paging when needed
const MAX_EFFECTS = 40;

Page(
  entityPage({
    domain: "light",
    draw(entity, w) {
      // Stay on the list when HA rejected the change, so its error toast is seen.
      const apply = (name) => this.act("turn_on", { effect: name }).then((ok) => ok && back());
      title(w, getText("effect"));
      (entity.attributes.effect_list || []).slice(0, MAX_EFFECTS).forEach((name, i) => {
        const current = name === entity.attributes.effect;
        const y = FIRST_ROW_Y + i * ROW_H;
        const card = createTracked(w, hmUI.widget.FILL_RECT, {
          x: MARGIN, y, w: W - MARGIN * 2, h: 64, radius: RADIUS,
          color: current ? DOMAINS.light.color : COLOR.card,
        });
        const label = createTracked(w, hmUI.widget.TEXT, {
          x: MARGIN + 20, y, w: W - MARGIN * 2 - 40, h: 64, text: name, text_size: FONT.body,
          color: current ? COLOR.bg : COLOR.text,
          align_v: hmUI.align.CENTER_V, text_style: hmUI.text_style.ELLIPSIS,
        });
        // Clicks on the label must select too, since it sits on top of the card.
        for (const el of [card, label]) el.addEventListener(hmUI.event.CLICK_UP, () => apply(name));
      });
    },
  })
);
